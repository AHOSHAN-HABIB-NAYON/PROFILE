'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');

let pool = null;

function connect(dbCfg) {
  const c = dbCfg || config.get().db;
  if (pool) pool.end().catch(() => {});
  pool = mysql.createPool({
    host: c.host,
    port: c.port || 3306,
    user: c.user,
    password: c.password,
    database: c.database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL || 10),
    namedPlaceholders: false,
    decimalNumbers: false, // money stays string -> exact
    dateStrings: false,
    timezone: 'Z',
    charset: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
  // All timestamps are stored in UTC; conversion to the user's timezone happens at the edges.
  pool.on('connection', (c) => { c.query("SET time_zone='+00:00'"); });
  return pool;
}

function getPool() {
  if (!pool) connect();
  return pool;
}

/** Parameterised query. Always use ? placeholders — never interpolate input. */
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
/** For statements with dynamic IN lists / LIMIT where execute() is picky. */
async function q(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

/** Run fn inside a DB transaction. fn receives a connection with the same helpers. */
async function tx(fn) {
  const conn = await getPool().getConnection();
  const helpers = {
    conn,
    q: async (sql, params = []) => (await conn.query(sql, params))[0],
    one: async (sql, params = []) => ((await conn.query(sql, params))[0][0] || null),
  };
  try {
    await conn.beginTransaction();
    const out = await fn(helpers);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { connect, getPool, query, q, one, tx, get ready() { return !!pool; } };
