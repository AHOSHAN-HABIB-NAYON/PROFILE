#!/usr/bin/env node
'use strict';
const config = require('../src/config');
const db = require('../src/db');
const migrate = require('../src/migrate');
const seed = require('../src/services/seed');

(async () => {
  const cfg = config.load();
  if (!cfg.db || !cfg.db.host) { console.error('No DB configuration. Run the web installer or set DB_* env vars.'); process.exit(1); }
  db.connect(cfg.db);
  await migrate.run();
  await seed.defaults();
  console.log('[migrate] done');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
