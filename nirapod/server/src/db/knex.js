// Two connection pools:
//  - appDb:   the API, realtime and jobs.
//  - adminDb: the admin panel. In production it uses DB_ADMIN_USER, which has NO grants on
//             location-bearing tables (tools/sql/admin-grants.sql), so the admin panel cannot read
//             locations even through a bug.
import knexFactory from 'knex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

function connection(cfg, user, password, database) {
  return {
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    user,
    password,
    database,
    charset: 'utf8mb4',
    timezone: 'Z', // store and read everything in UTC
    dateStrings: false,
  };
}

export function createDb(cfg, { admin = false, database = cfg.DB_NAME } = {}) {
  const user = admin && cfg.DB_ADMIN_USER ? cfg.DB_ADMIN_USER : cfg.DB_USER;
  const password = admin && cfg.DB_ADMIN_USER ? cfg.DB_ADMIN_PASSWORD : cfg.DB_PASSWORD;
  return knexFactory({
    client: 'mysql2',
    connection: connection(cfg, user, password, database),
    pool: { min: 0, max: cfg.DB_POOL_MAX },
    migrations: { directory: MIGRATIONS_DIR, tableName: 'knex_migrations', loadExtensions: ['.js'] },
  });
}
