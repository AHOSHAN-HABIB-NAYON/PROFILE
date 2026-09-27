import nodemailer, { type Transporter } from 'nodemailer';
import { getSetting } from '../modules/settings/settings.service';

let transport: Transporter | null = null;
let signature = '';

export function smtpConfigured() {
  return Boolean(getSetting('smtp.host') && getSetting('smtp.from'));
}

function getTransport(): Transporter {
  const sig = [
    getSetting('smtp.host'),
    getSetting('smtp.port'),
    getSetting('smtp.user'),
    getSetting('smtp.secure'),
  ].join('|');
  if (transport && sig === signature) return transport;
  transport?.close();
  transport = nodemailer.createTransport({
    host: getSetting('smtp.host'),
    port: getSetting('smtp.port'),
    secure: getSetting('smtp.secure'),
    auth: getSetting('smtp.user')
      ? { user: getSetting('smtp.user'), pass: getSetting('smtp.password') }
      : undefined,
    pool: true,
    maxConnections: 5,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  signature = sig;
  return transport;
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  if (!smtpConfigured()) throw new Error('SMTP is not configured');
  await getTransport().sendMail({ from: getSetting('smtp.from'), to, subject, html, text });
}

export async function verifySmtp(cfg: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
}) {
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 8000,
  });
  try {
    await t.verify();
  } finally {
    t.close();
  }
}
