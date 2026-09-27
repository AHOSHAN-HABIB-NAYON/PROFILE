import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { LOG_DIR } from './paths.js';

function destination() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = pino.destination({ dest: path.join(LOG_DIR, 'app.log'), sync: false, mkdir: true });
    return pino.multistream([{ stream: process.stdout }, { stream: file }]);
  } catch {
    return process.stdout;
  }
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: ['password', '*.password', 'DB_PASSWORD', '*.token', '*.apiKey', '*.secret', 'req.headers.cookie', 'req.headers.authorization'],
      censor: '[redacted]',
    },
  },
  destination(),
);
