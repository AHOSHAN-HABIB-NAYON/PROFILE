'use strict';
const mysql = require('mysql2/promise');

let pool = null;

function connect(dbCfg) {
  if (pool) pool.end().catch(() => {});
  pool = mysql.createPool({
    host: dbCfg.host || 'localhost',
    port: Number(dbCfg.port) || 3306,
    user: dbCfg.user,
    password: dbCfg.password,
    database: dbCfg.name,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: Number(dbCfg.connectionLimit) || 8,
    maxIdle: 4,
    idleTimeout: 60000,
    enableKeepAlive: true,
    dateStrings: false,
    timezone: tzOffset(),
    supportBigNumbers: true,
  });
  // keep MySQL NOW()/CURDATE() in the same zone the app writes dates in
  pool.pool.on('connection', (conn) => { conn.query(`SET time_zone = '${tzOffset()}'`); });
  return pool;
}

/** "+06:00" style offset of the app's timezone (process.env.TZ, default Asia/Dhaka). */
function tzOffset() {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

async function testConnection(dbCfg) {
  const conn = await mysql.createConnection({
    host: dbCfg.host || 'localhost', port: Number(dbCfg.port) || 3306,
    user: dbCfg.user, password: dbCfg.password, database: dbCfg.name, charset: 'utf8mb4',
    connectTimeout: 8000,
  });
  const [[row]] = await conn.query('SELECT VERSION() AS v');
  await conn.end();
  return row.v;
}

/** Prepared statement returning rows. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params.map(normalize));
  return rows;
}
/** Plain query (for IN (?) expansion / DDL). Still parameterised via escaping. */
async function raw(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
async function val(sql, params = []) {
  const row = await one(sql, params);
  return row ? Object.values(row)[0] : null;
}
async function insert(table, data) {
  const keys = Object.keys(data);
  const sql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const res = await query(sql, keys.map((k) => data[k]));
  return res.insertId;
}
async function update(table, data, where, whereParams = []) {
  const keys = Object.keys(data);
  if (!keys.length) return 0;
  const sql = `UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE ${where}`;
  const res = await query(sql, [...keys.map((k) => data[k]), ...whereParams]);
  return res.affectedRows;
}

function normalize(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function ready() { return !!pool; }
function getPool() { return pool; }

module.exports = { connect, testConnection, query, raw, one, val, insert, update, ready, getPool };
