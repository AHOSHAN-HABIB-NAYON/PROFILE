// Transactional email templates: responsive HTML + plain text, English, Bengali and Malay.
// The language is the user's saved language; anything else falls back to English (never mixed).
// Bengali strings need native-speaker review before release (same rule as the app strings).

export const TEMPLATE_LANGUAGES = ['en', 'bn', 'ms'];

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

// Phase 5 templates (generic: subject / heading / intro / note, {placeholders}, optional lines and button).
const GENERIC = {
  en: {
    sos_summary: { subject: 'SOS from {name} has ended', heading: 'SOS ended', intro: 'The SOS {name} sent at {started} ended at {ended}.', note: 'See the full timeline in History.' },
    family_joined: { subject: '{name} joined your Nirapod family', heading: 'New family member', intro: '{name} joined your family circle as {role}.', note: 'You can manage members in Settings > Family.' },
    subscription: { subject: 'Nirapod {plan}: {status}', heading: 'Your plan', intro: '{message}', note: 'Live location and SOS always stay free.' },
    gift_received: { subject: 'A gift for your family: Nirapod {plan}', heading: 'A gift for your family', intro: '{from} gave your family Nirapod {plan} for {duration}.', note: '{message}' },
    gift_redeemed: { subject: 'Your Nirapod gift was activated', heading: 'Your gift arrived', intro: '{family} is now on Nirapod {plan} thanks to you.', note: 'Thank you for keeping your family safe.' },
    daily_summary: { subject: 'Your family today', heading: 'Daily family summary', intro: 'Here is how your family is doing ({date}).', note: 'Open Nirapod for live locations. You can turn this email off in Settings.' },
    chat_inactivity: { subject: 'Are you still there?', heading: 'Your support chat', intro: 'We have not heard from you for a few minutes. Reply in the app or the chat will close soon.', note: 'You can always start a new chat.' },
    announcement: { subject: '{title}', heading: '{title}', intro: '{body}', note: 'You can turn announcements off in Settings > Notifications and email.' },
    data_export: { subject: 'Your Nirapod data is ready', heading: 'Your data is ready', intro: 'You asked for a copy of your Nirapod data. Download it with the button below.', note: 'The link works once and expires in 7 days. If you did not ask for this, change your password.', button: 'Download my data' },
    delete_confirm: { subject: 'Confirm deleting your Nirapod account', heading: 'Delete your account?', intro: 'Someone asked to delete the Nirapod account for this email. Press the button to confirm. This cannot be undone.', note: 'The link expires in 24 hours. If you did not ask for this, ignore this email and nothing will change.', button: 'Confirm deletion' },
    support_new_chat: { subject: 'New support chat{urgent}', heading: 'New support chat', intro: 'A user started a chat ({status}). Open the admin panel to read it.', note: 'This email contains no chat content or location data.' },
  },
  bn: {
    sos_summary: { subject: '{name}-এর SOS শেষ হয়েছে', heading: 'SOS শেষ', intro: '{name} {started}-এ যে SOS পাঠিয়েছিল তা {ended}-এ শেষ হয়েছে।', note: 'পুরো বিবরণ History-তে দেখুন।' },
    family_joined: { subject: '{name} আপনার Nirapod পরিবারে যোগ দিয়েছে', heading: 'নতুন সদস্য', intro: '{name} {role} হিসেবে আপনার পরিবারে যোগ দিয়েছে।', note: 'সেটিংস > পরিবার থেকে সদস্যদের পরিচালনা করুন।' },
    subscription: { subject: 'Nirapod {plan}: {status}', heading: 'আপনার প্ল্যান', intro: '{message}', note: 'লাইভ লোকেশন ও SOS সবসময় ফ্রি।' },
    gift_received: { subject: 'আপনার পরিবারের জন্য উপহার: Nirapod {plan}', heading: 'পরিবারের জন্য উপহার', intro: '{from} আপনার পরিবারকে {duration}-এর জন্য Nirapod {plan} উপহার দিয়েছেন।', note: '{message}' },
    gift_redeemed: { subject: 'আপনার Nirapod উপহার চালু হয়েছে', heading: 'উপহার পৌঁছেছে', intro: 'আপনার জন্য {family} এখন Nirapod {plan} ব্যবহার করছে।', note: 'পরিবারকে নিরাপদ রাখার জন্য ধন্যবাদ।' },
    daily_summary: { subject: 'আজ আপনার পরিবার', heading: 'পরিবারের দৈনিক সারাংশ', intro: 'আপনার পরিবার কেমন আছে ({date})।', note: 'লাইভ অবস্থান দেখতে Nirapod খুলুন। সেটিংস থেকে এই ইমেইল বন্ধ করা যায়।' },
    chat_inactivity: { subject: 'আপনি কি এখনো আছেন?', heading: 'আপনার সাপোর্ট চ্যাট', intro: 'কয়েক মিনিট আপনার কোনো উত্তর পাইনি। অ্যাপে উত্তর দিন, নাহলে চ্যাটটি শিগগির বন্ধ হবে।', note: 'আপনি যেকোনো সময় নতুন চ্যাট শুরু করতে পারেন।' },
    announcement: { subject: '{title}', heading: '{title}', intro: '{body}', note: 'সেটিংস > নোটিফিকেশন ও ইমেইল থেকে ঘোষণা বন্ধ করা যায়।' },
    data_export: { subject: 'আপনার Nirapod ডেটা তৈরি', heading: 'আপনার ডেটা তৈরি', intro: 'আপনি আপনার Nirapod ডেটার কপি চেয়েছেন। নিচের বাটন থেকে ডাউনলোড করুন।', note: 'লিংকটি একবারই কাজ করবে এবং ৭ দিনে মেয়াদ শেষ হবে। আপনি না চাইলে পাসওয়ার্ড বদলে নিন।', button: 'আমার ডেটা ডাউনলোড করুন' },
    delete_confirm: { subject: 'Nirapod অ্যাকাউন্ট মুছে ফেলা নিশ্চিত করুন', heading: 'অ্যাকাউন্ট মুছবেন?', intro: 'এই ইমেইলের Nirapod অ্যাকাউন্ট মুছে ফেলার অনুরোধ এসেছে। নিশ্চিত করতে বাটনে চাপুন। এটি আর ফেরানো যাবে না।', note: 'লিংকটি ২৪ ঘণ্টায় মেয়াদ শেষ হবে। আপনি না চাইলে এই ইমেইল উপেক্ষা করুন, কিছুই বদলাবে না।', button: 'মুছে ফেলা নিশ্চিত করুন' },
    support_new_chat: { subject: 'নতুন সাপোর্ট চ্যাট{urgent}', heading: 'নতুন সাপোর্ট চ্যাট', intro: 'একজন ব্যবহারকারী চ্যাট শুরু করেছেন ({status})। পড়তে অ্যাডমিন প্যানেল খুলুন।', note: 'এই ইমেইলে চ্যাটের লেখা বা অবস্থান নেই।' },
  },
  ms: {
    dir: 'ltr',
    footer: 'Anda menerima e-mel ini kerana akaun Nirapod anda. Jika ini bukan anda, abaikan sahaja.',
    verify_email: { subject: 'Kod pengesahan Nirapod anda', heading: 'Sahkan e-mel anda', intro: 'Masukkan kod ini dalam aplikasi untuk melengkapkan akaun anda:', note: 'Kod tamat tempoh dalam 10 minit. Jangan kongsi dengan sesiapa, termasuk sokongan Nirapod.' },
    reset_password: { subject: 'Kod tetapan semula kata laluan Nirapod', heading: 'Tetapkan semula kata laluan', intro: 'Masukkan kod ini dalam aplikasi untuk memilih kata laluan baharu:', note: 'Kod tamat tempoh dalam 10 minit. Jika anda tidak memintanya, abaikan e-mel ini.' },
    welcome: { subject: 'Selamat datang ke Nirapod', heading: 'Selamat datang ke Nirapod', intro: 'Akaun anda sudah sedia. Cipta bulatan keluarga anda dan jemput orang tersayang.', note: 'Nirapod tidak pernah menjejak secara tersembunyi: semua ahli keluarga sentiasa nampak bila perkongsian lokasi aktif.' },
    new_device_login: { subject: 'Log masuk baharu ke akaun Nirapod anda', heading: 'Log masuk baharu', intro: 'Akaun anda baru sahaja digunakan untuk log masuk pada peranti baharu:', note: 'Jika ini bukan anda, tetapkan semula kata laluan dan log keluar peranti lain di Profil > Peranti dan sesi.', device: 'Peranti', time: 'Masa', unknownDevice: 'Peranti tidak diketahui' },
    sos_alert: { subject: 'SOS daripada {name}', heading: '{name} perlukan bantuan', intro: '{name} menekan SOS dalam Nirapod pada {time}.', map: 'Buka lokasi pada peta', noMap: 'Lokasi tidak tersedia semasa SOS dihantar. Buka Nirapod untuk melihat kedudukan terkini.', emergency: 'Nombor kecemasan: {numbers}', note: 'Hubungi {name} atau perkhidmatan kecemasan sekarang. Buka Nirapod untuk melihat lokasi langsung.' },
    family_invite: { subject: 'Anda dijemput ke keluarga Nirapod', heading: 'Sertai keluarga anda di Nirapod', intro: '{inviter} menjemput anda ke bulatan keluarga mereka. Pasang Nirapod, log masuk dengan e-mel ini dan masukkan kod ini:', note: 'Kod tamat tempoh dalam 7 hari. Lokasi anda dikongsi hanya selepas anda bersetuju dalam aplikasi, dan boleh dijeda bila-bila masa.' },
    sos_summary: { subject: 'SOS daripada {name} telah tamat', heading: 'SOS tamat', intro: 'SOS yang dihantar oleh {name} pada {started} tamat pada {ended}.', note: 'Lihat garis masa penuh dalam Sejarah.' },
    family_joined: { subject: '{name} menyertai keluarga Nirapod anda', heading: 'Ahli keluarga baharu', intro: '{name} menyertai bulatan keluarga anda sebagai {role}.', note: 'Urus ahli di Tetapan > Keluarga.' },
    subscription: { subject: 'Nirapod {plan}: {status}', heading: 'Pelan anda', intro: '{message}', note: 'Lokasi langsung dan SOS sentiasa percuma.' },
    gift_received: { subject: 'Hadiah untuk keluarga anda: Nirapod {plan}', heading: 'Hadiah untuk keluarga anda', intro: '{from} menghadiahkan Nirapod {plan} kepada keluarga anda selama {duration}.', note: '{message}' },
    gift_redeemed: { subject: 'Hadiah Nirapod anda telah diaktifkan', heading: 'Hadiah anda telah sampai', intro: '{family} kini menggunakan Nirapod {plan} terima kasih kepada anda.', note: 'Terima kasih kerana menjaga keselamatan keluarga anda.' },
    daily_summary: { subject: 'Keluarga anda hari ini', heading: 'Ringkasan harian keluarga', intro: 'Beginilah keadaan keluarga anda ({date}).', note: 'Buka Nirapod untuk lokasi langsung. Anda boleh mematikan e-mel ini dalam Tetapan.' },
    chat_inactivity: { subject: 'Anda masih di sana?', heading: 'Sembang sokongan anda', intro: 'Kami tidak mendengar daripada anda beberapa minit. Balas dalam aplikasi atau sembang akan ditutup.', note: 'Anda boleh memulakan sembang baharu bila-bila masa.' },
    announcement: { subject: '{title}', heading: '{title}', intro: '{body}', note: 'Matikan pengumuman di Tetapan > Pemberitahuan dan e-mel.' },
    data_export: { subject: 'Data Nirapod anda sudah sedia', heading: 'Data anda sudah sedia', intro: 'Anda meminta salinan data Nirapod anda. Muat turun dengan butang di bawah.', note: 'Pautan berfungsi sekali dan tamat dalam 7 hari. Jika bukan anda, tukar kata laluan.', button: 'Muat turun data saya' },
    delete_confirm: { subject: 'Sahkan pemadaman akaun Nirapod', heading: 'Padam akaun anda?', intro: 'Seseorang meminta untuk memadam akaun Nirapod bagi e-mel ini. Tekan butang untuk mengesahkan. Ini tidak boleh dibatalkan.', note: 'Pautan tamat dalam 24 jam. Jika bukan anda, abaikan e-mel ini.', button: 'Sahkan pemadaman' },
    support_new_chat: { subject: 'Sembang sokongan baharu{urgent}', heading: 'Sembang sokongan baharu', intro: 'Pengguna memulakan sembang ({status}). Buka panel admin untuk membacanya.', note: 'E-mel ini tidak mengandungi isi sembang atau data lokasi.' },
  },
};
T.ms = GENERIC.ms;
Object.assign(T.en, GENERIC.en);
Object.assign(T.bn, GENERIC.bn);
export const GENERIC_TEMPLATES = Object.keys(GENERIC.en);

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
  const fill = (str) => String(str ?? '').replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'numbers') return vars.emergency ?? '';
    const v = vars[k];
    return v == null ? '' : String(v);
  });
  if (GENERIC_TEMPLATES.includes(template)) {
    const lines = Array.isArray(vars.lines) ? vars.lines.filter(Boolean) : [];
    const list = lines.length
      ? `<ul class="t" style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:#0F2A24;">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
      : '';
    const note = fill(t.note).trim();
    const btn = vars.url && t.button
      ? `<p style="margin:8px 0 16px;"><a href="${esc(vars.url)}" style="display:inline-block;padding:14px 22px;background:#047857;color:#FFFFFF;border-radius:12px;font-weight:700;text-decoration:none;">${esc(t.button)}</a></p>`
      : '';
    bodyHtml = p(fill(t.intro)) + list + btn + (note ? muted(note) : '');
    text = `${fill(t.heading)}\n\n${fill(t.intro)}\n${lines.map((l) => `- ${l}`).join('\n')}${vars.url && t.button ? `\n${t.button}: ${vars.url}` : ''}\n\n${note}`;
    return {
      subject: fill(t.subject),
      html: layout({ lang, dir: L.dir, heading: fill(t.heading), bodyHtml, footer: L.footer }),
      text: `${text}\n\n--\n${L.footer}\n`,
      language: lang,
    };
  }
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
