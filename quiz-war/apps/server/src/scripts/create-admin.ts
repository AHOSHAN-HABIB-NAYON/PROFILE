/**
 * Creates (or resets) a Super Admin. Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npm run admin:create
 * The password is read from ADMIN_PASSWORD or generated and printed once.
 */
import { randomBytes } from 'node:crypto';
import { loadEnv } from '../config/env';
import { closePool, createPool, exec, queryOne } from '../db/pool';
import { hashPassword } from '../lib/crypto';

async function run() {
  const env = loadEnv();
  createPool(env.DATABASE_URL, 2);
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim() || 'Super Admin';
  if (!email) throw new Error('Set ADMIN_EMAIL');
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  const role = await queryOne<{ id: number }>(`SELECT id FROM admin_roles WHERE role_key = 'super_admin'`);
  if (!role) throw new Error('Run migrations first');
  await exec(
    `INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role_id = VALUES(role_id), is_active = 1, failed_login_count = 0, locked_until = NULL`,
    [email, name, await hashPassword(password), role.id],
  );
  console.log(`Super Admin ready: ${email}`);
  if (generated) console.log(`Generated password (shown once, store it in your password manager): ${password}`);
}

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
