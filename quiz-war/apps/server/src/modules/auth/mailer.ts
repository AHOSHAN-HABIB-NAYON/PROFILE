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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function actionEmail(title: string, intro: string, buttonText: string, url: string) {
  const text = `${title}\n\n${intro}\n\n${url}\n\nIf you did not request this, you can ignore this email.\n— QUIZ WAR: Bangladesh`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;padding:28px">
  <tr><td style="font-weight:800;font-size:18px;color:#1d4ed8">⚔️ QUIZ WAR</td></tr>
  <tr><td style="padding-top:16px;font-size:20px;font-weight:700;color:#0f172a">${esc(title)}</td></tr>
  <tr><td style="padding-top:8px;font-size:15px;color:#334155;line-height:1.5">${esc(intro)}</td></tr>
  <tr><td style="padding-top:20px"><a href="${esc(url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(buttonText)}</a></td></tr>
  <tr><td style="padding-top:20px;font-size:12px;color:#64748b">If you did not request this, you can ignore this email.</td></tr>
  </table></td></tr></table></body></html>`;
  return { text, html };
}
