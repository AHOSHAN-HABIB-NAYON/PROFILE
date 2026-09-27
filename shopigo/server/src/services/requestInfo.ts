import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { cache } from '../core/cache.js';
import { hmac } from '../core/crypto.js';
import { logger } from '../core/logger.js';

/** Client IP (Express resolves X-Forwarded-For according to `trust proxy`). */
export function clientIp(req: Request): string | null {
  const ip = req.ip ?? null;
  return ip ? ip.replace(/^::ffff:/, '') : null;
}

/**
 * The browser sends a random persistent id + a coarse fingerprint. We never
 * store it raw: it is HMAC'd with APP_SECRET so it cannot be correlated
 * outside this installation.
 */
export function deviceHash(req: Request, raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 256) return null;
  return hmac(`device:${raw}`);
}

export function deviceInfo(req: Request) {
  const ua = req.get('user-agent') ?? '';
  const r = new UAParser(ua).getResult();
  return {
    browser: [r.browser.name, r.browser.major].filter(Boolean).join(' ') || null,
    os: [r.os.name, r.os.version].filter(Boolean).join(' ') || null,
    device: [r.device.vendor, r.device.model].filter(Boolean).join(' ') || null,
    type: r.device.type ?? 'desktop',
    language: req.get('accept-language')?.split(',')[0] ?? null,
  };
}

function isPrivate(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fc|fd|fe80)/i.test(ip) || ip === 'localhost';
}

/** Approximate location via a keyless HTTPS geo-IP service; cached for a week. */
export async function ipLocation(ip: string | null): Promise<string | null> {
  if (!ip || isPrivate(ip)) return null;
  return cache.remember(`geoip:${ip}`, 7 * 24 * 3600, async () => {
    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,connection`, { signal: AbortSignal.timeout(5000) });
      const d = (await res.json()) as { success?: boolean; city?: string; region?: string; country?: string; connection?: { isp?: string } };
      if (!d.success) return null as unknown as string;
      return [d.city, d.region, d.country].filter(Boolean).join(', ') + (d.connection?.isp ? ` (${d.connection.isp})` : '');
    } catch (err) {
      logger.debug({ err: (err as Error).message }, 'ip geolocation failed');
      return null as unknown as string;
    }
  });
}
