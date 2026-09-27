// Copies non-TS server assets (geo data, etc.) into server/dist after tsc.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'server', 'src', 'data');
const dest = path.join(root, 'server', 'dist', 'data');
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log(`copied ${fs.readdirSync(src).length} data file(s) to server/dist/data`);
