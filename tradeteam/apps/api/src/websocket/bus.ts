import { hasRedis, redisPub } from '../infrastructure/redis';
import { logger } from '../infrastructure/logger';

/**
 * Cross-process event bus over Redis Pub/Sub. Any process (API, engine, workers) can publish;
 * every WebSocket gateway instance delivers to its local sockets only.
 *
 *   tt:user            private events { u: userId, e: event, d: payload }
 *   tt:bcast           events for every connected socket
 *   tt:md:<channel>    market data for one channel (e.g. tt:md:book:BTCUSDT) — gateways subscribe
 *                      to a channel only while at least one local client is subscribed to it.
 */
export const BUS = {
  USER: 'tt:user',
  BROADCAST: 'tt:bcast',
  MD_PREFIX: 'tt:md:',
  SESSION: 'tt:session',
} as const;

function pub(channel: string, msg: string) {
  if (!hasRedis()) return;
  redisPub()
    .publish(channel, msg)
    .catch((e) => logger.error({ err: e.message, channel }, 'publish failed'));
}

export function publishUser(userId: number | string, event: string, data: unknown) {
  pub(BUS.USER, JSON.stringify({ u: String(userId), e: event, d: data }));
}

export function publishBroadcast(event: string, data: unknown) {
  pub(BUS.BROADCAST, JSON.stringify({ e: event, d: data }));
}

/** Pre-serialised once per event, independent of the number of subscribers. */
export function publishMarket(channel: string, event: string, data: unknown) {
  pub(BUS.MD_PREFIX + channel, JSON.stringify({ e: event, c: channel, d: data }));
}

/** Tell gateways to disconnect sockets that belong to a revoked session. */
export function publishSessionRevoked(sessionId: number) {
  pub(BUS.SESSION, JSON.stringify({ sid: sessionId }));
}
