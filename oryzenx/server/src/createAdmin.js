// Create (or promote) the first Super Admin:
//   npm run create-admin -- "Your Name" you@example.com 'StrongPassword1'
const bcrypt = require('bcryptjs');
const migrate = require('./migrate');
const { pool, query, one } = require('./db');

(async () => {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 8) {
    console.error('Usage: npm run create-admin -- "Name" email@example.com "password (8+ chars)"');
    process.exit(1);
  }
  await migrate();
  const hash = await bcrypt.hash(password, 12);
  const existing = await one('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing) {
    await query("UPDATE users SET role = 'super_admin', status = 'active', password_hash = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?", [hash, existing.id]);
    console.log(`Promoted ${email} to Super Admin.`);
  } else {
    await query("INSERT INTO users (name, email, password_hash, role, status, email_verified_at) VALUES (?, ?, ?, 'super_admin', 'active', NOW())", [name, email.toLowerCase(), hash]);
    console.log(`Created Super Admin ${email}.`);
  }
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
