/* ডাটাবেসে যেসব ছবি/পিডিএফের নাম আছে, uploads ফোল্ডারে সেগুলো আছে কিনা — নেই যেগুলো তার তালিকা দেয়।
   চালান:  node scripts/check-uploads.js */
import fs from 'node:fs';
import path from 'node:path';
import { all, closePool } from '../src/db.js';
import { loadSettings, setting } from '../src/core/settings.js';
import { config } from '../src/config.js';

await loadSettings(true);
const has = (folder, f) => fs.existsSync(path.join(config.uploadDir, folder, f));
const missing = [];
for (const p of await all("SELECT id, title, thumb, pdf FROM posts WHERE deleted_at IS NULL")) {
  if (p.thumb && !has('posts', p.thumb)) missing.push(['posts', p.thumb, `পোস্ট #${p.id}: ${p.title}`]);
  if (p.pdf && !has('pdf', p.pdf)) missing.push(['pdf', p.pdf, `পোস্ট #${p.id}: ${p.title}`]);
}
for (const i of await all('SELECT post_id, image FROM post_images')) if (!has('posts', i.image)) missing.push(['posts', i.image, `পোস্ট #${i.post_id} (গ্যালারি)`]);
for (const b of await all('SELECT id, image FROM banners')) if (!has('banners', b.image)) missing.push(['banners', b.image, `ব্যানার #${b.id}`]);
for (const k of ['logo', 'favicon', 'default_og']) if (setting(k) && !has('site', setting(k))) missing.push(['site', setting(k), `সেটিংস: ${k}`]);
for (const t of await all('SELECT id, name, photo FROM team_members WHERE photo IS NOT NULL')) if (!has('team', t.photo)) missing.push(['team', t.photo, `টিম: ${t.name}`]);
console.log(`uploads ফোল্ডার: ${config.uploadDir}`);
if (!missing.length) console.log('✔ সব ফাইল আছে।');
else { console.log(`✘ ${missing.length}টি ফাইল নেই:`); for (const [f, n, w] of missing) console.log(`  uploads/${f}/${n}   ← ${w}`); }
await closePool();
