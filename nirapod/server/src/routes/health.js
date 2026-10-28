import { Router } from 'express';

export function healthRouter({ db, version }) {
  const r = Router();
  r.get('/health', async (req, res) => {
    let dbStatus = 'ok';
    try {
      await db.raw('SELECT 1');
    } catch {
      dbStatus = 'down';
    }
    const ok = dbStatus === 'ok';
    res.status(ok ? 200 : 503).set('cache-control', 'no-store').json({
      status: ok ? 'ok' : 'degraded',
      version,
      db: dbStatus,
      uptime_s: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  });
  return r;
}
