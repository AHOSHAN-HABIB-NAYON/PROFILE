#!/usr/bin/env node
'use strict';
/** Generates PWA / favicon PNGs from public/icons/logo-source.svg (requires sharp). */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const dir = path.join(__dirname, '..', 'public', 'icons');
const src = fs.readFileSync(path.join(dir, 'logo-source.svg'));
(async () => {
  for (const s of [72, 96, 128, 144, 152, 192, 384, 512]) await sharp(src, { density: 400 }).resize(s, s).png({ compressionLevel: 9 }).toFile(path.join(dir, `icon-${s}.png`));
  // Maskable: full-bleed brand background with the mark inside the 80% safe zone
  for (const s of [192, 512]) {
    const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 16 16" width="${Math.round(s * 0.56)}" height="${Math.round(s * 0.56)}"><defs><linearGradient id="k" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7CF2D6"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><path fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.3" stroke-linecap="round" d="M5.5 17.5h13"/><path fill="none" stroke="url(#k)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M5.5 14.5 9.3 10.8l2.9 2.6 5.3-6"/><path fill="#fff" d="M14.6 6.8h3.6v3.6z"/><circle cx="9.3" cy="10.8" r="1.25" fill="#fff"/></svg>`);
    const inner = await sharp(mark).png().toBuffer();
    await sharp({ create: { width: s, height: s, channels: 4, background: '#1E4FD8' } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2D5BFF"/><stop offset="1" stop-color="#0EB5A8"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`) }, { input: inner, gravity: 'center' }])
      .png().toFile(path.join(dir, `maskable-${s}.png`));
  }
  await sharp(src, { density: 400 }).resize(180, 180).flatten({ background: '#1E4FD8' }).png().toFile(path.join(dir, 'apple-touch-icon.png'));
  await sharp(src, { density: 400 }).resize(32, 32).png().toFile(path.join(dir, 'favicon-32.png'));
  // Monochrome notification badge
  const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="72" height="72"><path fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M4.5 15 9 10.5l3.2 2.9 6.3-7"/><path fill="#fff" d="M14.6 5.8h4.6v4.6z"/></svg>`;
  await sharp(Buffer.from(badge)).png().toFile(path.join(dir, 'badge-72.png'));
  console.log('icons generated');
})().catch((e) => { console.error(e); process.exit(1); });
