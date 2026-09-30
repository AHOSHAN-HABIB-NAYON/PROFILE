import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, sel, swRow, csrfField } from '../layout.js';
import { setting, setSetting, setSettings } from '../../../core/settings.js';
import { saveImage, removeFile } from '../../../core/images.js';
import { str, int, flag } from '../../../core/forms.js';
import { pruneNotices } from '../../site/data.js';
import { uploadUrl } from '../../../ui/components.js';

const TEXT = ['site_name', 'tagline', 'meta_title', 'meta_description', 'meta_keywords', 'home_h1', 'google_verification', 'footer_about', 'contact_email', 'location', 'copyright', 'footer_slogan', 'app_name', 'fb', 'twitter', 'telegram', 'whatsapp', 'maintenance_title', 'maintenance_text', 'twa_package', 'twa_fingerprint', 'page_about', 'page_privacy'];
const RESERVED = ['api', 'post', 'category', 'search', 'trending', 'notices', 'about', 'privacy', 'report', 'assets', 'uploads', 'page', 'css', 'js', 'img', 'fonts', 'icons', 'team', 'saved', 'promoted', 'notify', 'offline', 'screenshots', 'sitemap.xml', 'robots.txt'];

export default {
  perm: 'settings',
  async post(c) {
    const f = c.fields; const errs = [];
    for (const k of TEXT) if (f[k] !== undefined) await setSetting(k, str(f[k], k.startsWith('page_') ? 60000 : 1000));
    const pp = int(f.per_page, 20); await setSetting('per_page', [10, 20, 30, 50, 70, 100].includes(pp) ? pp : 20);
    await setSetting('promo_gap', Math.max(2, Math.min(20, int(f.promo_gap, 5))));
    await setSetting('notice_limit', Math.max(10, Math.min(200, int(f.notice_limit, 50)))); await pruneNotices();
    await setSetting('maintenance', flag(f.maintenance) ? '1' : '0'); await setSetting('geo_lookup', flag(f.geo_lookup) ? '1' : '0');
    const slug = str(f.admin_slug, 30);
    if (slug) { if (!/^[a-zA-Z0-9_-]{3,30}$/.test(slug)) errs.push('এডমিন পথে শুধু a-z, 0-9, -, _ (৩-৩০ অক্ষর) চলবে।'); else if (RESERVED.includes(slug.toLowerCase())) errs.push('এই নামটি সংরক্ষিত, অন্য নাম দিন।'); else await setSetting('admin_slug', slug); }
    for (const [k, w] of [['logo', 900], ['favicon', 256], ['default_og', 1200]]) {
      const file = c.files[k]?.[0]; if (!file) continue;
      const r = await saveImage(file, { folder: 'site', maxW: w }); if (r.file) { removeFile('site', setting(k)); await setSetting(k, r.file); } else errs.push(r.err);
    }
    const newSlug = setting('admin_slug', 'v2admin');
    return c.go(`/${newSlug}/settings`, errs.length ? 'err' : 'ok', errs.length ? errs.join(' ') : 'সেটিংস সংরক্ষণ হয়েছে।');
  },
  async get(c) {
    const s = (k, d = '') => setting(k, d);
    const img = (k, f = 'site') => (s(k) ? html`<div class="med" style="max-width:140px;margin-top:8px"><img src="${uploadUrl(s(k), f)}" alt="" style="aspect-ratio:1;object-fit:contain;background:#fff"></div>` : '');
    return c.page('সেটিংস', html`<form method="post" enctype="multipart/form-data">${csrfField(c.csrf)}
${card('সাইটের পরিচয়', 'globe', html`<div class="grid g2">${field('সাইটের নাম', input('site_name', s('site_name', 'চাকরি সার্কুলার')))}${field('নামের নিচের লেখা', input('tagline', s('tagline', 'সঠিক তথ্য, আপনার সফলতা')))}${field('অ্যাপের নাম (ইনস্টলে দেখায়)', input('app_name', s('app_name', 'Cakricircular')))}${field('হোম পেজের H1', input('home_h1', s('home_h1', 'চাকরি সার্কুলার ও আজকের চাকরির খবর')))}</div>
<div class="grid g3" style="margin-top:12px">${field('লোগো', html`<input type="file" name="logo" accept="image/*">${img('logo')}`)}${field('ফ্যাভিকন', html`<input type="file" name="favicon" accept="image/*">${img('favicon')}`)}${field('শেয়ার কার্ডের ছবি (১২০০×৬৩০)', html`<input type="file" name="default_og" accept="image/*">${img('default_og')}`)}</div>`)}
${card('SEO', 'search', html`<div class="grid">${field('মেটা টাইটেল (হোম)', input('meta_title', s('meta_title')))}${field('মেটা বিবরণ (হোম)', html`<textarea name="meta_description" style="min-height:80px">${s('meta_description')}</textarea>`)}${field('কীওয়ার্ড', input('meta_keywords', s('meta_keywords')))}${field('Google Search Console ভেরিফিকেশন কোড', input('google_verification', s('google_verification')), 'শুধু content="…" এর ভেতরের কোডটুকু')}</div>`)}
${card('ফুটার ও যোগাযোগ', 'mail', html`<div class="grid g2">${field('ফুটারের বর্ণনা', html`<textarea name="footer_about" style="min-height:80px">${s('footer_about')}</textarea>`)}<div class="grid">${field('ইমেইল', input('contact_email', s('contact_email')))}${field('এলাকা', input('location', s('location', 'Bangladesh')))}</div>${field('কপিরাইট লেখা', input('copyright', s('copyright')))}${field('স্লোগান (ফুটারের নিচে)', input('footer_slogan', s('footer_slogan', 'ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ')))}</div>
<div class="grid g2" style="margin-top:12px">${field('ফেসবুক', input('fb', s('fb')))}${field('X (টুইটার)', input('twitter', s('twitter')))}${field('টেলিগ্রাম', input('telegram', s('telegram')))}${field('হোয়াটসঅ্যাপ', input('whatsapp', s('whatsapp')))}</div>`)}
${card('তালিকা ও বিজ্ঞাপন', 'list', html`<div class="grid g3">${field('প্রতি পেজে পোস্ট', sel('per_page', s('per_page', '20'), [10, 20, 30, 50, 70, 100].map((x) => [x, x])))}${field('প্রতি কয়টি পোস্টের পর বিজ্ঞাপন', input('promo_gap', s('promo_gap', '5'), { type: 'number' }))}${field('নোটিশ সর্বোচ্চ কয়টি', input('notice_limit', s('notice_limit', '50'), { type: 'number' }))}</div>`)}
${card('আমাদের সম্পর্কে / গোপনীয়তা (ঐচ্ছিক)', 'file-text', html`<p class="hint" style="margin:0 0 10px">খালি রাখলে ডিফল্ট লেখা দেখাবে। লিখলে সেটাই দেখাবে (HTML বা সাদা লেখা)।</p><div class="grid g2">${field('আমাদের সম্পর্কে', html`<textarea name="page_about" style="min-height:140px">${s('page_about')}</textarea>`)}${field('গোপনীয়তা ও নিরাপত্তা', html`<textarea name="page_privacy" style="min-height:140px">${s('page_privacy')}</textarea>`)}</div>`)}
${card('নিরাপত্তা ও সিস্টেম', 'lock', html`${swRow('maintenance', s('maintenance') === '1', 'মেইনটেন্যান্স মোড', 'চালু থাকলে ভিজিটর আপডেট-স্ক্রিন দেখবে। লগইন করা এডমিন সবসময় আসল সাইট দেখবে — পরীক্ষা করতে প্রাইভেট উইন্ডো ব্যবহার করুন।')}
<div class="grid g2" style="margin-top:8px">${field('মেইনটেন্যান্সের শিরোনাম', input('maintenance_title', s('maintenance_title', 'আপডেট চলছে')))}${field('মেইনটেন্যান্সের লেখা', input('maintenance_text', s('maintenance_text')))}</div>
${swRow('geo_lookup', s('geo_lookup', '1') === '1', 'ভিজিটরের লোকেশন (ip-api.com)', 'হোস্টিং আউটগোয়িং কানেকশন ব্লক করলে “অজানা” দেখাবে — বন্ধ করে দিতে পারেন।')}
${field('গোপন এডমিন পথ', input('admin_slug', s('admin_slug', 'v2admin')), 'সেভ করলে নতুন ঠিকানায় চলে যাবেন। মনে রাখুন!')}`)}
${card('Play Store / Android অ্যাপ (PWABuilder)', 'phone2', html`<p class="hint" style="margin:0 0 10px">PWABuilder থেকে Android প্যাকেজ বানালে যে Package ID ও SHA-256 fingerprint পাবেন সেটা এখানে বসান — <code>/.well-known/assetlinks.json</code> নিজে থেকে তৈরি হবে।</p><div class="grid g2">${field('Package ID', input('twa_package', s('twa_package'), { ph: 'com.cakricircular.app' }))}${field('SHA-256 fingerprint (কমা দিয়ে একাধিক)', input('twa_fingerprint', s('twa_fingerprint')))}</div>`)}
<div class="save-bar"><button class="btn" type="submit">${ic('save')}সংরক্ষণ করুন</button></div></form>`);
  },
};
