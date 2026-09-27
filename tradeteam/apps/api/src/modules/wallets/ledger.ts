import type { PoolConnection } from 'mysql2/promise';
import Decimal from 'decimal.js';
import { D, dec, fmt, toDb, WS } from '@tradeteam/shared';
import { exec, query } from '../../infrastructure/db';
import { Errors } from '../../http/errors';
import { publishUser } from '../../websocket/bus';

/**
 * The only code path that mutates balances.
 *
 * Every change is (1) performed on a row locked with SELECT … FOR UPDATE inside the caller's
 * transaction, (2) validated so neither `available` nor `locked` can go negative (also enforced
 * by CHECK constraints), and (3) recorded as an append-only ledger entry holding the deltas and
 * resulting balances. Rows are locked in a deterministic order to avoid deadlocks.
 */
export type LedgerType =
  | 'deposit'
  | 'withdrawal'
  | 'withdrawal_fee'
  | 'withdrawal_refund'
  | 'order_lock'
  | 'order_unlock'
  | 'trade_debit'
  | 'trade_credit'
  | 'trade_fee'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment';

export interface BalanceChange {
  userId: number;
  assetId: number;
  available: Decimal.Value; // delta
  locked: Decimal.Value; // delta
  type: LedgerType;
  refType: string;
  refId: string | number;
  memo?: string;
}

interface BalRow {
  wallet_id: number;
  asset_id: number;
  user_id: number;
  available: string;
  locked: string;
}

export class BalanceSession {
  private rows = new Map<
    string,
    {
      walletId: number;
      available: Decimal;
      locked: Decimal;
      assetId: number;
      userId: number;
      symbol?: string;
    }
  >();
  readonly touched = new Set<string>();

  constructor(private readonly c: PoolConnection) {}

  private k(u: number, a: number) {
    return `${u}:${a}`;
  }

  /** Lock (and create if missing) all balance rows needed by this transaction, in sorted order. */
  async lock(pairs: [userId: number, assetId: number][]) {
    const uniq = [
      ...new Map(pairs.map(([u, a]) => [this.k(u, a), [u, a] as [number, number]])).values(),
    ].filter(([u, a]) => !this.rows.has(this.k(u, a)));
    if (!uniq.length) return;
    const users = [...new Set(uniq.map(([u]) => u))];
    const wallets = await query<{ id: number; user_id: number }>(
      `SELECT id, user_id FROM wallets WHERE type = 'spot' AND user_id IN (${users.map(() => '?').join(',')})`,
      users,
      this.c,
    );
    const walletOf = new Map(wallets.map((w) => [Number(w.user_id), Number(w.id)]));
    for (const u of users) {
      if (!walletOf.has(u)) {
        await exec("INSERT IGNORE INTO wallets (user_id, type) VALUES (?, 'spot')", [u], this.c);
        const w = await query<{ id: number }>(
          "SELECT id FROM wallets WHERE user_id = ? AND type = 'spot'",
          [u],
          this.c,
        );
        walletOf.set(u, Number(w[0]!.id));
      }
    }
    const keyed = uniq
      .map(([u, a]) => ({ u, a, w: walletOf.get(u)! }))
      .sort((x, y) => x.w - y.w || x.a - y.a);
    for (const { u, a, w } of keyed) {
      await exec(
        'INSERT IGNORE INTO balances (wallet_id, asset_id, user_id) VALUES (?,?,?)',
        [w, a, u],
        this.c,
      );
    }
    for (const { u, a, w } of keyed) {
      const r = await query<BalRow>(
        'SELECT wallet_id, asset_id, user_id, available, locked FROM balances WHERE wallet_id = ? AND asset_id = ? FOR UPDATE',
        [w, a],
        this.c,
      );
      this.rows.set(this.k(u, a), {
        walletId: w,
        assetId: a,
        userId: u,
        available: dec(r[0]!.available),
        locked: dec(r[0]!.locked),
      });
    }
  }

  get(userId: number, assetId: number) {
    const r = this.rows.get(this.k(userId, assetId));
    if (!r) throw new Error(`balance ${userId}:${assetId} not locked`);
    return { available: r.available, locked: r.locked };
  }

  async apply(ch: BalanceChange) {
    await this.lock([[ch.userId, ch.assetId]]);
    const r = this.rows.get(this.k(ch.userId, ch.assetId))!;
    const da = new D(ch.available);
    const dl = new D(ch.locked);
    if (da.isZero() && dl.isZero()) return;
    const na = r.available.plus(da);
    const nl = r.locked.plus(dl);
    if (na.isNegative()) throw Errors.insufficient();
    if (nl.isNegative())
      throw new Error(`locked balance would go negative (${ch.type} ${ch.refType}:${ch.refId})`);
    await exec(
      'UPDATE balances SET available = ?, locked = ? WHERE wallet_id = ? AND asset_id = ?',
      [toDb(na), toDb(nl), r.walletId, r.assetId],
      this.c,
    );
    await exec(
      `INSERT INTO ledger_entries (user_id, wallet_id, asset_id, type, available_delta, locked_delta, available_after, locked_after, ref_type, ref_id, memo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ch.userId,
        r.walletId,
        r.assetId,
        ch.type,
        toDb(da),
        toDb(dl),
        toDb(na),
        toDb(nl),
        ch.refType,
        String(ch.refId),
        ch.memo ?? null,
      ],
      this.c,
    );
    r.available = na;
    r.locked = nl;
    this.touched.add(this.k(ch.userId, ch.assetId));
  }

  /** Move funds available → locked. */
  lockFunds(userId: number, assetId: number, amount: Decimal.Value, refType: string, refId: string | number) {
    return this.apply({
      userId,
      assetId,
      available: new D(amount).neg(),
      locked: amount,
      type: 'order_lock',
      refType,
      refId,
    });
  }

  unlockFunds(
    userId: number,
    assetId: number,
    amount: Decimal.Value,
    refType: string,
    refId: string | number,
  ) {
    return this.apply({
      userId,
      assetId,
      available: amount,
      locked: new D(amount).neg(),
      type: 'order_unlock',
      refType,
      refId,
    });
  }

  /** Snapshot of touched balances, to publish after COMMIT. */
  changed(symbolOf: (assetId: number) => string) {
    return [...this.touched].map((k) => {
      const r = this.rows.get(k)!;
      return {
        userId: r.userId,
        asset: symbolOf(r.assetId),
        available: fmt(r.available),
        locked: fmt(r.locked),
        total: fmt(r.available.plus(r.locked)),
      };
    });
  }
}

export function publishBalances(
  list: { userId: number; asset: string; available: string; locked: string; total: string }[],
) {
  for (const b of list)
    publishUser(b.userId, WS.BALANCE_UPDATED, {
      asset: b.asset,
      available: b.available,
      locked: b.locked,
      total: b.total,
    });
}
