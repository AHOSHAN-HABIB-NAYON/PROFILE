import { Router } from 'express';
import { z } from 'zod';
import { dec, fmt, toDb, isDecimalString, stepToPrecision } from '@tradeteam/shared';
import { h } from '../../http/async';
import { body, parseQuery } from '../../http/middleware/validate';
import { Errors } from '../../http/errors';
import { exec, one, query, tx, db } from '../../infrastructure/db';
import { redisPub } from '../../infrastructure/redis';
import { encrypt } from '../../infrastructure/crypto';
import { verifySmtp } from '../../infrastructure/mailer';
import { audit } from '../auth/security-log';
import { hashPassword, passwordSchema } from '../auth/passwords';
import { revokeAllSessions, revokeSession } from '../auth/sessions';
import { disableTotp } from '../auth/mfa';
import { invalidateUserStatus } from '../../http/middleware/auth';
import {
  adminSettingsView,
  setSettings,
  SETTINGS,
  getSetting,
  type SettingKey,
} from '../settings/settings.service';
import { broadcastAnnouncement, notify } from '../notifications/notifications.service';
import { BalanceSession, publishBalances } from '../wallets/ledger';
import { assetSymbol, loadAssets } from '../wallets/assets-cache';
import { creditDeposit, ingestDeposit, settleWithdrawal } from '../wallets/wallets.service';
import { loadMarkets, marketById } from '../markets/registry';
import { notifyFeesChanged } from '../trading/fees';
import { cancelInEngine } from '../trading/engine-client';
import { cancelExternal, balanceReconciliation } from '../trading/external';
import { normalize, toOrderDTO, type OrderRow } from '../trading/orders.repo';
import { healthReport } from '../system/health';
import { runtime } from '../system/runtime';
import { migrate, pendingMigrations, latestVersion } from '../../database/migrator';
import { APP_VERSION } from '../../config/paths';
import { requireAdmin, can } from './admin.middleware';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const decStr = z.string().refine(isDecimalString, 'Must be a positive decimal');
const signedDec = z.string().regex(/^-?\d{1,18}(\.\d{1,18})?$/, 'Must be a decimal');
const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
const adminId = (req: { admin?: { id: number } }) => req.admin!.id;

async function paged<T>(
  sql: string,
  countSql: string,
  params: unknown[],
  p: { page: number; pageSize: number },
) {
  const items = await query<T>(`${sql} LIMIT ? OFFSET ?`, [
    ...(params as never[]),
    p.pageSize,
    (p.page - 1) * p.pageSize,
  ]);
  const total = await one<{ n: number }>(countSql, params as never[]);
  return { items, total: Number(total?.n ?? 0), page: p.page, pageSize: p.pageSize };
}

// ───────────── dashboard ─────────────
adminRouter.get(
  '/dashboard',
  can('dashboard.view'),
  h(async (_req, res) => {
    const [users] = await query<{ total: number; active24h: number; new24h: number; new7d: number }>(
      `SELECT COUNT(*) AS total,
         SUM(last_login_at >= NOW() - INTERVAL 1 DAY) AS active24h,
         SUM(created_at >= NOW() - INTERVAL 1 DAY) AS new24h,
         SUM(created_at >= NOW() - INTERVAL 7 DAY) AS new7d
       FROM users WHERE deleted_at IS NULL`,
    );
    const deposits = await query<{ symbol: string; amt: string; n: number }>(
      "SELECT a.symbol, SUM(d.amount) AS amt, COUNT(*) AS n FROM deposits d JOIN assets a ON a.id = d.asset_id WHERE d.status = 'credited' GROUP BY a.symbol ORDER BY n DESC LIMIT 10",
    );
    const withdrawals = await query<{ symbol: string; amt: string; n: number }>(
      "SELECT a.symbol, SUM(w.amount) AS amt, COUNT(*) AS n FROM withdrawals w JOIN assets a ON a.id = w.asset_id WHERE w.status = 'completed' GROUP BY a.symbol ORDER BY n DESC LIMIT 10",
    );
    const [pending] = await query<{ d: number; w: number }>(
      "SELECT (SELECT COUNT(*) FROM deposits WHERE status IN ('manual_review')) AS d, (SELECT COUNT(*) FROM withdrawals WHERE status IN ('pending','manual_review','approved','processing')) AS w",
    );
    const volume = await query<{ quote: string; vol: string; trades: number; fees: string }>(
      `SELECT m.quote, SUM(t.quote_qty) AS vol, COUNT(*) AS trades, SUM(t.taker_fee) AS fees FROM trades t JOIN markets m ON m.id = t.market_id
       WHERE t.created_at >= NOW() - INTERVAL 1 DAY GROUP BY m.quote ORDER BY vol DESC LIMIT 10`,
    );
    const [orders] = await query<{ open: number; trades: number }>(
      "SELECT (SELECT COUNT(*) FROM orders WHERE status IN ('open','partially_filled','pending')) AS open, (SELECT COUNT(*) FROM trades) AS trades",
    );
    const fees = await query<{ asset: string; amt: string }>(
      'SELECT fee_asset AS asset, SUM(fee) AS amt FROM order_fills GROUP BY fee_asset ORDER BY amt DESC LIMIT 10',
    );
    const signups = await query<{ d: string; n: number }>(
      "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS n FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY d ORDER BY d",
    );
    res.json({
      users: {
        total: Number(users?.total ?? 0),
        active24h: Number(users?.active24h ?? 0),
        new24h: Number(users?.new24h ?? 0),
        new7d: Number(users?.new7d ?? 0),
      },
      deposits: deposits.map((d) => ({ asset: d.symbol, amount: fmt(d.amt), count: Number(d.n) })),
      withdrawals: withdrawals.map((d) => ({ asset: d.symbol, amount: fmt(d.amt), count: Number(d.n) })),
      pendingReview: { deposits: Number(pending?.d ?? 0), withdrawals: Number(pending?.w ?? 0) },
      volume24h: volume.map((v) => ({ quote: v.quote, volume: fmt(v.vol), trades: Number(v.trades) })),
      openOrders: Number(orders?.open ?? 0),
      completedTrades: Number(orders?.trades ?? 0),
      feeRevenue: fees.map((f) => ({ asset: f.asset, amount: fmt(f.amt) })),
      signups: signups.map((s) => ({ date: s.d, count: Number(s.n) })),
      health: await healthReport(),
    });
  }),
);

// ───────────── users ─────────────
adminRouter.get(
  '/users',
  can('users.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        q: z.string().trim().max(100).optional(),
        status: z.enum(['active', 'suspended', 'locked', 'closed']).optional(),
        verified: z.enum(['yes', 'no']).optional(),
      }),
      req.query,
    );
    const where = ['u.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q.q) {
      where.push('(u.email LIKE ? OR u.name LIKE ? OR u.uid = ?)');
      params.push(like(q.q), like(q.q), q.q);
    }
    if (q.status) {
      where.push('u.status = ?');
      params.push(q.status);
    }
    if (q.verified)
      where.push(q.verified === 'yes' ? 'u.email_verified_at IS NOT NULL' : 'u.email_verified_at IS NULL');
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT u.id, u.uid, u.email, u.name, u.status, u.email_verified_at AS emailVerifiedAt, u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
           (SELECT COUNT(*) FROM two_factor_auth t WHERE t.principal_type = 'user' AND t.principal_id = u.id AND t.enabled_at IS NOT NULL) AS twoFactor,
           (SELECT COUNT(*) FROM passkeys p WHERE p.principal_type = 'user' AND p.principal_id = u.id) AS passkeys
         FROM users u WHERE ${w} ORDER BY u.id DESC`,
        `SELECT COUNT(*) AS n FROM users u WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

adminRouter.get(
  '/users/:id',
  can('users.view'),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const u = await one(
      'SELECT id, uid, email, name, phone, avatar_url AS avatarUrl, status, email_verified_at AS emailVerifiedAt, google_sub IS NOT NULL AS googleLinked, created_at AS createdAt, last_login_at AS lastLoginAt, locked_until AS lockedUntil, failed_login_count AS failedLogins FROM users WHERE id = ?',
      [id],
    );
    if (!u) throw Errors.notFound('User not found');
    const [balances, orders, trades, deposits, withdrawals, transactions, sessions, logins, security] =
      await Promise.all([
        query(
          'SELECT a.symbol AS asset, b.available, b.locked FROM balances b JOIN assets a ON a.id = b.asset_id WHERE b.user_id = ? AND (b.available > 0 OR b.locked > 0)',
          [id],
        ),
        query<OrderRow>('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50', [id]),
        query(
          'SELECT f.id, m.symbol, f.side, f.role, f.price, f.qty, f.fee, f.fee_asset AS feeAsset, f.created_at AS createdAt FROM order_fills f JOIN markets m ON m.id = f.market_id WHERE f.user_id = ? ORDER BY f.id DESC LIMIT 50',
          [id],
        ),
        query(
          'SELECT d.id, a.symbol AS asset, d.amount, d.status, d.txid, d.created_at AS createdAt FROM deposits d JOIN assets a ON a.id = d.asset_id WHERE d.user_id = ? ORDER BY d.id DESC LIMIT 50',
          [id],
        ),
        query(
          'SELECT w.id, a.symbol AS asset, w.amount, w.fee, w.status, w.address, w.txid, w.created_at AS createdAt FROM withdrawals w JOIN assets a ON a.id = w.asset_id WHERE w.user_id = ? ORDER BY w.id DESC LIMIT 50',
          [id],
        ),
        query(
          'SELECT t.id, t.type, a.symbol AS asset, t.amount, t.status, t.description, t.created_at AS createdAt FROM transactions t JOIN assets a ON a.id = t.asset_id WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 50',
          [id],
        ),
        query(
          "SELECT id, ip, user_agent AS userAgent, auth_method AS method, created_at AS createdAt, last_seen_at AS lastSeenAt FROM user_sessions WHERE principal_type = 'user' AND principal_id = ? AND revoked_at IS NULL AND expires_at > NOW(3) ORDER BY last_seen_at DESC",
          [id],
        ),
        query(
          "SELECT id, ip, method, success, reason, created_at AS createdAt FROM login_attempts WHERE principal_type = 'user' AND principal_id = ? ORDER BY id DESC LIMIT 50",
          [id],
        ),
        query(
          "SELECT id, type, ip, meta, created_at AS createdAt FROM security_events WHERE principal_type = 'user' AND principal_id = ? ORDER BY id DESC LIMIT 50",
          [id],
        ),
      ]);
    res.json({
      user: u,
      balances,
      orders: orders.map((o) => toOrderDTO(normalize(o))),
      trades,
      deposits,
      withdrawals,
      transactions,
      sessions,
      logins,
      security,
    });
  }),
);

adminRouter.post(
  '/users/:id/status',
  can('users.manage'),
  body(
    z.object({ status: z.enum(['active', 'suspended', 'closed']), reason: z.string().max(255).optional() }),
  ),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await one<{ status: string }>('SELECT status FROM users WHERE id = ?', [id]);
    if (!before) throw Errors.notFound('User not found');
    await exec('UPDATE users SET status = ?, locked_until = NULL, failed_login_count = 0 WHERE id = ?', [
      req.body.status,
      id,
    ]);
    if (req.body.status !== 'active') await revokeAllSessions('user', id, `admin_${req.body.status}`);
    await invalidateUserStatus(id);
    await audit(adminId(req), `user.${req.body.status}`, { type: 'user', id, userId: id }, req, before, {
      status: req.body.status,
      reason: req.body.reason,
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/users/:id/security',
  can('users.manage'),
  body(
    z.object({
      action: z.enum(['revoke_sessions', 'reset_2fa', 'unlock', 'verify_email', 'remove_passkeys']),
    }),
  ),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const a = req.body.action;
    if (a === 'revoke_sessions') await revokeAllSessions('user', id, 'admin_revoked');
    if (a === 'reset_2fa') {
      await disableTotp('user', id);
      await revokeAllSessions('user', id, 'admin_reset_2fa');
      await notify(
        id,
        'security_alert',
        'Two-factor authentication reset',
        'Support reset the two-factor authentication on your account. Set it up again from Security settings.',
        {},
        { email: true },
      );
    }
    if (a === 'remove_passkeys')
      await exec("DELETE FROM passkeys WHERE principal_type = 'user' AND principal_id = ?", [id]);
    if (a === 'unlock')
      await exec(
        "UPDATE users SET locked_until = NULL, failed_login_count = 0, status = IF(status = 'locked', 'active', status) WHERE id = ?",
        [id],
      );
    if (a === 'verify_email')
      await exec('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW(3)) WHERE id = ?', [
        id,
      ]);
    await invalidateUserStatus(id);
    await audit(adminId(req), `user.security.${a}`, { type: 'user', id, userId: id }, req);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/users/:id/adjust',
  can('balances.adjust'),
  body(
    z.object({
      asset: z.string().regex(/^[A-Z0-9]{1,20}$/),
      amount: signedDec,
      reason: z.string().trim().min(5).max(255),
    }),
  ),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const asset = await one<{ id: number }>('SELECT id FROM assets WHERE symbol = ?', [req.body.asset]);
    if (!asset) throw Errors.notFound('Asset not found');
    const amount = dec(req.body.amount);
    if (amount.isZero()) throw Errors.badRequest('Amount must not be zero');
    let bal: ReturnType<BalanceSession['changed']> = [];
    const ref = `adj-${Date.now()}`;
    await tx(async (c) => {
      const bs = new BalanceSession(c);
      await bs.apply({
        userId: id,
        assetId: Number(asset.id),
        available: amount,
        locked: 0,
        type: 'adjustment',
        refType: 'admin_adjustment',
        refId: ref,
        memo: req.body.reason,
      });
      await exec(
        "INSERT INTO transactions (user_id, type, asset_id, amount, status, ref_type, ref_id, description) VALUES (?, 'adjustment', ?, ?, 'completed', 'admin_adjustment', ?, ?)",
        [id, asset.id, toDb(amount), ref, req.body.reason],
        c,
      );
      bal = bs.changed(assetSymbol);
    });
    publishBalances(bal);
    await audit(adminId(req), 'balance.adjust', { type: 'user', id, userId: id }, req, null, {
      asset: req.body.asset,
      amount: req.body.amount,
      reason: req.body.reason,
    });
    res.json({ ok: true });
  }),
);

// ───────────── assets & networks ─────────────
adminRouter.get(
  '/assets',
  can('markets.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        q: z.string().trim().max(40).optional(),
        status: z.enum(['active', 'disabled', 'delisted']).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.q) {
      where.push('(symbol LIKE ? OR name LIKE ?)');
      params.push(like(q.q), like(q.q));
    }
    if (q.status) {
      where.push('status = ?');
      params.push(q.status);
    }
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT id, symbol, name, logo_url AS logoUrl, \`precision\`, market_cap AS marketCap, status, source, deposit_enabled AS depositEnabled, withdraw_enabled AS withdrawEnabled,
          (SELECT COUNT(*) FROM networks n WHERE n.asset_id = assets.id) AS networks FROM assets WHERE ${w} ORDER BY market_cap IS NULL, market_cap DESC, symbol`,
        `SELECT COUNT(*) AS n FROM assets WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

const assetSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{1,20}$/),
  name: z.string().trim().max(100).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  precision: z.number().int().min(0).max(18).default(8),
  status: z.enum(['active', 'disabled', 'delisted']).default('active'),
  depositEnabled: z.boolean().default(true),
  withdrawEnabled: z.boolean().default(true),
});

adminRouter.post(
  '/assets',
  can('markets.manage'),
  body(assetSchema),
  h(async (req, res) => {
    const b = req.body as z.infer<typeof assetSchema>;
    try {
      const r = await exec(
        "INSERT INTO assets (symbol, name, logo_url, `precision`, status, source, deposit_enabled, withdraw_enabled) VALUES (?,?,?,?,?, 'manual', ?, ?)",
        [
          b.symbol,
          b.name ?? null,
          b.logoUrl ?? null,
          b.precision,
          b.status,
          b.depositEnabled ? 1 : 0,
          b.withdrawEnabled ? 1 : 0,
        ],
      );
      await loadAssets();
      await audit(adminId(req), 'asset.create', { type: 'asset', id: r.insertId }, req, null, b);
      res.status(201).json({ id: String(r.insertId) });
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw Errors.conflict('Asset already exists');
      throw e;
    }
  }),
);

adminRouter.patch(
  '/assets/:id',
  can('markets.manage'),
  body(assetSchema.partial().omit({ symbol: true })),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await one('SELECT * FROM assets WHERE id = ?', [id]);
    if (!before) throw Errors.notFound();
    const b = req.body as Partial<z.infer<typeof assetSchema>>;
    await exec(
      `UPDATE assets SET name = COALESCE(?, name), logo_url = COALESCE(?, logo_url), \`precision\` = COALESCE(?, \`precision\`), status = COALESCE(?, status),
         deposit_enabled = COALESCE(?, deposit_enabled), withdraw_enabled = COALESCE(?, withdraw_enabled), source = 'manual' WHERE id = ?`,
      [
        b.name ?? null,
        b.logoUrl ?? null,
        b.precision ?? null,
        b.status ?? null,
        b.depositEnabled === undefined ? null : b.depositEnabled ? 1 : 0,
        b.withdrawEnabled === undefined ? null : b.withdrawEnabled ? 1 : 0,
        id,
      ],
    );
    await redisPub().publish('markets:changed', '1');
    await audit(adminId(req), 'asset.update', { type: 'asset', id }, req, before, b);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/networks',
  can('markets.view'),
  h(async (req, res) => {
    const q = parseQuery(z.object({ asset: z.string().max(20).optional() }), req.query);
    const rows = await query(
      `SELECT n.id, a.symbol AS asset, n.code, n.name, n.chain_family AS chainFamily, n.deposit_mode AS depositMode, n.xpub_enc IS NOT NULL AS hasXpub, n.static_address AS staticAddress,
         n.contract_address AS contractAddress, n.memo_required AS memoRequired, n.address_regex AS addressRegex, n.explorer_tx_url AS explorerTxUrl, n.confirmations,
         n.min_deposit AS minDeposit, n.min_withdraw AS minWithdraw, n.deposit_enabled AS depositEnabled, n.withdraw_enabled AS withdrawEnabled, n.status,
         f.fixed_amount AS withdrawFee, f.percent_rate AS withdrawFeePercent
       FROM networks n JOIN assets a ON a.id = n.asset_id LEFT JOIN fees f ON f.scope = 'withdrawal' AND f.network_id = n.id
       ${q.asset ? 'WHERE a.symbol = ?' : ''} ORDER BY a.symbol, n.code`,
      q.asset ? [q.asset] : [],
    );
    res.json({ items: rows });
  }),
);

const networkSchema = z.object({
  asset: z.string().regex(/^[A-Z0-9]{1,20}$/),
  code: z.string().regex(/^[A-Z0-9_-]{1,32}$/),
  name: z.string().trim().min(1).max(100),
  chainFamily: z.enum(['evm', 'bitcoin', 'tron', 'solana', 'other']).default('other'),
  depositMode: z.enum(['xpub', 'static']).default('static'),
  xpub: z
    .string()
    .regex(/^[xt]pub[1-9A-HJ-NP-Za-km-z]{100,112}$/)
    .optional(),
  staticAddress: z.string().max(128).nullable().optional(),
  contractAddress: z.string().max(128).nullable().optional(),
  memoRequired: z.boolean().default(false),
  addressRegex: z
    .string()
    .max(255)
    .nullable()
    .optional()
    .refine((r) => {
      if (!r) return true;
      try {
        new RegExp(r);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid regular expression'),
  explorerTxUrl: z.string().max(255).nullable().optional(),
  confirmations: z.number().int().min(0).max(10_000).default(12),
  minDeposit: decStr.default('0'),
  minWithdraw: decStr.default('0'),
  withdrawFee: decStr.default('0'),
  withdrawFeePercent: decStr.default('0'),
  depositEnabled: z.boolean().default(true),
  withdrawEnabled: z.boolean().default(true),
  status: z.enum(['active', 'disabled']).default('active'),
});

async function saveNetworkFee(networkId: number, fixed: string, percent: string, admin: number) {
  await exec(
    "INSERT INTO fees (scope, network_id, fixed_amount, percent_rate, updated_by) VALUES ('withdrawal', ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fixed_amount = VALUES(fixed_amount), percent_rate = VALUES(percent_rate), updated_by = VALUES(updated_by)",
    [networkId, toDb(fixed), toDb(percent), admin],
  );
  await notifyFeesChanged();
}

adminRouter.post(
  '/networks',
  can('markets.manage'),
  body(networkSchema),
  h(async (req, res) => {
    const b = req.body as z.infer<typeof networkSchema>;
    const a = await one<{ id: number }>('SELECT id FROM assets WHERE symbol = ?', [b.asset]);
    if (!a) throw Errors.notFound('Asset not found');
    if (b.depositMode === 'xpub' && (b.chainFamily !== 'evm' || !b.xpub))
      throw Errors.badRequest('xpub deposit mode requires an EVM network and an extended public key');
    if (b.depositMode === 'static' && b.depositEnabled && !b.staticAddress)
      throw Errors.badRequest('Static deposit mode requires an address');
    const r = await exec(
      `INSERT INTO networks (asset_id, code, name, chain_family, deposit_mode, static_address, contract_address, memo_required, address_regex, explorer_tx_url, confirmations, min_deposit, min_withdraw, deposit_enabled, withdraw_enabled, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        a.id,
        b.code,
        b.name,
        b.chainFamily,
        b.depositMode,
        b.staticAddress ?? null,
        b.contractAddress ?? null,
        b.memoRequired ? 1 : 0,
        b.addressRegex ?? null,
        b.explorerTxUrl ?? null,
        b.confirmations,
        toDb(b.minDeposit),
        toDb(b.minWithdraw),
        b.depositEnabled ? 1 : 0,
        b.withdrawEnabled ? 1 : 0,
        b.status,
      ],
    ).catch((e) => {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
        throw Errors.conflict('Network already exists for this asset');
      throw e;
    });
    if (b.xpub)
      await exec('UPDATE networks SET xpub_enc = ? WHERE id = ?', [
        encrypt(b.xpub, `xpub:${r.insertId}`),
        r.insertId,
      ]);
    await saveNetworkFee(r.insertId, b.withdrawFee, b.withdrawFeePercent, adminId(req));
    await audit(adminId(req), 'network.create', { type: 'network', id: r.insertId }, req, null, {
      ...b,
      xpub: b.xpub ? '[set]' : undefined,
    });
    res.status(201).json({ id: String(r.insertId) });
  }),
);

adminRouter.patch(
  '/networks/:id',
  can('markets.manage'),
  body(networkSchema.partial().omit({ asset: true, code: true })),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await one<{ chain_family: string }>('SELECT * FROM networks WHERE id = ?', [id]);
    if (!before) throw Errors.notFound();
    const b = req.body as Partial<z.infer<typeof networkSchema>>;
    const map: [keyof typeof b, string, (v: never) => unknown][] = [
      ['name', 'name', (v) => v],
      ['chainFamily', 'chain_family', (v) => v],
      ['depositMode', 'deposit_mode', (v) => v],
      ['staticAddress', 'static_address', (v) => v],
      ['contractAddress', 'contract_address', (v) => v],
      ['memoRequired', 'memo_required', (v) => (v ? 1 : 0)],
      ['addressRegex', 'address_regex', (v) => v],
      ['explorerTxUrl', 'explorer_tx_url', (v) => v],
      ['confirmations', 'confirmations', (v) => v],
      ['minDeposit', 'min_deposit', (v) => toDb(v)],
      ['minWithdraw', 'min_withdraw', (v) => toDb(v)],
      ['depositEnabled', 'deposit_enabled', (v) => (v ? 1 : 0)],
      ['withdrawEnabled', 'withdraw_enabled', (v) => (v ? 1 : 0)],
      ['status', 'status', (v) => v],
    ];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, col, conv] of map) {
      if (b[k] === undefined) continue;
      sets.push(`${col} = ?`);
      vals.push(conv(b[k] as never));
    }
    if (b.xpub) {
      sets.push('xpub_enc = ?');
      vals.push(encrypt(b.xpub, `xpub:${id}`));
    }
    if (sets.length)
      await exec(`UPDATE networks SET ${sets.join(', ')} WHERE id = ?`, [...(vals as never[]), id]);
    if (b.withdrawFee !== undefined || b.withdrawFeePercent !== undefined) {
      const cur = await one<{ fixed_amount: string; percent_rate: string }>(
        "SELECT fixed_amount, percent_rate FROM fees WHERE scope = 'withdrawal' AND network_id = ?",
        [id],
      );
      await saveNetworkFee(
        id,
        b.withdrawFee ?? cur?.fixed_amount ?? '0',
        b.withdrawFeePercent ?? cur?.percent_rate ?? '0',
        adminId(req),
      );
    }
    await audit(adminId(req), 'network.update', { type: 'network', id }, req, before, {
      ...b,
      xpub: b.xpub ? '[set]' : undefined,
    });
    res.json({ ok: true });
  }),
);

// ───────────── markets ─────────────
adminRouter.get(
  '/markets',
  can('markets.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        q: z.string().trim().max(40).optional(),
        status: z.enum(['trading', 'halted', 'delisted']).optional(),
        engine: z.enum(['internal', 'external']).optional(),
        quote: z.string().max(20).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.q) {
      where.push('m.symbol LIKE ?');
      params.push(like(q.q.toUpperCase()));
    }
    if (q.status) {
      where.push('m.status = ?');
      params.push(q.status);
    }
    if (q.engine) {
      where.push('m.engine = ?');
      params.push(q.engine);
    }
    if (q.quote) {
      where.push('m.quote = ?');
      params.push(q.quote.toUpperCase());
    }
    const w = where.join(' AND ');
    const r = await paged<Record<string, unknown>>(
      `SELECT m.id, m.symbol, m.base, m.quote, m.type, m.engine, m.provider, m.status, m.enabled, m.tick_size AS tickSize, m.step_size AS stepSize,
         m.price_precision AS pricePrecision, m.qty_precision AS qtyPrecision, m.min_qty AS minQty, m.max_qty AS maxQty, m.min_notional AS minNotional, m.max_notional AS maxNotional,
         m.sync_locked AS syncLocked, m.last_synced_at AS lastSyncedAt, m.delisted_at AS delistedAt, f.maker_rate AS makerFee, f.taker_rate AS takerFee
       FROM markets m LEFT JOIN fees f ON f.scope = 'trading' AND f.market_id = m.id WHERE ${w} ORDER BY m.status = 'delisted', m.symbol`,
      `SELECT COUNT(*) AS n FROM markets m WHERE ${w}`,
      params,
      q,
    );
    const lastSync = await one<{ value: string }>(
      "SELECT value FROM system_settings WHERE `key` = 'market.last_sync'",
    );
    res.json({ ...r, lastSync: lastSync ? JSON.parse(lastSync.value) : null });
  }),
);

const marketSchema = z.object({
  base: z.string().regex(/^[A-Z0-9]{1,20}$/),
  quote: z.string().regex(/^[A-Z0-9]{1,20}$/),
  type: z.enum(['spot', 'futures']).default('spot'),
  engine: z.enum(['internal', 'external']).default('internal'),
  status: z.enum(['trading', 'halted', 'delisted']).default('trading'),
  enabled: z.boolean().default(true),
  tickSize: decStr,
  stepSize: decStr,
  minQty: decStr.default('0'),
  maxQty: decStr.nullable().optional(),
  minNotional: decStr.default('0'),
  maxNotional: decStr.nullable().optional(),
  makerFee: decStr.nullable().optional(),
  takerFee: decStr.nullable().optional(),
});

async function saveMarketFees(
  marketId: number,
  maker: string | null | undefined,
  taker: string | null | undefined,
  admin: number,
) {
  if (maker === undefined && taker === undefined) return;
  if (maker === null && taker === null)
    await exec("DELETE FROM fees WHERE scope = 'trading' AND market_id = ?", [marketId]);
  else
    await exec(
      "INSERT INTO fees (scope, market_id, maker_rate, taker_rate, updated_by) VALUES ('trading', ?, ?, ?, ?) ON DUPLICATE KEY UPDATE maker_rate = VALUES(maker_rate), taker_rate = VALUES(taker_rate), updated_by = VALUES(updated_by)",
      [marketId, maker ? toDb(maker) : null, taker ? toDb(taker) : null, admin],
    );
  await notifyFeesChanged();
}

adminRouter.post(
  '/markets',
  can('markets.manage'),
  body(marketSchema),
  h(async (req, res) => {
    const b = req.body as z.infer<typeof marketSchema>;
    const base = await one<{ id: number }>('SELECT id FROM assets WHERE symbol = ?', [b.base]);
    const quote = await one<{ id: number }>('SELECT id FROM assets WHERE symbol = ?', [b.quote]);
    if (!base || !quote) throw Errors.badRequest('Create both assets first');
    const symbol = `${b.base}${b.quote}`;
    const r = await exec(
      `INSERT INTO markets (symbol, base_asset_id, quote_asset_id, base, quote, type, engine, provider, provider_symbol, status, enabled, tick_size, step_size, price_precision, qty_precision, min_qty, max_qty, min_notional, max_notional, sync_locked)
       VALUES (?,?,?,?,?,?,?, 'internal', ?, ?,?,?,?,?,?,?,?,?,?, 1)`,
      [
        symbol,
        base.id,
        quote.id,
        b.base,
        b.quote,
        b.type,
        b.engine,
        symbol,
        b.status,
        b.enabled ? 1 : 0,
        toDb(b.tickSize),
        toDb(b.stepSize),
        stepToPrecision(b.tickSize),
        stepToPrecision(b.stepSize),
        toDb(b.minQty),
        b.maxQty ? toDb(b.maxQty) : null,
        toDb(b.minNotional),
        b.maxNotional ? toDb(b.maxNotional) : null,
      ],
    ).catch((e) => {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw Errors.conflict('Market already exists');
      throw e;
    });
    await saveMarketFees(r.insertId, b.makerFee, b.takerFee, adminId(req));
    await loadMarkets();
    await redisPub().publish('markets:changed', '1');
    if (runtime.engine) await runtime.engine.loadMarkets();
    await audit(adminId(req), 'market.create', { type: 'market', id: r.insertId }, req, null, b);
    res.status(201).json({ id: String(r.insertId), symbol });
  }),
);

adminRouter.patch(
  '/markets/:id',
  can('markets.manage'),
  body(marketSchema.partial().omit({ base: true, quote: true })),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await one<{ engine: string; provider: string }>('SELECT * FROM markets WHERE id = ?', [
      id,
    ]);
    if (!before) throw Errors.notFound();
    const b = req.body as Partial<z.infer<typeof marketSchema>>;
    if (b.engine && b.engine !== before.engine) {
      const open = await one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM orders WHERE market_id = ? AND status IN ('pending','open','partially_filled')",
        [id],
      );
      if (Number(open?.n) > 0)
        throw Errors.conflict('Cancel all open orders before switching the execution engine');
      if (b.engine === 'internal' && before.provider !== 'internal')
        throw Errors.badRequest(
          'Internal execution requires internally-sourced market data; create an internal market instead',
        );
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => (sets.push(`${col} = ?`), vals.push(v));
    if (b.type) add('type', b.type);
    if (b.engine) add('engine', b.engine);
    if (b.status) add('status', b.status);
    if (b.enabled !== undefined) add('enabled', b.enabled ? 1 : 0);
    if (b.tickSize) {
      add('tick_size', toDb(b.tickSize));
      add('price_precision', stepToPrecision(b.tickSize));
    }
    if (b.stepSize) {
      add('step_size', toDb(b.stepSize));
      add('qty_precision', stepToPrecision(b.stepSize));
    }
    if (b.minQty) add('min_qty', toDb(b.minQty));
    if (b.maxQty !== undefined) add('max_qty', b.maxQty ? toDb(b.maxQty) : null);
    if (b.minNotional) add('min_notional', toDb(b.minNotional));
    if (b.maxNotional !== undefined) add('max_notional', b.maxNotional ? toDb(b.maxNotional) : null);
    if (
      b.tickSize ||
      b.stepSize ||
      b.minQty ||
      b.maxQty !== undefined ||
      b.minNotional ||
      b.maxNotional !== undefined
    )
      add('sync_locked', 1);
    if (sets.length)
      await exec(`UPDATE markets SET ${sets.join(', ')} WHERE id = ?`, [...(vals as never[]), id]);
    await saveMarketFees(id, b.makerFee, b.takerFee, adminId(req));
    await loadMarkets();
    await redisPub().publish('markets:changed', '1');
    if (runtime.engine) await runtime.engine.loadMarkets();
    await audit(adminId(req), 'market.update', { type: 'market', id }, req, before, b);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/markets/sync',
  can('markets.manage'),
  h(async (req, res) => {
    const { syncMarkets } = await import('../markets/sync');
    const { BinanceProvider } = await import('../market-data/binance');
    const p =
      runtime.hub?.provider ??
      new BinanceProvider(getSetting('market.binance_rest_url'), getSetting('market.binance_ws_url'));
    const r = await syncMarkets(p);
    await loadMarkets();
    await audit(
      adminId(req),
      'market.sync',
      {},
      req,
      null,
      r ? { total: r.total, added: r.added.length, delisted: r.delisted.length } : { skipped: true },
    );
    res.json(
      r
        ? {
            total: r.total,
            added: r.added,
            delisted: r.delisted,
            relisted: r.relisted,
            durationMs: r.durationMs,
          }
        : { skipped: 'A sync is already running' },
    );
  }),
);

// ───────────── fees ─────────────
adminRouter.get(
  '/fees',
  can('fees.manage'),
  h(async (_req, res) => {
    const rows = await query(
      `SELECT f.id, f.scope, m.symbol AS market, CONCAT(a.symbol, ' · ', n.code) AS network, f.maker_rate AS makerRate, f.taker_rate AS takerRate, f.fixed_amount AS fixedAmount, f.percent_rate AS percentRate, f.updated_at AS updatedAt
       FROM fees f LEFT JOIN markets m ON m.id = f.market_id LEFT JOIN networks n ON n.id = f.network_id LEFT JOIN assets a ON a.id = n.asset_id ORDER BY f.scope, f.market_id IS NOT NULL, m.symbol`,
    );
    res.json({ items: rows });
  }),
);

adminRouter.put(
  '/fees/default',
  can('fees.manage'),
  body(z.object({ makerRate: decStr, takerRate: decStr })),
  h(async (req, res) => {
    if (dec(req.body.makerRate).gt('0.1') || dec(req.body.takerRate).gt('0.1'))
      throw Errors.badRequest('Fee rates above 10% are not allowed');
    const before = await one(
      "SELECT maker_rate, taker_rate FROM fees WHERE scope = 'trading' AND market_id IS NULL",
    );
    await exec(
      "UPDATE fees SET maker_rate = ?, taker_rate = ?, updated_by = ? WHERE scope = 'trading' AND market_id IS NULL",
      [toDb(req.body.makerRate), toDb(req.body.takerRate), adminId(req)],
    );
    await notifyFeesChanged();
    await audit(adminId(req), 'fees.default', {}, req, before, req.body);
    res.json({ ok: true });
  }),
);

adminRouter.put(
  '/fees/deposit/:networkId',
  can('fees.manage'),
  body(z.object({ fixedAmount: decStr, percentRate: decStr })),
  h(async (req, res) => {
    const nid = Number(req.params.networkId);
    await exec(
      "INSERT INTO fees (scope, network_id, fixed_amount, percent_rate, updated_by) VALUES ('deposit', ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fixed_amount = VALUES(fixed_amount), percent_rate = VALUES(percent_rate), updated_by = VALUES(updated_by)",
      [nid, toDb(req.body.fixedAmount), toDb(req.body.percentRate), adminId(req)],
    );
    await notifyFeesChanged();
    await audit(adminId(req), 'fees.deposit', { type: 'network', id: nid }, req, null, req.body);
    res.json({ ok: true });
  }),
);

// ───────────── orders & trades ─────────────
adminRouter.get(
  '/orders',
  can('orders.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        symbol: z.string().max(30).optional(),
        status: z.string().max(20).optional(),
        side: z.enum(['buy', 'sell']).optional(),
        type: z.string().max(20).optional(),
        user: z.string().max(100).optional(),
        id: z.string().regex(/^\d+$/).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.id) {
      where.push('o.id = ?');
      params.push(q.id);
    }
    if (q.symbol) {
      where.push('m.symbol = ?');
      params.push(q.symbol.toUpperCase());
    }
    if (q.status === 'open') where.push("o.status IN ('pending','open','partially_filled')");
    else if (q.status) {
      where.push('o.status = ?');
      params.push(q.status);
    }
    if (q.side) {
      where.push('o.side = ?');
      params.push(q.side);
    }
    if (q.type) {
      where.push('o.type = ?');
      params.push(q.type);
    }
    if (q.user) {
      where.push('(u.email = ? OR u.uid = ?)');
      params.push(q.user.toLowerCase(), q.user);
    }
    const w = where.join(' AND ');
    const r = await paged<OrderRow & { email: string; uid: string }>(
      `SELECT o.*, u.email, u.uid FROM orders o JOIN markets m ON m.id = o.market_id JOIN users u ON u.id = o.user_id WHERE ${w} ORDER BY o.id DESC`,
      `SELECT COUNT(*) AS n FROM orders o JOIN markets m ON m.id = o.market_id JOIN users u ON u.id = o.user_id WHERE ${w}`,
      params,
      q,
    );
    res.json({
      ...r,
      items: r.items.map((o) => ({
        ...toOrderDTO(normalize(o)),
        userId: String(o.user_id),
        email: o.email,
        uid: o.uid,
        engine: o.engine,
        externalId: o.external_id,
        lockedRemaining: fmt(o.locked_remaining),
      })),
    });
  }),
);

adminRouter.get(
  '/orders/:id',
  can('orders.view'),
  h(async (req, res) => {
    const o = await one<OrderRow>('SELECT * FROM orders WHERE id = ?', [String(req.params.id)]);
    if (!o) throw Errors.notFound();
    const fills = await query(
      'SELECT id, trade_id AS tradeId, role, price, qty, quote_qty AS quoteQty, fee, fee_asset AS feeAsset, realized_pnl AS realizedPnl, created_at AS createdAt FROM order_fills WHERE order_id = ? ORDER BY id',
      [o.id],
    );
    const ledger = await query(
      "SELECT id, type, asset_id, available_delta AS availableDelta, locked_delta AS lockedDelta, created_at AS createdAt FROM ledger_entries WHERE ref_type = 'order' AND ref_id = ? ORDER BY id",
      [String(o.id)],
    );
    res.json({
      order: {
        ...toOrderDTO(normalize(o)),
        userId: String(o.user_id),
        engine: o.engine,
        externalId: o.external_id,
        lockedRemaining: fmt(o.locked_remaining),
      },
      fills,
      ledger: ledger.map((l) => ({ ...l, asset: assetSymbol(Number((l as { asset_id: number }).asset_id)) })),
    });
  }),
);

adminRouter.post(
  '/orders/:id/cancel',
  can('orders.manage'),
  h(async (req, res) => {
    const o = await one<OrderRow>('SELECT * FROM orders WHERE id = ?', [String(req.params.id)]);
    if (!o) throw Errors.notFound();
    normalize(o);
    const r = o.engine === 'internal' ? await cancelInEngine(o.id, 'admin') : await cancelExternal(o.id);
    await audit(adminId(req), 'order.cancel', { type: 'order', id: o.id, userId: o.user_id }, req);
    res.json({ order: toOrderDTO(r) });
  }),
);

adminRouter.get(
  '/trades',
  can('orders.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        symbol: z.string().max(30).optional(),
        user: z.string().max(100).optional(),
        id: z.string().regex(/^\d+$/).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.id) {
      where.push('t.id = ?');
      params.push(q.id);
    }
    if (q.symbol) {
      where.push('m.symbol = ?');
      params.push(q.symbol.toUpperCase());
    }
    if (q.user) {
      where.push(
        '(t.maker_user_id = (SELECT id FROM users WHERE email = ? OR uid = ? LIMIT 1) OR t.taker_user_id = (SELECT id FROM users WHERE email = ? OR uid = ? LIMIT 1))',
      );
      params.push(q.user, q.user, q.user, q.user);
    }
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT t.id, m.symbol, t.price, t.qty, t.quote_qty AS quoteQty, t.taker_side AS takerSide, t.maker_order_id AS makerOrderId, t.taker_order_id AS takerOrderId,
           t.maker_user_id AS makerUserId, t.taker_user_id AS takerUserId, t.maker_fee AS makerFee, t.taker_fee AS takerFee, t.external_ref AS externalRef, t.created_at AS createdAt
         FROM trades t JOIN markets m ON m.id = t.market_id WHERE ${w} ORDER BY t.id DESC`,
        `SELECT COUNT(*) AS n FROM trades t JOIN markets m ON m.id = t.market_id WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

// ───────────── deposits & withdrawals ─────────────
adminRouter.get(
  '/deposits',
  can('deposits.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        status: z.enum(['pending', 'confirming', 'credited', 'failed', 'manual_review']).optional(),
        user: z.string().max(100).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.status) {
      where.push('d.status = ?');
      params.push(q.status);
    }
    if (q.user) {
      where.push('(u.email = ? OR u.uid = ?)');
      params.push(q.user.toLowerCase(), q.user);
    }
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT d.id, u.id AS userId, u.email, u.uid, a.symbol AS asset, n.code AS network, d.address, d.memo, d.amount, d.txid, d.confirmations, d.required_confirmations AS requiredConfirmations, d.status, d.source, d.note, d.created_at AS createdAt, d.credited_at AS creditedAt
         FROM deposits d JOIN users u ON u.id = d.user_id JOIN assets a ON a.id = d.asset_id JOIN networks n ON n.id = d.network_id WHERE ${w} ORDER BY d.id DESC`,
        `SELECT COUNT(*) AS n FROM deposits d JOIN users u ON u.id = d.user_id WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

adminRouter.post(
  '/deposits',
  can('deposits.manage'),
  body(
    z.object({
      asset: z.string().max(20),
      network: z.string().max(32),
      address: z.string().max(128),
      memo: z.string().max(64).nullish(),
      txid: z.string().min(4).max(128),
      outputIndex: z.number().int().min(0).default(0),
      amount: decStr,
      confirmations: z.number().int().min(0),
    }),
  ),
  h(async (req, res) => {
    const r = await ingestDeposit({ ...req.body, source: 'manual', adminId: adminId(req) });
    await audit(adminId(req), 'deposit.manual', { type: 'deposit', id: r.id }, req, null, req.body);
    res.status(201).json(r);
  }),
);

adminRouter.post(
  '/deposits/:id/:action',
  can('deposits.manage'),
  body(z.object({ note: z.string().max(255).optional() })),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const action = String(req.params.action);
    if (action === 'credit') await creditDeposit(id, adminId(req));
    else if (action === 'reject') {
      const r = await exec(
        "UPDATE deposits SET status = 'failed', note = ?, reviewed_by = ? WHERE id = ? AND status <> 'credited'",
        [req.body.note ?? null, adminId(req), id],
      );
      if (!r.affectedRows) throw Errors.conflict('Deposit cannot be rejected');
    } else if (action === 'review') {
      await exec(
        "UPDATE deposits SET status = 'manual_review', note = ?, reviewed_by = ? WHERE id = ? AND status IN ('pending','confirming')",
        [req.body.note ?? null, adminId(req), id],
      );
    } else throw Errors.notFound();
    await audit(adminId(req), `deposit.${action}`, { type: 'deposit', id }, req, null, req.body);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/withdrawals',
  can('withdrawals.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        status: z
          .enum([
            'pending',
            'manual_review',
            'approved',
            'processing',
            'completed',
            'rejected',
            'failed',
            'cancelled',
          ])
          .optional(),
        user: z.string().max(100).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.status) {
      where.push('w.status = ?');
      params.push(q.status);
    }
    if (q.user) {
      where.push('(u.email = ? OR u.uid = ?)');
      params.push(q.user.toLowerCase(), q.user);
    }
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT w.id, u.id AS userId, u.email, u.uid, a.symbol AS asset, n.code AS network, w.address, w.memo, w.amount, w.fee, w.total, w.status, w.txid, w.verification_method AS verification, w.ip, w.reject_reason AS rejectReason, w.created_at AS createdAt, w.completed_at AS completedAt
         FROM withdrawals w JOIN users u ON u.id = w.user_id JOIN assets a ON a.id = w.asset_id JOIN networks n ON n.id = w.network_id WHERE ${w} ORDER BY w.id DESC`,
        `SELECT COUNT(*) AS n FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

adminRouter.post(
  '/withdrawals/:id/:action',
  can('withdrawals.manage'),
  body(z.object({ reason: z.string().max(255).optional(), txid: z.string().min(4).max(128).optional() })),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const action = String(req.params.action) as 'approve' | 'reject' | 'processing' | 'complete';
    if (!['approve', 'reject', 'processing', 'complete'].includes(action)) throw Errors.notFound();
    await settleWithdrawal(id, action, {
      adminId: adminId(req),
      reason: req.body.reason,
      txid: req.body.txid,
    });
    await audit(adminId(req), `withdrawal.${action}`, { type: 'withdrawal', id }, req, null, req.body);
    res.json({ ok: true });
  }),
);

// ───────────── notifications ─────────────
adminRouter.post(
  '/notifications/announce',
  can('notifications.send'),
  body(z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(2000) })),
  h(async (req, res) => {
    const n = await broadcastAnnouncement(req.body.title, req.body.body, adminId(req));
    await audit(adminId(req), 'notification.announce', {}, req, null, req.body);
    res.json({ delivered: n });
  }),
);

adminRouter.post(
  '/notifications/user',
  can('notifications.send'),
  body(
    z.object({
      user: z.string().trim().min(1).max(254),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(2000),
      email: z.boolean().default(false),
    }),
  ),
  h(async (req, res) => {
    const u = await one<{ id: number }>('SELECT id FROM users WHERE email = ? OR uid = ?', [
      req.body.user.toLowerCase(),
      req.body.user,
    ]);
    if (!u) throw Errors.notFound('User not found');
    await notify(
      Number(u.id),
      'announcement',
      req.body.title,
      req.body.body,
      { fromAdmin: true },
      { email: req.body.email },
    );
    await audit(
      adminId(req),
      'notification.user',
      { type: 'user', id: u.id, userId: Number(u.id) },
      req,
      null,
      req.body,
    );
    res.json({ ok: true });
  }),
);

// ───────────── admin security ─────────────
adminRouter.get(
  '/admins',
  can('security.manage'),
  h(async (_req, res) => {
    res.json({
      items: await query(
        `SELECT u.id, u.email, u.name, r.name AS role, u.status, u.last_login_at AS lastLoginAt, u.created_at AS createdAt,
           (SELECT COUNT(*) FROM two_factor_auth t WHERE t.principal_type = 'admin' AND t.principal_id = u.id AND t.enabled_at IS NOT NULL) AS twoFactor,
           (SELECT COUNT(*) FROM passkeys p WHERE p.principal_type = 'admin' AND p.principal_id = u.id) AS passkeys
         FROM admin_users u JOIN admin_roles r ON r.id = u.role_id ORDER BY u.id`,
      ),
      roles: await query(
        'SELECT r.id, r.name, r.description, GROUP_CONCAT(p.code ORDER BY p.code) AS permissions FROM admin_roles r LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id LEFT JOIN admin_permissions p ON p.id = rp.permission_id GROUP BY r.id ORDER BY r.id',
      ),
    });
  }),
);

adminRouter.post(
  '/admins',
  can('security.manage'),
  body(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      name: z.string().trim().min(1).max(100),
      password: passwordSchema,
      role: z.enum(['super_admin', 'admin', 'support']),
    }),
  ),
  h(async (req, res) => {
    if (req.body.role === 'super_admin' && req.admin!.role !== 'super_admin')
      throw Errors.forbidden('Only super admins can create super admins');
    const role = await one<{ id: number }>('SELECT id FROM admin_roles WHERE name = ?', [req.body.role]);
    const r = await exec('INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?,?,?,?)', [
      req.body.email,
      req.body.name,
      await hashPassword(req.body.password),
      role!.id,
    ]).catch((e) => {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw Errors.conflict('Admin already exists');
      throw e;
    });
    await audit(adminId(req), 'admin.create', { type: 'admin', id: r.insertId }, req, null, {
      email: req.body.email,
      role: req.body.role,
    });
    res.status(201).json({ id: String(r.insertId) });
  }),
);

adminRouter.patch(
  '/admins/:id',
  can('security.manage'),
  body(
    z.object({
      role: z.enum(['super_admin', 'admin', 'support']).optional(),
      status: z.enum(['active', 'disabled']).optional(),
    }),
  ),
  h(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.admin!.id) throw Errors.badRequest('You cannot change your own role or status');
    const target = await one<{ role: string }>(
      'SELECT r.name AS role FROM admin_users u JOIN admin_roles r ON r.id = u.role_id WHERE u.id = ?',
      [id],
    );
    if (!target) throw Errors.notFound();
    if (
      (target.role === 'super_admin' || req.body.role === 'super_admin') &&
      req.admin!.role !== 'super_admin'
    )
      throw Errors.forbidden('Only super admins can manage super admins');
    if (req.body.role)
      await exec(
        'UPDATE admin_users SET role_id = (SELECT id FROM admin_roles WHERE name = ?) WHERE id = ?',
        [req.body.role, id],
      );
    if (req.body.status) {
      await exec('UPDATE admin_users SET status = ? WHERE id = ?', [req.body.status, id]);
      if (req.body.status === 'disabled') await revokeAllSessions('admin', id, 'disabled');
    }
    await audit(adminId(req), 'admin.update', { type: 'admin', id }, req, target, req.body);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/sessions',
  can('security.manage'),
  h(async (_req, res) => {
    res.json({
      items: await query(
        "SELECT s.id, s.principal_id AS adminId, a.email, s.ip, s.user_agent AS userAgent, s.auth_method AS method, s.mfa_at IS NOT NULL AS mfa, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt FROM user_sessions s JOIN admin_users a ON a.id = s.principal_id WHERE s.principal_type = 'admin' AND s.revoked_at IS NULL AND s.expires_at > NOW(3) ORDER BY s.last_seen_at DESC",
      ),
    });
  }),
);

adminRouter.delete(
  '/sessions/:id',
  can('security.manage'),
  h(async (req, res) => {
    await revokeSession(Number(req.params.id), 'admin_revoked');
    await audit(adminId(req), 'admin.session_revoke', { type: 'session', id: String(req.params.id) }, req);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/login-history',
  can('audit.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        principal: z.enum(['user', 'admin']).default('admin'),
        success: z.enum(['0', '1']).optional(),
      }),
      req.query,
    );
    const where = ['principal_type = ?'];
    const params: unknown[] = [q.principal];
    if (q.success) {
      where.push('success = ?');
      params.push(Number(q.success));
    }
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT id, principal_id AS principalId, email, ip, user_agent AS userAgent, method, success, reason, created_at AS createdAt FROM login_attempts WHERE ${w} ORDER BY id DESC`,
        `SELECT COUNT(*) AS n FROM login_attempts WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

adminRouter.get(
  '/audit',
  can('audit.view'),
  h(async (req, res) => {
    const q = parseQuery(
      page.extend({
        action: z.string().max(64).optional(),
        admin: z.coerce.number().int().optional(),
        target: z.string().max(64).optional(),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params: unknown[] = [];
    if (q.action) {
      where.push('l.action LIKE ?');
      params.push(like(q.action));
    }
    if (q.admin) {
      where.push('l.admin_user_id = ?');
      params.push(q.admin);
    }
    if (q.target) {
      where.push('l.target_id = ?');
      params.push(q.target);
    }
    const w = where.join(' AND ');
    res.json(
      await paged(
        `SELECT l.id, l.admin_user_id AS adminId, a.email AS adminEmail, l.user_id AS userId, l.action, l.target_type AS targetType, l.target_id AS targetId, l.ip, l.before_data AS beforeData, l.after_data AS afterData, l.created_at AS createdAt
         FROM audit_logs l LEFT JOIN admin_users a ON a.id = l.admin_user_id WHERE ${w} ORDER BY l.id DESC`,
        `SELECT COUNT(*) AS n FROM audit_logs l WHERE ${w}`,
        params,
        q,
      ),
    );
  }),
);

adminRouter.get(
  '/security-events',
  can('audit.view'),
  h(async (req, res) => {
    const q = parseQuery(page.extend({ type: z.string().max(50).optional() }), req.query);
    const w = q.type ? 'type = ?' : '1=1';
    res.json(
      await paged(
        `SELECT id, principal_type AS principalType, principal_id AS principalId, type, ip, meta, created_at AS createdAt FROM security_events WHERE ${w} ORDER BY id DESC`,
        `SELECT COUNT(*) AS n FROM security_events WHERE ${w}`,
        q.type ? [q.type] : [],
        q,
      ),
    );
  }),
);

// ───────────── settings ─────────────
adminRouter.get('/settings', can('settings.manage'), (_req, res) => {
  res.json({ settings: adminSettingsView() });
});

adminRouter.put(
  '/settings',
  can('settings.manage'),
  body(z.record(z.string(), z.unknown())),
  h(async (req, res) => {
    const keys = Object.keys(req.body).filter((k) => k in SETTINGS && k !== 'system.installed_version');
    // IP restrictions and exchange credentials are security configuration: super admin only.
    if (
      keys.some((k) => k.startsWith('admin.') || k.startsWith('exchange.')) &&
      req.admin!.role !== 'super_admin'
    )
      throw Errors.forbidden('Super admin required');
    if (keys.includes('admin.ip_allowlist')) {
      const list = req.body['admin.ip_allowlist'] as string[];
      const ip = (req.ip ?? '').replace(/^::ffff:/, '');
      const { cidrMatch } = await import('./admin.middleware');
      if (list.length && !list.some((e) => e === ip || (e.includes('/') && cidrMatch(ip, e))))
        throw Errors.badRequest(`Your current IP (${ip}) must be included in the allowlist`);
    }
    const before: Record<string, unknown> = {};
    for (const k of keys)
      before[k] = (SETTINGS[k as SettingKey] as { secret?: boolean }).secret
        ? '[secret]'
        : getSetting(k as SettingKey);
    try {
      const changed = await setSettings(Object.fromEntries(keys.map((k) => [k, req.body[k]])), adminId(req));
      const after = Object.fromEntries(
        changed.map((k) => [k, (SETTINGS[k] as { secret?: boolean }).secret ? '[secret]' : getSetting(k)]),
      );
      await audit(adminId(req), 'settings.update', { type: 'settings' }, req, before, after);
      res.json({ changed, settings: adminSettingsView() });
    } catch (e) {
      throw Errors.validation([
        { path: (e as { setting?: string }).setting ?? 'settings', message: (e as Error).message },
      ]);
    }
  }),
);

adminRouter.post(
  '/settings/test-smtp',
  can('settings.manage'),
  body(z.object({ to: z.string().email() })),
  h(async (req, res) => {
    try {
      await verifySmtp({
        host: getSetting('smtp.host'),
        port: getSetting('smtp.port'),
        secure: getSetting('smtp.secure'),
        user: getSetting('smtp.user'),
        password: getSetting('smtp.password'),
      });
      const { sendMail } = await import('../../infrastructure/mailer');
      await sendMail(
        req.body.to,
        `${getSetting('site.name')} SMTP test`,
        '<p>SMTP is configured correctly.</p>',
        'SMTP is configured correctly.',
      );
      res.json({ ok: true });
    } catch (e) {
      throw Errors.badRequest(`SMTP test failed: ${(e as Error).message}`);
    }
  }),
);

// ───────────── system ─────────────
adminRouter.get(
  '/system/health',
  can('system.view'),
  h(async (_req, res) => res.json(await healthReport())),
);

adminRouter.get(
  '/system/version',
  can('system.view'),
  h(async (_req, res) => {
    const applied = await query(
      'SELECT version, name, status, applied_at AS appliedAt FROM schema_migrations ORDER BY version',
    );
    const pending = await pendingMigrations(db());
    res.json({
      appVersion: APP_VERSION,
      installedVersion: getSetting('system.installed_version'),
      schemaVersion: latestVersion(),
      applied,
      pending: pending.map((m) => ({ version: m.version, name: m.name })),
    });
  }),
);

adminRouter.post(
  '/system/migrate',
  can('settings.manage'),
  h(async (req, res) => {
    if (req.admin!.role !== 'super_admin') throw Errors.forbidden('Super admin required');
    const r = await migrate(db());
    await setSettings({ 'system.installed_version': APP_VERSION }, adminId(req));
    await audit(adminId(req), 'system.migrate', {}, req, null, r);
    res.json(r);
  }),
);

adminRouter.post(
  '/system/maintenance',
  can('settings.manage'),
  body(z.object({ enabled: z.boolean(), message: z.string().max(500).optional() })),
  h(async (req, res) => {
    await setSettings(
      {
        'maintenance.enabled': req.body.enabled,
        ...(req.body.message ? { 'maintenance.message': req.body.message } : {}),
      },
      adminId(req),
    );
    await audit(
      adminId(req),
      `system.maintenance.${req.body.enabled ? 'on' : 'off'}`,
      {},
      req,
      null,
      req.body,
    );
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/system/exchange-balances',
  can('system.view'),
  h(async (_req, res) => res.json(await balanceReconciliation())),
);

adminRouter.get(
  '/system/engine/:marketId',
  can('system.view'),
  h(async (req, res) => {
    const m = marketById(Number(req.params.marketId));
    if (!m) throw Errors.notFound();
    res.json({ market: m.symbol, engine: runtime.engine?.snapshot(m.id) ?? null });
  }),
);
