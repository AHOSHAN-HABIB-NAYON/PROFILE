// Generates PWA / Android launcher icons from the SVG logo. Run: npm run icons
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../public/icons/logo.svg', import.meta.url));
const out = (n) => new URL(`../public/icons/${n}`, import.meta.url).pathname;
await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
// Maskable: logo inside the 80% safe zone on brand background
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1d4ed8' } }).composite([{ input: inner, gravity: 'center' }]).png().toFile(out('maskable-512.png'));
console.log('icons generated');
