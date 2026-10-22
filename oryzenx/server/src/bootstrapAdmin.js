// For hosting without a terminal: if ADMIN_EMAIL and ADMIN_PASSWORD are set and no Super Admin
// exists yet, create one on startup. Remove the two values from .env after the first login.
const bcrypt = require('bcryptjs');
const { query, one } = require('./db');

module.exports = async function bootstrapAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) return;
  if (await one("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1")) return;
  if (password.length < 8) { console.error('ADMIN_PASSWORD must be at least 8 characters; admin not created'); return; }
  const hash = await bcrypt.hash(password, 12);
  const name = (process.env.ADMIN_NAME || 'Admin').slice(0, 120);
  const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    await query("UPDATE users SET role = 'super_admin', status = 'active', password_hash = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?", [hash, existing.id]);
  } else {
    await query("INSERT INTO users (name, email, password_hash, role, status, email_verified_at) VALUES (?, ?, ?, 'super_admin', 'active', NOW())", [name, email, hash]);
  }
  console.log(`Super Admin ready: ${email}`);
};
