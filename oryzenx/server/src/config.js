require('dotenv').config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production');
}

module.exports = {
  isProd,
  port: Number(env.PORT || 8080),
  appUrl: (env.APP_URL || 'http://localhost:8080').replace(/\/$/, ''),
  appName: 'OryzenX BD',
  // UTC offset used for "today", reminders and stored times. Bangladesh is +06:00.
  tz: /^[+-]\d\d:\d\d$/.test(env.APP_TZ || '') ? env.APP_TZ : '+06:00',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'oryzenx',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'oryzenx',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 465),
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : true,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'OryzenX BD <no-reply@example.com>',
  },
};
