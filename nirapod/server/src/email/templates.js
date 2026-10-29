// Transactional email templates: responsive HTML + plain text, English and Bengali.
// The language is the user's saved language; anything else falls back to English (never mixed).
// Bengali strings need native-speaker review before release (same rule as the app strings).

export const TEMPLATE_LANGUAGES = ['en', 'bn'];

const T = {
  en: {
    dir: 'ltr',
    footer: 'You received this email because of your Nirapod account. If this was not you, you can ignore it.',
    verify_email: {
      subject: 'Your Nirapod verification code',
      heading: 'Verify your email',
      intro: 'Enter this code in the app to finish creating your account:',
      note: 'The code expires in 10 minutes. Never share it with anyone, including Nirapod support.',
    },
    reset_password: {
      subject: 'Your Nirapod password reset code',
      heading: 'Reset your password',
      intro: 'Enter this code in the app to choose a new password:',
      note: 'The code expires in 10 minutes. If you did not ask to reset your password, you can ignore this email.',
    },
    welcome: {
      subject: 'Welcome to Nirapod',
      heading: 'Welcome to Nirapod',
      intro: 'Your account is ready. Create your family circle and invite the people you care about.',
      note: 'Nirapod never hides tracking: everyone in your family can always see when location sharing is on.',
    },
    new_device_login: {
      subject: 'New sign-in to your Nirapod account',
      heading: 'New sign-in',
      intro: 'Your account was just used to sign in on a new device:',
      note: 'If this was not you, reset your password and sign out other devices in Profile > Devices and sessions.',
      device: 'Device',
      time: 'Time',
      unknownDevice: 'Unknown device',
    },
    sos_alert: {
      subject: 'SOS from {name}',
      heading: '{name} needs help',
      intro: '{name} pressed SOS in Nirapod at {time}.',
      map: 'Open the location on the map',
      noMap: 'The location was not available when the SOS was sent. Open Nirapod to see the latest position.',
      emergency: 'Emergency numbers: {numbers}',
      note: 'Call {name} or the emergency services now. Open Nirapod to see the live location and tell the family you are responding.',
    },
    family_invite: {
      subject: 'You are invited to a Nirapod family circle',
      heading: 'Join your family on Nirapod',
      intro: '{inviter} invited you to their family circle. Install Nirapod, sign in with this email and enter this code:',
      note: 'The code expires in 7 days. Your own location is shared only after you agree in the app, and you can pause it any time.',
    },
  },
  bn: {
    dir: 'ltr',
    footer: 'আপনার Nirapod অ্যাকাউন্টের কারণে আপনি এই ইমেইলটি পেয়েছেন। এটি আপনি না হলে ইমেইলটি উপেক্ষা করুন।',
    verify_email: {
      subject: 'আপনার Nirapod যাচাই কোড',
      heading: 'আপনার ইমেইল যাচাই করুন',
      intro: 'অ্যাকাউন্ট তৈরি শেষ করতে অ্যাপে এই কোডটি লিখুন:',
      note: 'কোডটির মেয়াদ ১০ মিনিট। Nirapod সাপোর্টসহ কাউকে এই কোড দেবেন না।',
    },
    reset_password: {
      subject: 'আপনার Nirapod পাসওয়ার্ড রিসেট কোড',
      heading: 'পাসওয়ার্ড রিসেট করুন',
      intro: 'নতুন পাসওয়ার্ড বেছে নিতে অ্যাপে এই কোডটি লিখুন:',
      note: 'কোডটির মেয়াদ ১০ মিনিট। আপনি পাসওয়ার্ড রিসেট করতে না চাইলে এই ইমেইলটি উপেক্ষা করুন।',
    },
    welcome: {
      subject: 'Nirapod-এ স্বাগতম',
      heading: 'Nirapod-এ স্বাগতম',
      intro: 'আপনার অ্যাকাউন্ট প্রস্তুত। আপনার পরিবারের সার্কেল তৈরি করুন এবং প্রিয়জনদের আমন্ত্রণ জানান।',
      note: 'Nirapod কখনো লুকিয়ে ট্র্যাক করে না: লোকেশন শেয়ারিং চালু থাকলে পরিবারের সবাই তা সবসময় দেখতে পায়।',
    },
    new_device_login: {
      subject: 'আপনার Nirapod অ্যাকাউন্টে নতুন সাইন-ইন',
      heading: 'নতুন সাইন-ইন',
      intro: 'এইমাত্র একটি নতুন ডিভাইসে আপনার অ্যাকাউন্টে সাইন-ইন করা হয়েছে:',
      note: 'এটি আপনি না হলে পাসওয়ার্ড রিসেট করুন এবং প্রোফাইল > ডিভাইস ও সেশন থেকে অন্য ডিভাইসগুলো সাইন-আউট করুন।',
      device: 'ডিভাইস',
      time: 'সময়',
      unknownDevice: 'অজানা ডিভাইস',
    },
    sos_alert: {
      subject: '{name}-এর কাছ থেকে SOS',
      heading: '{name}-এর সাহায্য দরকার',
      intro: '{name} {time}-এ Nirapod-এ SOS চেপেছে।',
      map: 'ম্যাপে অবস্থান খুলুন',
      noMap: 'SOS পাঠানোর সময় অবস্থান পাওয়া যায়নি। সর্বশেষ অবস্থান দেখতে Nirapod খুলুন।',
      emergency: 'জরুরি নম্বর: {numbers}',
      note: 'এখনই {name}-কে বা জরুরি সেবায় ফোন করুন। লাইভ অবস্থান দেখতে এবং পরিবারকে জানাতে Nirapod খুলুন।',
    },
    family_invite: {
      subject: 'আপনাকে একটি Nirapod পরিবারে আমন্ত্রণ জানানো হয়েছে',
      heading: 'Nirapod-এ আপনার পরিবারে যোগ দিন',
      intro: '{inviter} আপনাকে তাঁর পরিবারের সার্কেলে আমন্ত্রণ জানিয়েছেন। Nirapod ইনস্টল করুন, এই ইমেইল দিয়ে সাইন ইন করুন এবং এই কোডটি দিন:',
      note: 'কোডটির মেয়াদ ৭ দিন। আপনি অ্যাপে সম্মতি দেওয়ার পরেই আপনার লোকেশন শেয়ার হবে, আর যেকোনো সময় তা থামাতে পারবেন।',
    },
  },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const pickLanguage = (lang) => (TEMPLATE_LANGUAGES.includes(lang) ? lang : 'en');

function layout({ lang, dir, heading, bodyHtml, footer }) {
  const font = lang === 'bn' ? "'Noto Sans Bengali','Noto Sans',Arial,sans-serif" : "'Noto Sans',Arial,sans-serif";
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(heading)}</title>
<style>
@media (max-width:600px){.card{padding:24px 20px!important}.code{font-size:28px!important;letter-spacing:6px!important}}
@media (prefers-color-scheme:dark){body,.bg{background:#0B1512!important}.card{background:#121F1B!important;border-color:#20322D!important}
.t{color:#E8F1EE!important}.m{color:#8FA39D!important}.code{background:#0B1512!important;color:#34D399!important}}
</style></head>
<body style="margin:0;padding:0;background:#F6F8F7;">
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8F7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-family:${font};font-size:20px;font-weight:700;color:#047857;">Nirapod</td></tr>
<tr><td class="card" style="background:#FFFFFF;border:1px solid #E5EAE8;border-radius:16px;padding:32px;font-family:${font};">
<h1 class="t" style="margin:0 0 12px;font-size:22px;line-height:1.4;color:#0F2A24;">${esc(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td class="m" style="padding:16px 4px;font-family:${font};font-size:12px;line-height:1.6;color:#5B6C67;">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (s) => `<p class="t" style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#0F2A24;">${esc(s)}</p>`;
const muted = (s) => `<p class="m" style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#5B6C67;">${esc(s)}</p>`;
// Code digits stay left-to-right in every language.
const codeBlock = (code) =>
  `<p dir="ltr" class="code" style="margin:8px 0;padding:16px;background:#F6F8F7;border-radius:12px;text-align:center;font-family:'Noto Sans Mono',Consolas,monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:#047857;">${esc(code)}</p>`;

/**
 * @param {'verify_email'|'reset_password'|'welcome'|'new_device_login'} template
 * @returns {{subject: string, html: string, text: string, language: string}}
 */
export function render(template, language, vars = {}) {
  const lang = pickLanguage(language);
  const L = T[lang];
  const t = L[template];
  if (!t) throw new Error(`Unknown email template ${template}`);
  let bodyHtml;
  let text;
  const fill = (str) => String(str).replaceAll('{name}', vars.name || '').replaceAll('{time}', vars.time || '').replaceAll('{numbers}', vars.emergency || '');
  if (template === 'sos_alert') {
    const button = vars.map_url
      ? `<p style="margin:8px 0 16px;"><a href="${esc(vars.map_url)}" style="display:inline-block;padding:14px 22px;background:#DC2626;color:#FFFFFF;border-radius:12px;font-weight:700;text-decoration:none;">${esc(t.map)}</a></p>`
      : p(t.noMap);
    bodyHtml = p(fill(t.intro)) + button + (vars.emergency ? p(fill(t.emergency)) : '') + muted(fill(t.note));
    text = `${fill(t.heading)}\n\n${fill(t.intro)}\n${vars.map_url ? `${t.map}: ${vars.map_url}` : t.noMap}\n${vars.emergency ? fill(t.emergency) + '\n' : ''}\n${fill(t.note)}`;
    return {
      subject: fill(t.subject),
      html: layout({ lang, dir: L.dir, heading: fill(t.heading), bodyHtml, footer: L.footer }),
      text: `${text}\n\n--\n${L.footer}\n`,
      language: lang,
    };
  }
  if (template === 'family_invite') {
    const intro = t.intro.replace('{inviter}', vars.inviter || 'A family member');
    bodyHtml = p(intro) + codeBlock(vars.code) + muted(t.note);
    text = `${t.heading}\n\n${intro}\n\n    ${vars.code}\n\n${t.note}`;
  } else if (template === 'verify_email' || template === 'reset_password') {
    bodyHtml = p(t.intro) + codeBlock(vars.code) + muted(t.note);
    text = `${t.heading}\n\n${t.intro}\n\n    ${vars.code}\n\n${t.note}`;
  } else if (template === 'new_device_login') {
    const device = vars.device || t.unknownDevice;
    bodyHtml = p(t.intro) + p(`${t.device}: ${device}`) + p(`${t.time}: ${vars.time}`) + muted(t.note);
    text = `${t.heading}\n\n${t.intro}\n${t.device}: ${device}\n${t.time}: ${vars.time}\n\n${t.note}`;
  } else {
    bodyHtml = p(t.intro) + muted(t.note);
    text = `${t.heading}\n\n${t.intro}\n\n${t.note}`;
  }
  return {
    subject: t.subject,
    html: layout({ lang, dir: L.dir, heading: t.heading, bodyHtml, footer: L.footer }),
    text: `${text}\n\n--\n${L.footer}\n`,
    language: lang,
  };
}
