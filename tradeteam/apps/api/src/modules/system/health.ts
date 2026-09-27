import { pingDb, hasDb } from '../../infrastructure/db';
import { pingRedis, hasRedis, redis } from '../../infrastructure/redis';
import { queue } from '../../infrastructure/queue';
import { APP_VERSION } from '../../config/paths';
import { runtime } from './runtime';
import { exchangeConfigured } from '../trading/external';
import { smtpConfigured } from '../../infrastructure/mailer';
import { registryLoadedAt, tickerCount, allMarkets } from '../markets/registry';

export async function healthReport() {
  const out: Record<string, unknown> = {
    version: APP_VERSION,
    uptimeSec: Math.round((Date.now() - runtime.startedAt) / 1000),
    mode: runtime.mode,
  };
  try {
    out.database = hasDb() ? { ok: true, latencyMs: await pingDb() } : { ok: false };
  } catch (e) {
    out.database = { ok: false, error: (e as Error).message };
  }
  try {
    out.redis = hasRedis() ? { ok: true, latencyMs: await pingRedis() } : { ok: false };
  } catch (e) {
    out.redis = { ok: false, error: (e as Error).message };
  }
  if (hasRedis()) {
    const md = await redis().get('md:health');
    out.marketData = md
      ? { ok: JSON.parse(md).connected, ...JSON.parse(md) }
      : { ok: false, detail: 'no market-data leader reporting' };
    const q: Record<string, unknown> = {};
    for (const name of ['email', 'push']) {
      try {
        q[name] = await queue(name).getJobCounts('waiting', 'active', 'failed', 'delayed');
      } catch {
        q[name] = null;
      }
    }
    out.queues = q;
  }
  out.websocket = runtime.gateway ? { ok: true, ...runtime.gateway.health() } : { ok: false };
  out.engine = runtime.engine
    ? { ok: true, ...runtime.engine.status() }
    : { ok: false, detail: 'engine not running in this process' };
  out.markets = { loadedAt: registryLoadedAt(), count: allMarkets().length, tickers: tickerCount() };
  out.services = { exchange: exchangeConfigured(), smtp: smtpConfigured() };
  out.memory = process.memoryUsage();
  return out;
}
