import { Router } from 'express';
import { z } from 'zod';
import { isDecimalString } from '@tradeteam/shared';
import { h } from '../../http/async';
import { body, parseQuery } from '../../http/middleware/validate';
import { requireUser } from '../../http/middleware/auth';
import { rateLimit, byPrincipal } from '../../http/middleware/rate-limit';
import * as orders from './orders.service';

export const ordersRouter = Router();
ordersRouter.use(requireUser);

const decStr = z.string().refine(isDecimalString, 'Must be a positive decimal number');

const placeSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{2,30}$/),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'stop_loss']),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional(),
  price: decStr.optional(),
  stopPrice: decStr.optional(),
  quantity: decStr.optional(),
  quoteQuantity: decStr.optional(),
  clientOrderId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
});

ordersRouter.post(
  '/orders',
  rateLimit('orders', 20, 1, byPrincipal),
  body(placeSchema),
  h(async (req, res) => {
    res.status(201).json({ order: await orders.placeOrder(req.auth!.id, req.body) });
  }),
);

ordersRouter.delete(
  '/orders/:id',
  rateLimit('orders-cancel', 30, 1, byPrincipal),
  h(async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d{1,20}$/.test(id))
      return res.status(404).json({ error: { code: 'not_found', message: 'Order not found' } });
    res.json({ order: await orders.cancelOrder(req.auth!.id, id) });
  }),
);

ordersRouter.post(
  '/orders/cancel-all',
  rateLimit('orders-cancel-all', 5, 10, byPrincipal),
  body(
    z.object({
      symbol: z
        .string()
        .regex(/^[A-Z0-9]{2,30}$/)
        .optional(),
    }),
  ),
  h(async (req, res) => {
    res.json({ cancelled: await orders.cancelAll(req.auth!.id, req.body.symbol) });
  }),
);

const filters = z.object({
  symbol: z
    .string()
    .regex(/^[A-Z0-9]{2,30}$/)
    .optional(),
  side: z.enum(['buy', 'sell']).optional(),
  type: z.enum(['market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'stop_loss']).optional(),
  status: z
    .enum(['pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected', 'expired'])
    .optional(),
  open: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

ordersRouter.get(
  '/orders',
  h(async (req, res) => {
    res.json(await orders.listOrders(req.auth!.id, parseQuery(filters, req.query)));
  }),
);

ordersRouter.get(
  '/trades',
  h(async (req, res) => {
    res.json(
      await orders.listUserTrades(
        req.auth!.id,
        parseQuery(filters.omit({ type: true, status: true, open: true }), req.query),
      ),
    );
  }),
);
