import { Router } from 'express';
import { z } from 'zod';
import { h } from '../../http/async';
import { parseQuery } from '../../http/middleware/validate';
import { requireUser } from '../../http/middleware/auth';
import { portfolio, performance } from './portfolio.service';

export const portfolioRouter = Router();
portfolioRouter.use(requireUser);
portfolioRouter.get(
  '/portfolio',
  h(async (req, res) => res.json(await portfolio(req.auth!.id))),
);
portfolioRouter.get(
  '/portfolio/performance',
  h(async (req, res) => {
    const q = parseQuery(
      z.object({ range: z.enum(['1d', '7d', '30d', '90d', '1y']).default('30d') }),
      req.query,
    );
    res.json({ range: q.range, points: await performance(req.auth!.id, q.range) });
  }),
);
