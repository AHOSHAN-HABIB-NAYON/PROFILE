import type { FastifyServerOptions } from 'fastify';

/** Never log credentials, tokens or auth secrets. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.idToken',
  '*.credential',
];

export function loggerOptions(level: string, pretty: boolean): FastifyServerOptions['logger'] {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } } : {}),
  };
}
