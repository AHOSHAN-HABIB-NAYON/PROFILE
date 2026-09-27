'use strict';
/** Minimal forward-only SQL migration runner. Files: src/migrations/NNN_name.sql */
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = path.join(__dirname, 'migrations');

function splitStatements(sql) {
  return sql
    .split(/\n/).filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}

async function run(log = console.log) {
  await db.q(`CREATE TABLE IF NOT EXISTS migrations (
    name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const done = new Set((await db.q('SELECT name FROM migrations')).map((r) => r.name));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const stmts = splitStatements(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (const s of stmts) await db.q(s);
    await db.q('INSERT INTO migrations (name) VALUES (?)', [f]);
    applied.push(f);
    log(`[migrate] applied ${f}`);
  }
  return applied;
}

module.exports = { run };
