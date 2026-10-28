// Email sending with a pluggable Nodemailer transport.
// - Production/dev: SMTP from env (SMTP_HOST, ...). Without SMTP_HOST mail is discarded (jsonTransport) in dev.
// - Tests: createCaptureTransport() keeps messages in memory.
// Every send writes an email_logs row (template, language, status). Codes, addresses and bodies are never logged.
import nodemailer from 'nodemailer';
import { render } from './templates.js';
import { formatLocalTime } from '../tz/index.js';

/** In-memory Nodemailer transport for tests. `messages` holds {to, subject, text, html}. */
export function createCaptureTransport() {
  const messages = [];
  return {
    messages,
    transport: {
      name: 'capture',
      version: '1',
      send(mail, cb) {
        const d = mail.data;
        messages.push({ to: d.to, from: d.from, subject: d.subject, text: d.text, html: d.html });
        cb(null, { messageId: `<capture-${messages.length}@nirapod.test>` });
      },
    },
  };
}

export function transportFromConfig(cfg) {
  if (cfg.SMTP_HOST) {
    return {
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT || 587,
      secure: cfg.SMTP_SECURE,
      requireTLS: !cfg.SMTP_SECURE,
      auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD } : undefined,
    };
  }
  return { jsonTransport: true }; // nothing leaves the machine; nothing is logged
}

export function createMailer({ cfg, db, logger, clock, transport }) {
  const tx = nodemailer.createTransport(transport ?? transportFromConfig(cfg));
  const from = cfg.MAIL_FROM || 'Nirapod <no-reply@nirapod.app>';

  /**
   * Sends `template` to `user` (needs id, email, language). Never throws: failures are recorded in email_logs.
   * @returns {Promise<boolean>} sent
   */
  async function send(template, user, vars = {}) {
    if (!user?.email) return false;
    const msg = render(template, user.language, vars);
    const [logId] = await db('email_logs').insert({
      user_id: user.id ?? null, template, language: msg.language, status: 'queued', created_at: clock.now(),
    });
    try {
      const info = await tx.sendMail({ from, to: user.email, subject: msg.subject, text: msg.text, html: msg.html });
      await db('email_logs').where({ id: logId }).update({
        status: 'sent', provider_message_id: String(info?.messageId ?? '').slice(0, 200) || null,
      });
      return true;
    } catch (e) {
      await db('email_logs').where({ id: logId }).update({ status: 'failed', error: String(e?.code || 'send_failed').slice(0, 200) });
      logger.warn({ template, errCode: e?.code }, 'email send failed');
      return false;
    }
  }

  return {
    send,
    sendCode: (purpose, user, code) => send(purpose, user, { code }),
    sendWelcome: (user) => send('welcome', user),
    sendNewDeviceLogin(user, device) {
      const now = clock.now();
      const tz = user.timezone || 'UTC';
      const time = `${now.toISOString().slice(0, 10)} ${formatLocalTime(now, tz, { language: 'en', hour24: true })} (${tz})`;
      const label = [device?.manufacturer, device?.model].filter(Boolean).join(' ').slice(0, 100);
      return send('new_device_login', user, { device: label || null, time });
    },
  };
}
