import { exec, queryOne } from '../../db/pool';
import type { Mailer } from '../auth/mailer';
import type { SettingsService } from '../settings/settings.service';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface EmailParts {
  preheader: string;
  title: string;
  intro: string;
  /** Optional highlight rows, e.g. rewards. */
  stats?: { label: string; value: string }[];
  button?: { text: string; url: string };
  note?: string;
}

/**
 * Branded, table-based HTML that renders in Gmail/Outlook/mobile mail apps.
 * No external CSS, no tracking pixels; the only image is the logo from our own site.
 */
export function renderEmail(webUrl: string, supportEmail: string, p: EmailParts, footer: string) {
  const logo = `${webUrl}/icons/icon-192.png`;
  const stats = p.stats?.length
    ? `<tr><td style="padding-top:18px"><table width="100%" cellpadding="0" cellspacing="0"><tr>${p.stats
        .map(
          (s) =>
            `<td align="center" style="background:#f1f5ff;border-radius:12px;padding:12px 6px"><div style="font-size:20px;font-weight:800;color:#1d4ed8">${esc(s.value)}</div><div style="font-size:12px;color:#475569;padding-top:2px">${esc(s.label)}</div></td>`,
        )
        .join('<td width="8"></td>')}</tr></table></td></tr>`
    : '';
  const button = p.button
    ? `<tr><td style="padding-top:22px"><a href="${esc(p.button.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">${esc(p.button.text)}</a></td></tr>`
    : '';
  const note = p.note ? `<tr><td style="padding-top:18px;font-size:13px;color:#64748b;line-height:1.5">${esc(p.note)}</td></tr>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#eef2f9;font-family:'Hind Siliguri','Segoe UI',Roboto,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="background:linear-gradient(135deg,#1d4ed8,#1e3a8a);background-color:#1d4ed8;border-radius:18px 18px 0 0;padding:22px 26px">
  <table cellpadding="0" cellspacing="0"><tr>
    <td><img src="${logo}" width="44" height="44" alt="QUIZ WAR" style="display:block;border-radius:12px"></td>
    <td style="padding-left:12px;color:#ffffff"><div style="font-weight:800;font-size:18px;letter-spacing:.04em">QUIZ WAR</div><div style="font-size:11px;letter-spacing:.2em;opacity:.8">BANGLADESH</div></td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:26px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.3">${esc(p.title)}</td></tr>
    <tr><td style="padding-top:10px;font-size:15px;color:#334155;line-height:1.6">${esc(p.intro)}</td></tr>
    ${stats}${button}${note}
  </table>
</td></tr>
<tr><td align="center" style="padding:18px 12px;font-size:12px;color:#64748b;line-height:1.6">
  ${esc(footer)}<br><a href="mailto:${esc(supportEmail)}" style="color:#1d4ed8">${esc(supportEmail)}</a>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [p.title, '', p.intro, ...(p.stats ?? []).map((s) => `${s.label}: ${s.value}`), p.button ? `\n${p.button.text}: ${p.button.url}` : '', p.note ?? '', '', footer, supportEmail]
    .filter((x) => x !== undefined)
    .join('\n');
  return { html, text };
}

type Kind = 'achievement' | 'rank' | 'streak';

/**
 * Welcome + activity emails. Activity emails go only to verified addresses that kept the
 * preference on, at most one every 12 hours per player.
 */
export class EmailService {
  constructor(
    private readonly mailer: Mailer,
    private readonly settings: SettingsService,
    private readonly webUrl: string,
    private readonly log: { error: (o: object, m: string) => void },
  ) {}

  private support() {
    return this.settings.app().supportEmail;
  }

  async welcome(userId: number) {
    if (!this.settings.app().emails.welcome) return;
    const u = await queryOne<{ email: string | null; username: string | null; uid: string; welcome_sent_at: unknown; lang: 'bn' | 'en' }>(
      `SELECT u.email, u.welcome_sent_at, u.uid, p.username, p.lang FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [userId],
    );
    if (!u?.email || u.welcome_sent_at) return;
    const claim = await exec('UPDATE users SET welcome_sent_at = UTC_TIMESTAMP() WHERE id = ? AND welcome_sent_at IS NULL', [userId]);
    if (claim.affectedRows !== 1) return;
    const name = u.username ?? 'Player';
    const bn = u.lang !== 'en';
    const mail = renderEmail(
      this.webUrl,
      this.support(),
      bn
        ? {
            preheader: 'QUIZ WAR-এ আপনাকে স্বাগতম! প্রথম ব্যাটল শুরু করুন।',
            title: `অভিনন্দন ${name}! QUIZ WAR-এ স্বাগতম`,
            intro: 'আপনার অ্যাকাউন্ট তৈরি হয়ে গেছে। এখন সারা বাংলাদেশের প্লেয়ারদের সাথে রিয়েলটাইম কুইজ ব্যাটল খেলুন, BCS-ব্যাংক-সরকারি চাকরির প্রস্তুতি নিন আর লিডারবোর্ডে নিজের নাম তুলুন।',
            stats: [
              { label: 'আপনার UID', value: u.uid },
              { label: 'শুরুর রেটিং', value: '1000' },
            ],
            button: { text: 'প্রথম ব্যাটল শুরু করুন', url: `${this.webUrl}/battle` },
            note: 'বন্ধুদের সাথে খেলতে আপনার UID বা QR কোড শেয়ার করুন। প্রতিদিন লগইন করলে ডেইলি রিওয়ার্ড পাবেন।',
          }
        : {
            preheader: 'Welcome to QUIZ WAR! Start your first battle.',
            title: `Congratulations ${name}! Welcome to QUIZ WAR`,
            intro: 'Your account is ready. Battle players across Bangladesh in real time, prepare for BCS, bank and government job exams, and climb the leaderboard.',
            stats: [
              { label: 'Your UID', value: u.uid },
              { label: 'Starting rating', value: '1000' },
            ],
            button: { text: 'Start your first battle', url: `${this.webUrl}/battle` },
            note: 'Share your UID or QR code to play with friends. Log in every day to collect daily rewards.',
          },
      bn ? 'আপনি QUIZ WAR-এ অ্যাকাউন্ট খোলায় এই ইমেইল পেয়েছেন।' : 'You received this email because you created a QUIZ WAR account.',
    );
    await this.mailer.send({ to: u.email, subject: bn ? `স্বাগতম ${name}! আপনার QUIZ WAR অ্যাকাউন্ট তৈরি হয়েছে` : `Welcome to QUIZ WAR, ${name}!`, ...mail }).catch((err) =>
      this.log.error({ err, userId }, 'welcome email failed'),
    );
  }

  /** Called for notable notifications (achievement, promotion, streak milestone). */
  async activity(userId: number, kind: Kind, title: string, body: string) {
    if (!this.settings.app().emails.activity) return;
    const u = await queryOne<{ email: string | null; verified: unknown; pref: number; lang: 'bn' | 'en'; username: string | null }>(
      `SELECT u.email, u.email_verified_at AS verified, p.email_activity AS pref, p.lang, p.username FROM users u JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = ? AND u.status = 'active'`,
      [userId],
    );
    if (!u?.email || !u.verified || !u.pref) return;
    const claim = await exec(
      `UPDATE users SET last_activity_email_at = UTC_TIMESTAMP() WHERE id = ? AND (last_activity_email_at IS NULL OR last_activity_email_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 HOUR))`,
      [userId],
    );
    if (claim.affectedRows !== 1) return;
    const bn = u.lang !== 'en';
    const cta = { achievement: '/profile/achievements', rank: '/rank', streak: '/' }[kind];
    const mail = renderEmail(
      this.webUrl,
      this.support(),
      {
        preheader: body,
        title,
        intro: body,
        button: { text: bn ? 'অ্যাপ খুলুন' : 'Open QUIZ WAR', url: `${this.webUrl}${cta}` },
        note: bn ? 'দারুণ খেলছেন! এভাবেই এগিয়ে চলুন।' : 'Great playing — keep it up!',
      },
      bn
        ? 'এই ধরনের ইমেইল বন্ধ করতে অ্যাপের সেটিংস → ইমেইল নোটিফিকেশন বন্ধ করুন।'
        : 'To stop these emails, turn off Email notifications in the app settings.',
    );
    await this.mailer.send({ to: u.email, subject: `QUIZ WAR · ${title}`, ...mail }).catch((err) => this.log.error({ err, userId }, 'activity email failed'));
  }
}
