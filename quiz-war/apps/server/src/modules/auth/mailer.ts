import { renderEmail } from '../emails/email.service';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mailer {
  send(msg: { to: string; subject: string; text: string; html: string }): Promise<void>;
}

/** Development mailer: prints the message (including links) to the log instead of sending. */
export class LogMailer implements Mailer {
  public readonly sent: { to: string; subject: string; text: string }[] = [];
  constructor(private readonly log: (o: object, m: string) => void) {}
  async send(msg: { to: string; subject: string; text: string; html: string }) {
    this.sent.push({ to: msg.to, subject: msg.subject, text: msg.text });
    this.log({ to: msg.to, subject: msg.subject, text: msg.text }, 'email (dev mailer — not sent)');
  }
}

export type SmtpConfig = string | { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } };

export class SmtpMailer implements Mailer {
  private transport: Transporter;
  constructor(cfg: SmtpConfig, private readonly from: string) {
    this.transport = nodemailer.createTransport(cfg as any);
  }
  /** Connects and authenticates without sending anything (admin "test connection"). */
  async verify() {
    await this.transport.verify();
  }
  async send(msg: { to: string; subject: string; text: string; html: string }) {
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}

/** Bilingual (Bangla first) account emails: verify address / reset password. */
export function actionEmail(webUrl: string, supportEmail: string, kind: 'verify' | 'reset', url: string) {
  const p =
    kind === 'verify'
      ? {
          preheader: 'আপনার ইমেইল ঠিকানা নিশ্চিত করুন · Confirm your email',
          title: 'ইমেইল নিশ্চিত করুন · Verify your email',
          intro: 'আপনার QUIZ WAR অ্যাকাউন্ট সুরক্ষিত রাখতে নিচের বাটনে চাপ দিয়ে ইমেইল ঠিকানা নিশ্চিত করুন। Confirm your email address to secure your QUIZ WAR account.',
          button: { text: 'ইমেইল নিশ্চিত করুন · Verify email', url },
          note: 'লিংকটি ২৪ ঘণ্টা কার্যকর থাকবে। The link expires in 24 hours.',
        }
      : {
          preheader: 'পাসওয়ার্ড রিসেট করুন · Reset your password',
          title: 'পাসওয়ার্ড রিসেট · Reset your password',
          intro: 'নতুন পাসওয়ার্ড দিতে নিচের বাটনে চাপ দিন। Use the button below to choose a new password.',
          button: { text: 'নতুন পাসওয়ার্ড দিন · Reset password', url },
          note: 'লিংকটি ৩০ মিনিট কার্যকর থাকবে। আপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন। The link expires in 30 minutes; ignore this email if you did not request it.',
        };
  return renderEmail(webUrl, supportEmail, p, 'QUIZ WAR: Bangladesh');
}

/** SMTP settings from env: SMTP_URL, or SMTP_HOST/PORT/USER/PASS (Gmail: smtp.gmail.com, 465, app password). */
export function smtpConfigFromEnv(env: { SMTP_URL?: string; SMTP_HOST?: string; SMTP_PORT?: number; SMTP_USER?: string; SMTP_PASS?: string; SMTP_SECURE?: string }): SmtpConfig | null {
  if (env.SMTP_URL) return env.SMTP_URL;
  if (!env.SMTP_HOST) return null;
  const port = env.SMTP_PORT ?? 465;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' || env.SMTP_SECURE === '1' : port === 465;
  // Gmail shows app passwords in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
  const pass = (env.SMTP_PASS ?? '').replace(/\s+/g, '');
  return { host: env.SMTP_HOST, port, secure, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass } : undefined };
}
