'use strict';
/**
 * পুরোনো PHP সাইটের ডাটাবেস থেকে সব তথ্য আনুন (কমান্ড লাইন থেকে)।
 * এডমিন প্যানেল → "পুরোনো সাইট থেকে আনুন" পাতাতেও একই কাজ করা যায়।
 *
 *   OLD_DB_NAME=... OLD_DB_USER=... OLD_DB_PASS=... [OLD_DB_HOST=localhost] [OLD_UPLOADS=/path/to/old/uploads] node scripts/import-old.js
 */
process.env.TZ = process.env.TZ || 'Asia/Dhaka';
process.env.CC_NO_AUTOSTART = '1';
const config = require('../src/config');
const db = require('../src/db');
const migrate = require('../src/migrate');
const settings = require('../src/settings');
const importer = require('../src/importer');

(async () => {
  const cfg = config.load();
  if (!cfg) { console.error('এই সাইট এখনো ইনস্টল হয়নি — আগে /install করুন।'); process.exit(1); }
  db.connect(cfg.db);
  await migrate.run();
  await settings.load();
  const t = Date.now();
  const r = await importer.run({
    db: { host: process.env.OLD_DB_HOST || 'localhost', port: process.env.OLD_DB_PORT, name: process.env.OLD_DB_NAME, user: process.env.OLD_DB_USER, password: process.env.OLD_DB_PASS || '' },
    uploadsFrom: process.env.OLD_UPLOADS || '',
    onStep: (s) => console.log(`→ ${s}`),
  });
  console.log('\nউৎস:', r.source);
  console.log('আনা হয়েছে:', r.counts, '\nনতুন:', r.created);
  console.log(`ফাইল কপি: ${r.copied}টি`);
  if (r.warnings.length) console.log('\nসতর্কতা:\n- ' + r.warnings.join('\n- '));
  if (r.missing.length) console.log(`\nযে ফাইলগুলো নেই (${r.missing.length}):\n` + r.missing.map((m) => `- ${m.file} (${m.kind}${m.post ? `, পোস্ট #${m.post}` : ''})`).join('\n'));
  console.log(`\nসময় লেগেছে ${((Date.now() - t) / 1000).toFixed(1)}s`);
  process.exit(0);
})().catch((e) => { console.error('ব্যর্থ:', e.message); process.exit(1); });
