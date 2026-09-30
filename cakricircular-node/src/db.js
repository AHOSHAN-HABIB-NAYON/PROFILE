/* ─────────────────────────────────────────────
   MySQL/MariaDB — ছোট পুল (Hostinger-এর কানেকশন লিমিটের জন্য)
   সব সময়ই ঢাকার সময়ে চলে, তাই NOW()/CURDATE() পুরোনো সাইটের মতোই আচরণ করে।
   ───────────────────────────────────────────── */
import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool;

export function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: config.db.pool,
    queueLimit: 200,
    dateStrings: true,          // তারিখ স্ট্রিং হিসেবে আসে: "2026-09-30 10:15:00"
    timezone: '+06:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    supportBigNumbers: true,
    decimalNumbers: true,
  });
  pool.on('connection', (c) => c.query("SET time_zone = '+06:00', NAMES utf8mb4"));
  return pool;
}

/** সব সারি */
export async function all(sql, args = []) {
  const [rows] = await getPool().query(sql, args);
  return rows;
}
/** প্রথম সারি বা null */
export async function one(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || null;
}
/** প্রথম সারির প্রথম কলাম */
export async function col(sql, args = [], def = null) {
  const r = await one(sql, args);
  if (!r) return def;
  const v = Object.values(r)[0];
  return v === null || v === undefined ? def : v;
}
/** INSERT/UPDATE/DELETE → {insertId, affectedRows} */
export async function run(sql, args = []) {
  const [res] = await getPool().query(sql, args);
  return res;
}
/** ট্রানজ্যাকশন */
export async function tx(fn) {
  const c = await getPool().getConnection();
  try {
    await c.beginTransaction();
    const q = async (sql, args = []) => (await c.query(sql, args))[0];
    const out = await fn(q);
    await c.commit();
    return out;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function closePool() { if (pool) { await pool.end(); pool = null; } }
