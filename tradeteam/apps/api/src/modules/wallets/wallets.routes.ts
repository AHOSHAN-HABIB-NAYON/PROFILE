import { Router, type Request } from 'express';
import { z } from 'zod';
import { fmt, isDecimalString } from '@tradeteam/shared';
import { h } from '../../http/async';
import { body, parseQuery } from '../../http/middleware/validate';
import { requireUser, recentMfa } from '../../http/middleware/auth';
import { rateLimit, byPrincipal } from '../../http/middleware/rate-limit';
import { Errors } from '../../http/errors';
import { query, one } from '../../infrastructure/db';
import { hmac, safeEqual } from '../../infrastructure/crypto';
import { loadEnv } from '../../config/env';
import { getSetting } from '../settings/settings.service';
import { methodsFor } from '../auth/mfa';
import { clientIp } from '../auth/sessions';
import { securityEvent } from '../auth/security-log';
import * as w from './wallets.service';

export const walletsRouter = Router();
const decStr = z.string().refine(isDecimalString, 'Must be a positive decimal number');

/** Withdrawals & transfers require a second factor verified in the last 5 minutes. */
async function requireWithdrawalVerification(req: Request) {
  if (!getSetting('withdrawal.require_verification')) return 'none';
  const m = await methodsFor('user', req.auth!.id);
  if (!m.totp && !m.passkey)
    throw Errors.forbidden('Enable two-factor authentication or add a passkey before withdrawing funds');
  if (!recentMfa(req, 300)) throw Errors.mfaRequired({ methods: m });
  return m.passkey ? 'passkey_or_2fa' : '2fa';
}

walletsRouter.get(
  '/wallets',
  requireUser,
  h(async (req, res) => res.json(await w.balances(req.auth!.id))),
);

walletsRouter.get(
  '/wallets/networks/:asset',
  requireUser,
  h(async (req, res) => res.json({ items: await w.networksFor(String(req.params.asset)) })),
);

walletsRouter.post(
  '/deposits',
  requireUser,
  rateLimit('deposit-address', 30, 60, byPrincipal),
  body(
    z.object({
      asset: z.string().regex(/^[A-Z0-9]{1,20}$/),
      network: z.string().regex(/^[A-Z0-9_-]{1,32}$/),
    }),
  ),
  h(async (req, res) => res.json(await w.depositAddress(req.auth!.id, req.body.asset, req.body.network))),
);

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  asset: z.string().max(20).optional(),
});

walletsRouter.get(
  '/deposits',
  requireUser,
  h(async (req, res) => {
    const q = parseQuery(pageSchema, req.query);
    const rows = await query<Record<string, unknown>>(
      `SELECT d.id, a.symbol AS asset, n.code AS network, d.address, d.memo, d.amount, d.txid, d.confirmations, d.required_confirmations AS requiredConfirmations, d.status, d.created_at AS createdAt, d.credited_at AS creditedAt, n.explorer_tx_url AS explorer
       FROM deposits d JOIN assets a ON a.id = d.asset_id JOIN networks n ON n.id = d.network_id WHERE d.user_id = ? ${q.asset ? 'AND a.symbol = ?' : ''} ORDER BY d.id DESC LIMIT ? OFFSET ?`,
      q.asset
        ? [req.auth!.id, q.asset, q.pageSize, (q.page - 1) * q.pageSize]
        : [req.auth!.id, q.pageSize, (q.page - 1) * q.pageSize],
    );
    res.json({
      items: rows.map((r) => ({ ...r, id: String(r.id), amount: fmt(r.amount as string) })),
      page: q.page,
    });
  }),
);

walletsRouter.post(
  '/withdrawals',
  requireUser,
  rateLimit('withdraw', 10, 3600, byPrincipal),
  body(
    z.object({
      asset: z.string().regex(/^[A-Z0-9]{1,20}$/),
      network: z.string().regex(/^[A-Z0-9_-]{1,32}$/),
      address: z
        .string()
        .trim()
        .min(10)
        .max(128)
        .regex(/^[A-Za-z0-9:_-]+$/),
      memo: z
        .string()
        .trim()
        .max(64)
        .regex(/^[A-Za-z0-9_-]*$/)
        .optional(),
      amount: decStr,
    }),
  ),
  h(async (req, res) => {
    const method = await requireWithdrawalVerification(req);
    const r = await w.requestWithdrawal(req.auth!.id, req.body, { ip: clientIp(req), method });
    await securityEvent('user', req.auth!.id, 'withdrawal_requested', req, {
      id: r.id,
      asset: req.body.asset,
      amount: req.body.amount,
    });
    res.status(201).json(r);
  }),
);

walletsRouter.get(
  '/withdrawals',
  requireUser,
  h(async (req, res) => {
    const q = parseQuery(pageSchema, req.query);
    const rows = await query<Record<string, unknown>>(
      `SELECT w.id, a.symbol AS asset, n.code AS network, w.address, w.memo, w.amount, w.fee, w.total, w.status, w.txid, w.reject_reason AS rejectReason, w.created_at AS createdAt, w.completed_at AS completedAt, n.explorer_tx_url AS explorer
       FROM withdrawals w JOIN assets a ON a.id = w.asset_id JOIN networks n ON n.id = w.network_id WHERE w.user_id = ? ORDER BY w.id DESC LIMIT ? OFFSET ?`,
      [req.auth!.id, q.pageSize, (q.page - 1) * q.pageSize],
    );
    res.json({
      items: rows.map((r) => ({
        ...r,
        id: String(r.id),
        amount: fmt(r.amount as string),
        fee: fmt(r.fee as string),
        total: fmt(r.total as string),
      })),
      page: q.page,
    });
  }),
);

walletsRouter.delete(
  '/withdrawals/:id',
  requireUser,
  h(async (req, res) => {
    await w.settleWithdrawal(Number(req.params.id), 'cancel', { byUserId: req.auth!.id });
    res.json({ ok: true });
  }),
);

walletsRouter.post(
  '/transfers',
  requireUser,
  rateLimit('transfer', 20, 3600, byPrincipal),
  body(
    z.object({
      toUid: z.string().regex(/^\d{6,16}$/),
      asset: z.string().regex(/^[A-Z0-9]{1,20}$/),
      amount: decStr,
      note: z.string().max(100).optional(),
    }),
  ),
  h(async (req, res) => {
    await requireWithdrawalVerification(req);
    const r = await w.internalTransfer(req.auth!.id, req.body);
    await securityEvent('user', req.auth!.id, 'transfer', req, {
      to: req.body.toUid,
      asset: req.body.asset,
      amount: req.body.amount,
    });
    res.status(201).json(r);
  }),
);

walletsRouter.get(
  '/transactions',
  requireUser,
  h(async (req, res) => {
    const q = parseQuery(
      pageSchema.extend({
        type: z.enum(['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'adjustment']).optional(),
      }),
      req.query,
    );
    const where = ['t.user_id = ?'];
    const params: (string | number)[] = [req.auth!.id];
    if (q.type) {
      where.push('t.type = ?');
      params.push(q.type);
    }
    if (q.asset) {
      where.push('a.symbol = ?');
      params.push(q.asset);
    }
    const rows = await query<Record<string, unknown>>(
      `SELECT t.id, t.type, a.symbol AS asset, t.amount, t.fee, t.status, t.description, t.ref_type AS refType, t.ref_id AS refId, t.created_at AS createdAt
       FROM transactions t JOIN assets a ON a.id = t.asset_id WHERE ${where.join(' AND ')} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    );
    const total = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions t JOIN assets a ON a.id = t.asset_id WHERE ${where.join(' AND ')}`,
      params,
    );
    res.json({
      items: rows.map((r) => ({
        ...r,
        id: String(r.id),
        amount: fmt(r.amount as string),
        fee: fmt(r.fee as string),
      })),
      total: Number(total?.n ?? 0),
      page: q.page,
      pageSize: q.pageSize,
    });
  }),
);

walletsRouter.get(
  '/ledger',
  requireUser,
  h(async (req, res) => {
    const q = parseQuery(pageSchema, req.query);
    const rows = await query<Record<string, unknown>>(
      `SELECT l.id, a.symbol AS asset, l.type, l.available_delta AS availableDelta, l.locked_delta AS lockedDelta, l.available_after AS availableAfter, l.locked_after AS lockedAfter, l.ref_type AS refType, l.ref_id AS refId, l.created_at AS createdAt
       FROM ledger_entries l JOIN assets a ON a.id = l.asset_id WHERE l.user_id = ? ${q.asset ? 'AND a.symbol = ?' : ''} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      q.asset
        ? [req.auth!.id, q.asset, q.pageSize, (q.page - 1) * q.pageSize]
        : [req.auth!.id, q.pageSize, (q.page - 1) * q.pageSize],
    );
    res.json({
      items: rows.map((r) => ({
        ...r,
        id: String(r.id),
        availableDelta: fmt(r.availableDelta as string),
        lockedDelta: fmt(r.lockedDelta as string),
        availableAfter: fmt(r.availableAfter as string),
        lockedAfter: fmt(r.lockedAfter as string),
      })),
      page: q.page,
    });
  }),
);

/**
 * Chain-watcher / custody webhook. Authenticated with HMAC-SHA256 over `${timestamp}.${rawBody}`
 * (header X-Signature: t=<unix>,v1=<hex>); requests older than 5 minutes are rejected (replay).
 */
export const webhooksRouter = Router();
webhooksRouter.post(
  '/deposits',
  h(async (req, res) => {
    const secret = loadEnv().WEBHOOK_SECRET;
    if (!secret) throw Errors.unavailable('Webhooks are not configured');
    const sig = String(req.headers['x-signature'] ?? '');
    const m = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(sig);
    const raw = (req as Request & { rawBody?: string }).rawBody ?? '';
    if (
      !m ||
      Math.abs(Date.now() / 1000 - Number(m[1])) > 300 ||
      !safeEqual(hmac(secret, `${m[1]}.${raw}`), m[2]!)
    ) {
      throw Errors.unauthorized('Invalid signature');
    }
    const b = z
      .object({
        network: z.string().max(32),
        asset: z.string().max(20),
        address: z.string().max(128),
        memo: z.string().max(64).nullish(),
        txid: z.string().max(128),
        outputIndex: z.number().int().min(0).default(0),
        amount: decStr,
        confirmations: z.number().int().min(0),
      })
      .parse(req.body);
    res.json(await w.ingestDeposit({ ...b, source: 'webhook' }));
  }),
);
