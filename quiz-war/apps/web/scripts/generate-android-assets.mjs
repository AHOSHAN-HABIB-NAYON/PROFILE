// Generates Android launcher icons (legacy + adaptive) and splash screens.
// Run from apps/web:  node scripts/generate-android-assets.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const res = new URL('../../android/app/src/main/res/', import.meta.url).pathname;
const logo = await readFile(new URL('../public/icons/logo.svg', import.meta.url));
const fg = await readFile(new URL('../public/icons/logo-foreground.svg', import.meta.url));
const BRAND = '#1d4ed8';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, s] of Object.entries(dens)) {
  const legacy = Math.round(48 * s);
  const adaptive = Math.round(108 * s);
  await sharp(logo).resize(legacy, legacy).png().toFile(`${res}mipmap-${d}/ic_launcher.png`);
  const mask = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`);
  await sharp(logo).resize(legacy, legacy).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(`${res}mipmap-${d}/ic_launcher_round.png`);
  await sharp(fg).resize(adaptive, adaptive).png().toFile(`${res}mipmap-${d}/ic_launcher_foreground.png`);
}
await writeFile(`${res}values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND.toUpperCase()}</color>\n</resources>\n`);
const splash = async (w, h, file) => {
  const size = Math.round(Math.min(w, h) * 0.32);
  const icon = await sharp(logo).resize(size, size).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BRAND } }).composite([{ input: icon, gravity: 'center' }]).png().toFile(file);
};
const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(port)) {
  await splash(w, h, `${res}drawable-port-${d}/splash.png`);
  await splash(h, w, `${res}drawable-land-${d}/splash.png`);
}
await splash(480, 320, `${res}drawable/splash.png`);
// Play Store listing icon (512×512, uploaded manually in Play Console)
await sharp(logo).resize(512, 512).png().toFile(new URL('../../android/play-store/icon-512.png', import.meta.url).pathname);
console.log('android assets generated');
