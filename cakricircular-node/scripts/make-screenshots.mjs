/* PWA ইনস্টল ডায়ালগ ও PWABuilder-এর জন্য স্ক্রিনশট বানায়।
   সাইট চালু অবস্থায় চালান:  node scripts/make-screenshots.mjs http://localhost:3100
   (playwright-core ও Chromium লাগে — শুধু ডেভেলপমেন্টে) */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:3100';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'screenshots');
const exe = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium', ...fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function shoot(file, url, { w, h, dsf, theme = 'light', mobile = false, action }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile, locale: 'bn-BD' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('cc_theme', t); localStorage.setItem('cc_nf_done', '1'); } catch (e) { /* */ } }, theme);
  const p = await ctx.newPage();
  await p.goto(base + url, { waitUntil: 'networkidle' });
  if (action) await action(p);
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(out, file) });
  await ctx.close();
  console.log('✔', file);
}
const firstPost = async (p) => { const href = await p.$eval('.pitem:not(.prem) a[href^="/post/"]', (a) => a.getAttribute('href')); return href; };

const ctx0 = await browser.newContext(); const p0 = await ctx0.newPage(); await p0.goto(base + '/', { waitUntil: 'networkidle' });
const postUrl = await p0.$$eval('.pitem a[href^="/post/"]', (as) => as.map((a) => a.getAttribute('href'))).then((l) => l[3] || l[0]); await ctx0.close();

const M = { w: 360, h: 780, dsf: 1.5, mobile: true };
await shoot('mobile-home.png', '/', M);
await shoot('mobile-post.png', postUrl, M);
await shoot('mobile-search.png', '/search', M);
await shoot('mobile-dark.png', '/', { ...M, theme: 'dark' });
const D = { w: 1280, h: 720, dsf: 1 };
await shoot('desktop-home.png', '/', D);
await shoot('desktop-post.png', postUrl, D);
await browser.close();
