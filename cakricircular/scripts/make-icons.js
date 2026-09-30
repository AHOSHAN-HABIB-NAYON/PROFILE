'use strict';
/* Generates default PWA icons + OG image from public/img/logo.svg (dev helper). */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const pub = path.join(__dirname, '..', 'public');
const logo = fs.readFileSync(path.join(pub, 'img', 'logo.svg'));
const out = path.join(pub, 'icons');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const s of [48, 72, 96, 144, 192, 512]) {
    await sharp(logo, { density: 600 }).resize(s, s).png().toFile(path.join(out, `icon-${s}.png`));
  }
  const inner = await sharp(logo, { density: 600 }).resize(360, 360).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#15803d' } }).composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(out, 'maskable-512.png'));
  await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
    .composite([{ input: await sharp(logo, { density: 600 }).resize(150, 150).png().toBuffer(), gravity: 'center' }]).png().toFile(path.join(out, 'apple-touch-icon.png'));
  const og = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1447a8"/><stop offset="1" stop-color="#0b2f6e"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="1050" cy="90" r="220" fill="#22c55e" opacity=".18"/><rect x="80" y="440" width="300" height="10" rx="5" fill="#22c55e"/></svg>`);
  await sharp(og).composite([{ input: await sharp(logo, { density: 600 }).resize(260, 260).png().toBuffer(), left: 860, top: 185 }]).png().toFile(path.join(out, 'og-default.png'));
  console.log('icons written to', out);
})();
