import Decimal from 'decimal.js';
import { HDNodeWallet, getAddress } from 'ethers';
import { D, dec, fmt, toDb, WS } from '@tradeteam/shared';
import { exec, one, query, tx } from '../../infrastructure/db';
import { decrypt } from '../../infrastructure/crypto';
import { Errors } from '../../http/errors';
import { getSetting } from '../settings/settings.service';
import { publishUser } from '../../websocket/bus';
import { notify } from '../notifications/notifications.service';
import { BalanceSession, publishBalances } from './ledger';
import { assetBySymbol, assetSymbol } from './assets-cache';
import { getNetworkFee } from '../trading/fees';
import { acquire, dispose, refPrice } from '../trading/cost-basis';
import { findUserByUid } from '../users/users.repo';

export interface NetworkRow {
  id: number;
  asset_id: number;
  code: string;
  name: string;
  chain_family: 'evm' | 'bitcoin' | 'tron' | 'solana' | 'other';
  deposit_mode: 'xpub' | 'static';
  xpub_enc: string | null;
  static_address: string | null;
  contract_address: string | null;
  memo_required: number;
  address_regex: string | null;
  explorer_tx_url: string | null;
  confirmations: number;
  min_deposit: string;
  min_withdraw: string;
  deposit_enabled: number;
  withdraw_enabled: number;
  status: string;
}

export async function balances(userId: number) {
  const rows = await query<{
    symbol: string;
    name: string | null;
    logo_url: string | null;
    precision: number;
    available: string;
    locked: string;
  }>(
    `SELECT a.symbol, a.name, a.logo_url, a.precision, b.available, b.locked FROM balances b JOIN assets a ON a.id = b.asset_id
     WHERE b.user_id = ? AND (b.available > 0 OR b.locked > 0) ORDER BY a.symbol`,
    [userId],
  );
  let totalRef = new D(0);
  let availableRef = new D(0);
  let lockedRef = new D(0);
  const items = rows.map((r) => {
    const px = refPrice(r.symbol);
    const total = dec(r.available).plus(r.locked);
    const value = px ? total.times(px) : null;
    if (value) {
      totalRef = totalRef.plus(value);
      availableRef = availableRef.plus(dec(r.available).times(px!));
      lockedRef = lockedRef.plus(dec(r.locked).times(px!));
    }
    return {
      asset: r.symbol,
      name: r.name,
      logoUrl: r.logo_url,
      available: fmt(r.available),
      locked: fmt(r.locked),
      total: fmt(total),
      price: px ? fmt(px.toDecimalPlaces(8)) : null,
      value: value ? fmt(value.toDecimalPlaces(2)) : null,
    };
  });
  items.sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
  return {
    items,
    totalValue: fmt(totalRef.toDecimalPlaces(2)),
    availableValue: fmt(availableRef.toDecimalPlaces(2)),
    lockedValue: fmt(lockedRef.toDecimalPlaces(2)),
    currency: 'USDT',
  };
}

export async function networksFor(asset: string) {
  const a = await assetBySymbol(asset);
  if (!a) throw Errors.notFound('Asset not found');
  const rows = await query<NetworkRow>(
    "SELECT * FROM networks WHERE asset_id = ? AND status = 'active' ORDER BY id",
    [a.id],
  );
  return rows.map((n) => {
    const wf = getNetworkFee('withdrawal', Number(n.id));
    return {
      id: String(n.id),
      code: n.code,
      name: n.name,
      memoRequired: Boolean(n.memo_required),
      confirmations: n.confirmations,
      minDeposit: fmt(n.min_deposit),
      minWithdraw: fmt(n.min_withdraw),
      withdrawFee: fmt(wf.fixed),
      withdrawFeePercent: fmt(wf.percent),
      depositEnabled: Boolean(n.deposit_enabled) && n.deposit_mode !== null,
      withdrawEnabled: Boolean(n.withdraw_enabled),
      contractAddress: n.contract_address,
    };
  });
}

async function network(asset: string, code: string) {
  const a = await assetBySymbol(asset);
  if (!a) throw Errors.notFound('Asset not found');
  const n = await one<NetworkRow>(
    "SELECT * FROM networks WHERE asset_id = ? AND code = ? AND status = 'active'",
    [a.id, code],
  );
  if (!n) throw Errors.notFound('Network not found');
  n.id = Number(n.id);
  const assetRow = await one<{ deposit_enabled: number; withdraw_enabled: number; status: string }>(
    'SELECT deposit_enabled, withdraw_enabled, status FROM assets WHERE id = ?',
    [a.id],
  );
  return { a, n, assetRow: assetRow! };
}

/**
 * Deposit addresses. The server never holds private keys:
 *  - xpub mode (EVM): addresses are derived from an extended *public* key at index = user id, so
 *    each user has one stable address per chain; sweeping/signing happens in offline custody.
 *  - static mode: a shared address plus a per-user memo/tag (XRP, XLM, ATOM, …).
 */
export async function depositAddress(userId: number, asset: string, code: string) {
  const { n, assetRow } = await network(asset, code);
  if (!n.deposit_enabled || !assetRow.deposit_enabled)
    throw Errors.conflict('Deposits are currently disabled for this asset/network', 'deposit_disabled');
  const existing = await one<{ address: string; memo: string | null }>(
    'SELECT address, memo FROM wallet_addresses WHERE user_id = ? AND network_id = ?',
    [userId, n.id],
  );
  if (existing)
    return {
      address: existing.address,
      memo: existing.memo,
      network: n.code,
      confirmations: n.confirmations,
      minDeposit: fmt(n.min_deposit),
    };
  let address: string;
  let memo: string | null = null;
  let index: number | null = null;
  if (n.deposit_mode === 'xpub') {
    if (n.chain_family !== 'evm' || !n.xpub_enc)
      throw Errors.unavailable('Deposit address generation is not configured for this network');
    const node = HDNodeWallet.fromExtendedKey(decrypt(n.xpub_enc, `xpub:${n.id}`));
    index = userId;
    address = getAddress(node.deriveChild(index).address);
  } else {
    if (!n.static_address) throw Errors.unavailable('Deposit address is not configured for this network');
    address = n.static_address;
    if (n.memo_required) {
      const u = await one<{ uid: string }>('SELECT uid FROM users WHERE id = ?', [userId]);
      memo = u!.uid;
    }
  }
  await exec(
    'INSERT IGNORE INTO wallet_addresses (user_id, network_id, address, memo, derivation_index) VALUES (?,?,?,?,?)',
    [userId, n.id, address, memo, index],
  );
  return { address, memo, network: n.code, confirmations: n.confirmations, minDeposit: fmt(n.min_deposit) };
}

export function withdrawalFee(networkId: number, amount: Decimal) {
  const f = getNetworkFee('withdrawal', networkId);
  return dec(f.fixed).plus(amount.times(f.percent)).toDecimalPlaces(18, Decimal.ROUND_UP);
}

export async function requestWithdrawal(
  userId: number,
  input: { asset: string; network: string; address: string; memo?: string; amount: string },
  meta: { ip: string; method: string },
) {
  if (getSetting('maintenance.enabled')) throw Errors.unavailable('Withdrawals are paused for maintenance');
  const { a, n, assetRow } = await network(input.asset, input.network);
  if (!n.withdraw_enabled || !assetRow.withdraw_enabled)
    throw Errors.conflict('Withdrawals are currently disabled for this asset/network', 'withdraw_disabled');
  const amount = dec(input.amount);
  if (amount.lte(0)) throw Errors.validation([{ path: 'amount', message: 'Invalid amount' }]);
  if (amount.lt(n.min_withdraw))
    throw Errors.validation([
      { path: 'amount', message: `Minimum withdrawal is ${fmt(n.min_withdraw)} ${a.symbol}` },
    ]);
  if (n.address_regex && !new RegExp(n.address_regex).test(input.address))
    throw Errors.validation([{ path: 'address', message: 'Invalid address for this network' }]);
  if (n.chain_family === 'evm') {
    try {
      getAddress(input.address);
    } catch {
      throw Errors.validation([{ path: 'address', message: 'Invalid address checksum' }]);
    }
  }
  if (n.memo_required && !input.memo)
    throw Errors.validation([{ path: 'memo', message: 'Memo / tag is required for this network' }]);
  const own = await one(
    'SELECT id FROM wallet_addresses WHERE user_id = ? AND network_id = ? AND address = ?',
    [userId, n.id, input.address],
  );
  if (own)
    throw Errors.validation([
      { path: 'address', message: 'You cannot withdraw to your own deposit address' },
    ]);
  const fee = withdrawalFee(n.id, amount);
  const total = amount.plus(fee);

  // Daily limit in reference currency.
  const px = refPrice(a.symbol);
  const limit = dec(getSetting('withdrawal.daily_limit_usd'));
  if (px) {
    const today = await query<{ symbol: string; amt: string }>(
      `SELECT a.symbol, SUM(w.amount) AS amt FROM withdrawals w JOIN assets a ON a.id = w.asset_id
       WHERE w.user_id = ? AND w.created_at >= NOW() - INTERVAL 1 DAY AND w.status NOT IN ('rejected','cancelled','failed') GROUP BY a.symbol`,
      [userId],
    );
    const used = today.reduce((acc, r) => acc.plus(dec(r.amt).times(refPrice(r.symbol) ?? 0)), new D(0));
    if (used.plus(amount.times(px)).gt(limit))
      throw Errors.conflict(`Daily withdrawal limit of ${fmt(limit)} USDT exceeded`, 'limit_exceeded');
  }

  const status = getSetting('withdrawal.manual_review_all') ? 'manual_review' : 'pending';
  let id = 0;
  let bal: ReturnType<BalanceSession['changed']> = [];
  await tx(async (c) => {
    const bs = new BalanceSession(c);
    await bs.lock([[userId, a.id]]);
    if (bs.get(userId, a.id).available.lt(total))
      throw Errors.insufficient(`Insufficient ${a.symbol} balance (amount + fee ${fmt(total)})`);
    const r = await exec(
      `INSERT INTO withdrawals (user_id, asset_id, network_id, address, memo, amount, fee, total, status, verification_method, ip) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        a.id,
        n.id,
        input.address,
        input.memo ?? null,
        toDb(amount),
        toDb(fee),
        toDb(total),
        status,
        meta.method,
        meta.ip,
      ],
      c,
    );
    id = r.insertId;
    await bs.apply({
      userId,
      assetId: a.id,
      available: total.neg(),
      locked: total,
      type: 'order_lock',
      refType: 'withdrawal',
      refId: id,
    });
    await exec(
      "INSERT INTO transactions (user_id, type, asset_id, amount, fee, status, ref_type, ref_id, description) VALUES (?, 'withdrawal', ?, ?, ?, ?, 'withdrawal', ?, ?)",
      [
        userId,
        a.id,
        toDb(amount),
        toDb(fee),
        status,
        String(id),
        `Withdraw to ${input.address.slice(0, 10)}… (${n.code})`,
      ],
      c,
    );
    bal = bs.changed(assetSymbol);
  });
  publishBalances(bal);
  await notify(
    userId,
    'withdrawal_requested',
    'Withdrawal requested',
    `Withdrawal of ${fmt(amount)} ${a.symbol} to ${input.address} (${n.code}) is being processed.`,
    { withdrawalId: String(id) },
    { email: true },
  );
  return { id: String(id), status, amount: fmt(amount), fee: fmt(fee), total: fmt(total) };
}

/** Final state transitions for withdrawals (user cancel / admin reject / admin complete). */
export async function settleWithdrawal(
  id: number,
  action: 'cancel' | 'reject' | 'complete' | 'approve' | 'processing',
  opts: { byUserId?: number; adminId?: number; reason?: string; txid?: string } = {},
) {
  let bal: ReturnType<BalanceSession['changed']> = [];
  let row!: {
    user_id: number;
    asset_id: number;
    amount: string;
    fee: string;
    total: string;
    status: string;
    address: string;
  };
  await tx(async (c) => {
    const w = await one<typeof row>(
      'SELECT user_id, asset_id, amount, fee, total, status, address FROM withdrawals WHERE id = ? FOR UPDATE',
      [id],
      c,
    );
    if (!w) throw Errors.notFound('Withdrawal not found');
    row = w;
    const uid = Number(w.user_id);
    const aid = Number(w.asset_id);
    if (opts.byUserId && opts.byUserId !== uid) throw Errors.notFound('Withdrawal not found');
    const bs = new BalanceSession(c);
    const open = ['pending', 'manual_review', 'approved'];
    if (action === 'cancel' || action === 'reject') {
      if (!open.includes(w.status) || (action === 'cancel' && w.status === 'approved'))
        throw Errors.conflict('Withdrawal can no longer be cancelled');
      await bs.apply({
        userId: uid,
        assetId: aid,
        available: w.total,
        locked: dec(w.total).neg(),
        type: 'withdrawal_refund',
        refType: 'withdrawal',
        refId: id,
      });
      const st = action === 'cancel' ? 'cancelled' : 'rejected';
      await exec(
        'UPDATE withdrawals SET status = ?, reject_reason = ?, reviewed_by = ? WHERE id = ?',
        [st, opts.reason ?? null, opts.adminId ?? null, id],
        c,
      );
      await exec(
        "UPDATE transactions SET status = ? WHERE user_id = ? AND ref_type = 'withdrawal' AND ref_id = ?",
        [st, uid, String(id)],
        c,
      );
    } else if (action === 'approve') {
      if (!['pending', 'manual_review'].includes(w.status))
        throw Errors.conflict('Withdrawal is not awaiting approval');
      await exec(
        "UPDATE withdrawals SET status = 'approved', reviewed_by = ? WHERE id = ?",
        [opts.adminId ?? null, id],
        c,
      );
      await exec(
        "UPDATE transactions SET status = 'approved' WHERE user_id = ? AND ref_type = 'withdrawal' AND ref_id = ?",
        [uid, String(id)],
        c,
      );
    } else if (action === 'processing') {
      if (w.status !== 'approved') throw Errors.conflict('Withdrawal must be approved first');
      await exec("UPDATE withdrawals SET status = 'processing' WHERE id = ?", [id], c);
    } else {
      if (!['approved', 'processing'].includes(w.status))
        throw Errors.conflict('Withdrawal must be approved before completion');
      if (!opts.txid) throw Errors.validation([{ path: 'txid', message: 'Transaction hash is required' }]);
      await bs.apply({
        userId: uid,
        assetId: aid,
        available: 0,
        locked: dec(w.amount).neg(),
        type: 'withdrawal',
        refType: 'withdrawal',
        refId: id,
      });
      if (dec(w.fee).gt(0))
        await bs.apply({
          userId: uid,
          assetId: aid,
          available: 0,
          locked: dec(w.fee).neg(),
          type: 'withdrawal_fee',
          refType: 'withdrawal',
          refId: id,
        });
      await exec(
        "UPDATE withdrawals SET status = 'completed', txid = ?, completed_at = NOW(3) WHERE id = ?",
        [opts.txid, id],
        c,
      );
      await exec(
        "UPDATE transactions SET status = 'completed' WHERE user_id = ? AND ref_type = 'withdrawal' AND ref_id = ?",
        [uid, String(id)],
        c,
      );
      await dispose(c, uid, aid, dec(w.amount), null);
    }
    bal = bs.changed(assetSymbol);
  });
  publishBalances(bal);
  const uid = Number(row.user_id);
  const sym = assetSymbol(Number(row.asset_id));
  if (action === 'complete')
    await notify(
      uid,
      'withdrawal_completed',
      'Withdrawal completed',
      `${fmt(row.amount)} ${sym} was sent to ${row.address}. Tx: ${opts.txid}`,
      { withdrawalId: String(id) },
      { email: true },
    );
  if (action === 'reject')
    await notify(
      uid,
      'withdrawal_rejected',
      'Withdrawal rejected',
      `Your withdrawal of ${fmt(row.amount)} ${sym} was rejected${opts.reason ? `: ${opts.reason}` : ''}. Funds were returned to your balance.`,
      { withdrawalId: String(id) },
      { email: true },
    );
  publishUser(uid, 'withdrawal:updated', { id: String(id) });
}

/**
 * Deposit ingestion (from a signed chain-watcher / custody webhook, or admin manual entry).
 * Idempotent on (network, txid, output index). Credits exactly once, when confirmations reach
 * the network's requirement.
 */
export async function ingestDeposit(input: {
  network: string;
  asset: string;
  address: string;
  memo?: string | null;
  txid: string;
  outputIndex?: number;
  amount: string;
  confirmations: number;
  source: 'webhook' | 'manual';
  adminId?: number;
}) {
  const { a, n } = await network(input.asset, input.network);
  const addr = await one<{ user_id: number }>(
    'SELECT user_id FROM wallet_addresses WHERE network_id = ? AND address = ? AND (memo <=> ?)',
    [n.id, input.address, n.memo_required ? (input.memo ?? null) : null],
  );
  if (!addr) throw Errors.notFound('Unknown deposit address');
  const userId = Number(addr.user_id);
  const amount = dec(input.amount);
  if (amount.lte(0)) throw Errors.validation([{ path: 'amount', message: 'Invalid amount' }]);
  await exec(
    `INSERT INTO deposits (user_id, asset_id, network_id, address, memo, amount, txid, output_index, confirmations, required_confirmations, status, source, reviewed_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE confirmations = GREATEST(confirmations, VALUES(confirmations)), status = IF(status IN ('pending','confirming'), IF(VALUES(confirmations) > 0, 'confirming', status), status)`,
    [
      userId,
      a.id,
      n.id,
      input.address,
      input.memo ?? null,
      toDb(amount),
      input.txid,
      input.outputIndex ?? 0,
      input.confirmations,
      n.confirmations,
      amount.lt(n.min_deposit) ? 'manual_review' : input.confirmations > 0 ? 'confirming' : 'pending',
      input.source,
      input.adminId ?? null,
    ],
  );
  const dep = await one<{ id: number; status: string; confirmations: number; amount: string }>(
    'SELECT id, status, confirmations, amount FROM deposits WHERE network_id = ? AND txid = ? AND output_index = ?',
    [n.id, input.txid, input.outputIndex ?? 0],
  );
  if (!dep) throw new Error('deposit upsert failed');
  if (!dec(dep.amount).eq(amount)) {
    await exec(
      "UPDATE deposits SET status = 'manual_review', note = 'amount mismatch between notifications' WHERE id = ? AND status <> 'credited'",
      [dep.id],
    );
    return { id: String(dep.id), status: 'manual_review' };
  }
  if (['pending', 'confirming'].includes(dep.status) && dep.confirmations >= n.confirmations)
    await creditDeposit(Number(dep.id));
  const fin = await one<{ status: string }>('SELECT status FROM deposits WHERE id = ?', [dep.id]);
  return { id: String(dep.id), status: fin!.status };
}

export async function creditDeposit(depositId: number, adminId?: number) {
  let bal: ReturnType<BalanceSession['changed']> = [];
  let d!: { user_id: number; asset_id: number; amount: string; status: string; network_id: number };
  let credited = false;
  await tx(async (c) => {
    d = (await one<typeof d>(
      'SELECT user_id, asset_id, amount, status, network_id FROM deposits WHERE id = ? FOR UPDATE',
      [depositId],
      c,
    ))!;
    if (!d) throw Errors.notFound('Deposit not found');
    if (d.status === 'credited') return;
    if (d.status === 'failed') throw Errors.conflict('Deposit was marked failed');
    const uid = Number(d.user_id);
    const aid = Number(d.asset_id);
    const fee = getNetworkFee('deposit', Number(d.network_id));
    const amount = dec(d.amount);
    const feeAmt = dec(fee.fixed).plus(amount.times(fee.percent));
    const net = Decimal.max(0, amount.minus(feeAmt));
    const bs = new BalanceSession(c);
    await bs.apply({
      userId: uid,
      assetId: aid,
      available: net,
      locked: 0,
      type: 'deposit',
      refType: 'deposit',
      refId: depositId,
    });
    await exec(
      "UPDATE deposits SET status = 'credited', credited_at = NOW(3), reviewed_by = COALESCE(?, reviewed_by) WHERE id = ?",
      [adminId ?? null, depositId],
      c,
    );
    await exec(
      "INSERT IGNORE INTO transactions (user_id, type, asset_id, amount, fee, status, ref_type, ref_id, description) VALUES (?, 'deposit', ?, ?, ?, 'completed', 'deposit', ?, 'Deposit')",
      [uid, aid, toDb(net), toDb(feeAmt), String(depositId)],
      c,
    );
    const px = refPrice(assetSymbol(aid));
    if (px) await acquire(c, uid, aid, net, net.times(px));
    bal = bs.changed(assetSymbol);
    credited = true;
  });
  if (!credited) return;
  publishBalances(bal);
  await notify(
    Number(d.user_id),
    'deposit_received',
    'Deposit received',
    `${fmt(d.amount)} ${assetSymbol(Number(d.asset_id))} has been credited to your account.`,
    { depositId: String(depositId) },
    { email: true },
  );
}

export async function internalTransfer(
  fromUserId: number,
  input: { toUid: string; asset: string; amount: string; note?: string },
) {
  const to = await findUserByUid(input.toUid);
  if (!to || to.status !== 'active') throw Errors.notFound('Recipient not found');
  if (to.id === fromUserId) throw Errors.badRequest('You cannot transfer to yourself');
  const a = await assetBySymbol(input.asset);
  if (!a) throw Errors.notFound('Asset not found');
  const amount = dec(input.amount);
  if (amount.lte(0)) throw Errors.validation([{ path: 'amount', message: 'Invalid amount' }]);
  let bal: ReturnType<BalanceSession['changed']> = [];
  let ref = '';
  await tx(async (c) => {
    const bs = new BalanceSession(c);
    await bs.lock([
      [fromUserId, a.id],
      [Number(to.id), a.id],
    ]);
    if (bs.get(fromUserId, a.id).available.lt(amount))
      throw Errors.insufficient(`Insufficient ${a.symbol} balance`);
    ref = `${fromUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await bs.apply({
      userId: fromUserId,
      assetId: a.id,
      available: amount.neg(),
      locked: 0,
      type: 'transfer_out',
      refType: 'transfer',
      refId: ref,
      memo: input.note,
    });
    await bs.apply({
      userId: Number(to.id),
      assetId: a.id,
      available: amount,
      locked: 0,
      type: 'transfer_in',
      refType: 'transfer',
      refId: ref,
      memo: input.note,
    });
    await exec(
      "INSERT INTO transactions (user_id, type, asset_id, amount, status, ref_type, ref_id, description) VALUES (?, 'transfer_out', ?, ?, 'completed', 'transfer', ?, ?), (?, 'transfer_in', ?, ?, 'completed', 'transfer', ?, ?)",
      [
        fromUserId,
        a.id,
        toDb(amount),
        ref,
        `To UID ${to.uid}`,
        Number(to.id),
        a.id,
        toDb(amount),
        ref,
        'Internal transfer received',
      ],
      c,
    );
    const px = refPrice(a.symbol);
    await dispose(c, fromUserId, a.id, amount, null);
    if (px) await acquire(c, Number(to.id), a.id, amount, amount.times(px));
    bal = bs.changed(assetSymbol);
  });
  publishBalances(bal);
  await notify(
    fromUserId,
    'transfer',
    'Transfer sent',
    `You sent ${fmt(amount)} ${a.symbol} to UID ${to.uid}.`,
  );
  await notify(
    Number(to.id),
    'transfer',
    'Transfer received',
    `You received ${fmt(amount)} ${a.symbol}.`,
    {},
    { email: true },
  );
  return { reference: ref };
}

export { WS };
