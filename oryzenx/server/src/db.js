const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  decimalNumbers: true, // return DECIMAL as JS numbers
  dateStrings: true,     // keep DATE/DATETIME as strings (server stores UTC)
  timezone: 'Z',
  multipleStatements: false,
});

// Every connection works in the app's time zone so NOW() and CURDATE() match "today" for the group.
pool.on('connection', (conn) => { conn.query(`SET time_zone = '${config.tz}'`); });

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function getSetting(key, fallback = null) {
  const row = await one('SELECT v FROM settings WHERE k = ?', [key]);
  if (!row) return fallback;
  return typeof row.v === 'string' ? JSON.parse(row.v) : row.v;
}

async function setSetting(key, value) {
  await query(
    'INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, JSON.stringify(value)],
  );
}

module.exports = { pool, query, one, getSetting, setSetting };
