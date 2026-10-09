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

export class SmtpMailer implements Mailer {
  private transport: Transporter;
  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
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
