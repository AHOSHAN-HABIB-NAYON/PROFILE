/* ─────────────────────────────────────────────
   PWA: ম্যানিফেস্ট, সার্ভিস ওয়ার্কার, আইকন, অফলাইন পেজ, Play Store (assetlinks)
   PWABuilder-এর সব চেক পূরণ করার মতো করে
   ───────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { setting } from '../../core/settings.js';
import { assetVer, siteLogo } from '../../ui/layout.js';

let sharpMod; async function sharp() { if (sharpMod === undefined) { try { sharpMod = (await import('sharp')).default; } catch { sharpMod = null; } } return sharpMod; }
const iconCache = new Map();

async function logoBuffer() {
  const l = setting('logo');
  const file = l ? path.join(config.uploadDir, 'site', l) : path.join(config.publicDir, 'img/logo.svg');
  try { return { buf: fs.readFileSync(file), key: `${l}:${fs.statSync(file).mtimeMs}` }; } catch { return { buf: fs.readFileSync(path.join(config.publicDir, 'img/logo.svg')), key: 'default' }; }
}

/** লোগো থেকে আইকন: size × size, maskable হলে ৮০% নিরাপদ এলাকায় সাদা ব্যাকগ্রাউন্ডে */
export async function makeIcon(size, maskable = false) {
  const { buf, key } = await logoBuffer();
  const ck = `${key}|${size}|${maskable}`;
  if (iconCache.has(ck)) return iconCache.get(ck);
  const s = await sharp();
  if (!s) return null;
  let out;
  if (maskable) {
    const inner = Math.round(size * 0.74);
    const logo = await s(buf).resize(inner, inner, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    out = await s({ create: { width: size, height: size, channels: 4, background: '#ffffff' } }).composite([{ input: logo, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
  } else {
    out = await s(buf).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
  }
  iconCache.clear(); iconCache.set(ck, out);
  return out;
}

export function manifest(base) {
  const appName = setting('app_name', 'Cakricircular');
  const shots = [];
  const dir = path.join(config.publicDir, 'screenshots');
  const add = (file, sizes, form, label) => { if (fs.existsSync(path.join(dir, file))) shots.push({ src: `/screenshots/${file}?v=${assetVer}`, sizes, type: 'image/png', form_factor: form, label }); };
  add('mobile-home.png', '540x1170', 'narrow', 'হোম — সর্বশেষ চাকরি'); add('mobile-post.png', '540x1170', 'narrow', 'বিস্তারিত বিজ্ঞপ্তি');
  add('mobile-search.png', '540x1170', 'narrow', 'খুঁজুন'); add('mobile-dark.png', '540x1170', 'narrow', 'ডার্ক মোড');
  add('desktop-home.png', '1280x720', 'wide', 'কম্পিউটারে হোম'); add('desktop-post.png', '1280x720', 'wide', 'বিস্তারিত পেজ');
  return {
    id: '/', name: appName, short_name: appName.length > 12 ? 'চাকরি' : appName,
    description: setting('meta_description', 'চাকরি সার্কুলার — আজকের চাকরির খবর, সরকারি ও বেসরকারি নিয়োগ বিজ্ঞপ্তি, ভর্তি ও রেজাল্ট।'),
    start_url: '/?src=app', scope: '/', display: 'standalone', display_override: ['standalone', 'minimal-ui'], orientation: 'portrait',
    background_color: '#f4f7f6', theme_color: '#0f766e', lang: 'bn', dir: 'ltr', categories: ['news', 'education', 'business'],
    icons: [
      { src: `/icons/icon-192.png?v=${assetVer}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/icon-512.png?v=${assetVer}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/maskable-192.png?v=${assetVer}`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: `/icons/maskable-512.png?v=${assetVer}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: shots,
    shortcuts: [
      { name: 'নতুন চাকরি', short_name: 'চাকরি', description: 'সর্বশেষ চাকরির বিজ্ঞপ্তি', url: '/category/chakri?src=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'খুঁজুন', short_name: 'খুঁজুন', description: 'চাকরি বা প্রতিষ্ঠান খুঁজুন', url: '/search?src=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'সেভ করা পোস্ট', short_name: 'সেভড', description: 'আপনার সেভ করা চাকরি', url: '/saved?src=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'নোটিশ', short_name: 'নোটিশ', description: 'সর্বশেষ নোটিশ', url: '/notices?src=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    share_target: { action: '/search', method: 'GET', params: { title: 'q', text: 'q' } },
    launch_handler: { client_mode: 'navigate-existing' },
    prefer_related_applications: false,
  };
}

/* Play Store (TWA) — PWABuilder থেকে প্যাকেজ বানালে যে package name ও fingerprint পাবেন, সেটা এডমিন সেটিংসে বসান */
export function assetLinks() {
  const pkg = setting('twa_package', ''); const fp = setting('twa_fingerprint', '');
  if (!pkg || !fp) return [];
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fp.split(',').map((s) => s.trim()).filter(Boolean) } }];
}

export const swSource = () => {
  const src = fs.readFileSync(path.join(config.publicDir, 'js/sw.js'), 'utf8');
  return src.replace('__VERSION__', assetVer);
};
export { siteLogo };
