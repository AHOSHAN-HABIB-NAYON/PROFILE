import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

export type Conn = Pool | PoolConnection;

let pool: Pool | null = null;

export function createPool(url: string, size = 10): Pool {
  pool = mysql.createPool({
    uri: url,
    connectionLimit: size,
    waitForConnections: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    namedPlaceholders: false,
    enableKeepAlive: true,
  });
  return pool;
}

export function db(): Pool {
  if (!pool) throw new Error('Database pool not initialised');
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = null;
}

/** Parameterised SELECT. Never interpolate user input into SQL — always use `?` params. */
export async function query<T = Record<string, any>>(sql: string, params: unknown[] = [], conn: Conn = db()): Promise<T[]> {
  const [rows] = await conn.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function queryOne<T = Record<string, any>>(sql: string, params: unknown[] = [], conn: Conn = db()): Promise<T | null> {
  const rows = await query<T>(sql, params, conn);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: unknown[] = [], conn: Conn = db()): Promise<ResultSetHeader> {
  const [res] = await conn.query<ResultSetHeader>(sql, params);
  return res;
}

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

/** MySQL JSON columns come back as string on MariaDB and as object on MySQL. */
export function parseJson<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(v)) return parseJson<T>(v.toString('utf8'));
  return v as T;
}
