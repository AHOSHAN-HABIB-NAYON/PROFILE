'use strict';
/**
 * Applies database/schema.sql (idempotent CREATE TABLE IF NOT EXISTS) and any
 * database/migrations/*.sql files not yet recorded in schema_migrations, then
 * seeds default rows. Usable from the CLI: `npm run migrate`.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const paths = require('../config/paths');
const logger = require('./logger');

async function migrate(dbConfig) {
  const conn = await mysql.createConnection({
    host: dbConfig.host, port: dbConfig.port, user: dbConfig.user, password: dbConfig.password,
    database: dbConfig.database, multipleStatements: true, timezone: 'Z',
  });
  try {
    await conn.query("SET time_zone = '+00:00'");
    const schema = fs.readFileSync(path.join(paths.DATABASE_DIR, 'schema.sql'), 'utf8');
    await conn.query(schema);
    const dir = path.join(paths.DATABASE_DIR, 'migrations');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
    const [done] = await conn.query('SELECT version FROM schema_migrations');
    const applied = new Set(done.map((r) => r.version));
    for (const f of files) {
      if (applied.has(f)) continue;
      logger.info(`Applying migration ${f}`);
      await conn.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [f]);
    }
    return { migrations: files.length };
  } finally {
    await conn.end();
  }
}

module.exports = { migrate };

if (require.main === module) {
  const config = require('../config/env');
  const db = require('../config/database');
  const { seed } = require('./seed');
  (async () => {
    await migrate(config.db);
    await db.init(config.db);
    await seed();
    await db.close();
    logger.info('Migration complete');
  })().catch((err) => { logger.error('Migration failed', { err: err.message }); process.exit(1); });
}
