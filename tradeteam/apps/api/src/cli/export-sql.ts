import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from '../database/migrations';
import { checksum } from '../database/migrator';
import { REPO_ROOT, APP_VERSION } from '../config/paths';

/**
 * Writes database/tradeteam.sql: the complete schema + seed data generated from the migrations,
 * for importing through phpMyAdmin on hosts where that is preferred. Optional migrations (DB
 * triggers that need extra privileges) are left out and applied by the installer if possible.
 * Usage: npm run export-sql -w @tradeteam/api
 */
const out: string[] = [
  `-- TradeTeam ${APP_VERSION} database schema (generated from migrations — do not edit by hand)`,
  '-- Import into an EMPTY database, then open the site and complete the installer.',
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS = 0;',
  '',
  `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT UNSIGNED PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  checksum CHAR(64) NOT NULL,
  status ENUM('applied','skipped') NOT NULL DEFAULT 'applied',
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
];
for (const m of MIGRATIONS) {
  if (m.optional) {
    out.push(
      '',
      `-- Migration ${m.version} (${m.name}) is optional and applied by the installer when privileges allow.`,
    );
    continue;
  }
  out.push('', `-- Migration ${m.version}: ${m.name}`);
  for (const stmt of m.up) out.push(`${stmt.trim()};`);
  out.push(
    `INSERT INTO schema_migrations (version, name, checksum) VALUES (${m.version}, '${m.name}', '${checksum(m)}');`,
  );
}
out.push('', 'SET FOREIGN_KEY_CHECKS = 1;', '');
const file = path.join(REPO_ROOT, 'database', 'tradeteam.sql');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out.join('\n'));
console.warn(`wrote ${file}`);
