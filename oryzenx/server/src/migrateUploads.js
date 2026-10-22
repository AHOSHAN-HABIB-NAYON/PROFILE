// One-time move of old disk uploads (/uploads/...) into the `files` table, so images survive
// redeploys on managed hosting where the app folder is replaced. Safe to run on every start:
// only URLs still pointing at /uploads/ are touched, missing files are skipped, errors are logged.
const fs = require('fs/promises');
const path = require('path');
const { query, getSetting, setSetting } = require('./db');
const { ROOT } = require('./lib/uploads');

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

// Returns the new /files/<id>.<ext> URL, or null when the file can't be moved.
async function moveFile(url, kind, ownerId) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const p = path.normalize(path.join(ROOT, url.slice('/uploads/'.length).split('?')[0]));
  if (!p.startsWith(ROOT + path.sep)) return null;
  let ext = path.extname(p).slice(1).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null;
  let buf;
  try { buf = await fs.readFile(p); } catch { return null; } // missing file: skip silently
  if (ext === 'jpeg') ext = 'jpg';
  const r = await query('INSERT INTO files (owner_id, kind, mime, data) VALUES (?, ?, ?, ?)', [ownerId, kind, mime, buf]);
  return `/files/${r.insertId}.${ext}`;
}

async function migrateUploads() {
  let moved = 0;
  try {
    const users = await query("SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/uploads/%'");
    for (const u of users) {
      try {
        const url = await moveFile(u.avatar_url, 'avatars', u.id);
        if (url) { await query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, u.id]); moved++; }
      } catch (err) { console.error(`migrateUploads: avatar of user ${u.id} failed:`, err.message); }
    }
  } catch (err) { console.error('migrateUploads: avatars failed:', err.message); }

  try {
    const logos = await getSetting('method_logos', null);
    if (logos && typeof logos === 'object') {
      let changed = false;
      for (const [type, old] of Object.entries(logos)) {
        try {
          const url = await moveFile(old, 'logos', null);
          if (url) { logos[type] = url; changed = true; moved++; }
        } catch (err) { console.error(`migrateUploads: logo ${type} failed:`, err.message); }
      }
      if (changed) await setSetting('method_logos', logos);
    }
  } catch (err) { console.error('migrateUploads: method logos failed:', err.message); }

  if (moved) console.log(`migrateUploads: moved ${moved} image(s) from disk into the database`);
  return moved;
}

module.exports = migrateUploads;
