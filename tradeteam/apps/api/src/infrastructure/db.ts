import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { logger } from './logger';

/**
 * Thin, typed wrapper over mysql2. All queries use placeholders (prepared/escaped by the driver) —
 * string concatenation of user input into SQL is forbidden across the codebase.
 * DECIMAL columns are returned as strings (decimalNumbers: false) and handled with decimal.js.
 */
export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
  poolSize?: number;
  ssl?: boolean;
}

export type Row = RowDataPacket & Record<string, unknown>;
export type Executor = Pick<Pool, 'query' | 'execute'> | PoolConnection;

let pool: Pool | null = null;

export function createPool(cfg: DbConfig): Pool {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: cfg.poolSize ?? 20,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    multipleStatements: false,
    namedPlaceholders: false,
    ssl: cfg.ssl ? { rejectUnauthorized: true } : undefined,
  });
}

export function initDb(cfg: DbConfig): Pool {
  pool = createPool(cfg);
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return pool;
}

export function db(): Pool {
  if (!pool) throw new Error('Database not initialised');
  return pool;
}

export function hasDb(): boolean {
  return pool !== null;
}

export async function closeDb() {
  if (pool) await pool.end().catch(() => undefined);
  pool = null;
}

type Param = string | number | bigint | boolean | Date | null | Buffer | undefined;

export async function query<T = Row>(sql: string, params: Param[] = [], ex: Executor = db()): Promise<T[]> {
  const [rows] = await ex.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function one<T = Row>(
  sql: string,
  params: Param[] = [],
  ex: Executor = db(),
): Promise<T | null> {
  const rows = await query<T>(sql, params, ex);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: Param[] = [], ex: Executor = db()): Promise<ResultSetHeader> {
  const [res] = await ex.query<ResultSetHeader>(sql, params);
  return res;
}

/**
 * Runs `fn` inside a transaction. Deadlocks / lock wait timeouts are retried a few times with
 * jitter since those are safe to retry (the transaction was rolled back entirely).
 */
export async function tx<T>(fn: (c: PoolConnection) => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const conn = await db().getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(conn);
      await conn.commit();
      return out;
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      const code = (err as { code?: string }).code;
      if ((code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') && attempt < retries) {
        logger.warn({ code, attempt }, 'transaction retry');
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

export async function pingDb(): Promise<number> {
  const t = performance.now();
  await db().query('SELECT 1');
  return Math.round((performance.now() - t) * 100) / 100;
}
