'use strict';
/**
 * MySQL connection pool (mysql2/promise). All queries use prepared statements
 * (`execute`) or placeholder escaping (`query`) — never string concatenation
 * of user input.
 */
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

let pool = null;

function poolOptions(db) {
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    waitForConnections: true,
    connectionLimit: db.connectionLimit || 10,
    queueLimit: 0,
    timezone: 'Z',
    dateStrings: false,
    decimalNumbers: false, // DECIMAL comes back as string — never float money.
    supportBigNumbers: true,
    bigNumberStrings: false,
    charset: 'utf8mb4_unicode_ci',
    enableKeepAlive: true,
    namedPlaceholders: false,
  };
}

async function init(dbConfig) {
  if (pool) await pool.end().catch(() => {});
  // MySQL rounds fractional seconds by default (MariaDB truncates), so a JS timestamp could land
  // one second in the future. Enable truncation on MySQL only — MariaDB rejects that sql_mode.
  const probe = await mysql.createConnection({ ...poolOptions(dbConfig), connectionLimit: undefined, waitForConnections: undefined, queueLimit: undefined, enableKeepAlive: undefined });
  const [[ver]] = await probe.query('SELECT VERSION() AS v');
  await probe.end().catch(() => {});
  const isMaria = /mariadb/i.test(ver.v);
  const sessionSql = isMaria
    ? "SET time_zone = '+00:00'"
    : "SET time_zone = '+00:00', sql_mode = CONCAT(@@sql_mode, ',TIME_TRUNCATE_FRACTIONAL')";
  pool = mysql.createPool(poolOptions(dbConfig));
  pool.on('connection', (conn) => { conn.query(sessionSql); });
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query('SELECT VERSION() AS v');
    logger.info(`MySQL connected (${row.v})`);
  } finally {
    conn.release();
  }
  return pool;
}

function getPool() {
  if (!pool) throw new Error('Database is not initialised');
  return pool;
}

function isReady() {
  return !!pool;
}

/** SELECT helper → rows */
async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

/** First row or null */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** INSERT/UPDATE helper → ResultSetHeader */
async function run(sql, params = []) {
  const [res] = await getPool().query(sql, params);
  return res;
}

/**
 * Run `fn(conn)` inside a transaction. `conn` exposes query/one/run with the
 * same signature as the module-level helpers.
 */
async function transaction(fn) {
  const conn = await getPool().getConnection();
  const tx = {
    raw: conn,
    query: async (sql, params = []) => (await conn.query(sql, params))[0],
    one: async (sql, params = []) => (await conn.query(sql, params))[0][0] || null,
    run: async (sql, params = []) => (await conn.query(sql, params))[0],
  };
  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Test a set of credentials without touching the global pool (installer). */
async function testConnection(db, { createDatabase = false } = {}) {
  const conn = await mysql.createConnection({
    host: db.host, port: db.port, user: db.user, password: db.password,
    multipleStatements: false, connectTimeout: 8000,
  });
  try {
    const [[v]] = await conn.query('SELECT VERSION() AS version');
    if (createDatabase) {
      if (!/^[A-Za-z0-9_$-]{1,64}$/.test(db.database)) throw new Error('Invalid database name');
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
    await conn.query(`USE \`${db.database.replace(/`/g, '')}\``);
    return { version: v.version };
  } finally {
    await conn.end().catch(() => {});
  }
}

async function close() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
}

module.exports = { init, getPool, isReady, query, one, run, transaction, testConnection, close };
