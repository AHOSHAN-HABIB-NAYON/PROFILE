'use strict';
/**
 * Versioned, idempotent schema migrations. Runs automatically on every start,
 * so deploying new files upgrades the database without any manual step.
 */
const db = require('./db');

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const migrations = [
  {
    v: 1,
    name: 'initial schema',
    sql: [
      `CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) PRIMARY KEY, v MEDIUMTEXT) ${T}`,
      `CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        email VARCHAR(191) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL DEFAULT '',
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'moderator',
        permissions TEXT,
        avatar VARCHAR(255) DEFAULT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        last_login DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id CHAR(64) PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        csrf CHAR(64) NOT NULL,
        ip VARCHAR(64), ua VARCHAR(255),
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id), INDEX (expires_at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        ip VARCHAR(64) PRIMARY KEY, attempts INT NOT NULL DEFAULT 0,
        locked_until DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS categories (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(191) NOT NULL UNIQUE,
        icon VARCHAR(40) NOT NULL DEFAULT 'briefcase',
        color VARCHAR(20) NOT NULL DEFAULT '#16a34a',
        description TEXT,
        meta_title VARCHAR(255), meta_desc VARCHAR(500),
        sort INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS posts (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(191) NOT NULL UNIQUE,
        category_id INT UNSIGNED NULL,
        organization VARCHAR(255) DEFAULT '',
        vacancies VARCHAR(120) DEFAULT '',
        salary VARCHAR(191) DEFAULT '',
        division VARCHAR(80) DEFAULT '',
        district VARCHAR(80) DEFAULT '',
        job_type VARCHAR(80) DEFAULT '',
        education VARCHAR(255) DEFAULT '',
        start_date DATE NULL,
        deadline DATETIME NULL,
        content MEDIUMTEXT,
        excerpt VARCHAR(600) DEFAULT '',
        thumbnail VARCHAR(255) DEFAULT NULL,
        pdf VARCHAR(255) DEFAULT NULL,
        apply_url VARCHAR(500) DEFAULT '',
        source_url VARCHAR(500) DEFAULT '',
        keywords VARCHAR(500) DEFAULT '',
        meta_title VARCHAR(255) DEFAULT '',
        meta_desc VARCHAR(500) DEFAULT '',
        status VARCHAR(12) NOT NULL DEFAULT 'draft',
        is_premium TINYINT(1) NOT NULL DEFAULT 0,
        premium_until DATETIME NULL,
        views INT UNSIGNED NOT NULL DEFAULT 0,
        auto_generated TINYINT(1) NOT NULL DEFAULT 0,
        source_key VARCHAR(191) NULL,
        author_id INT UNSIGNED NULL,
        notified TINYINT(1) NOT NULL DEFAULT 0,
        published_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        INDEX idx_status_pub (status, published_at),
        INDEX idx_cat (category_id, status, published_at),
        INDEX idx_views (status, views),
        INDEX idx_premium (is_premium, status),
        INDEX idx_deadline (deadline),
        INDEX idx_source (source_key)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS slug_redirects (
        old_slug VARCHAR(191) PRIMARY KEY, post_id INT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS banners (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) DEFAULT '',
        image VARCHAR(255) NOT NULL, link VARCHAR(500) DEFAULT '',
        sort INT NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS ads (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slot VARCHAR(40) NOT NULL, title VARCHAR(255) DEFAULT '',
        type VARCHAR(10) NOT NULL DEFAULT 'image',
        image VARCHAR(255) DEFAULT NULL, link VARCHAR(500) DEFAULT '',
        html TEXT, sort INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (slot, active)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS notices (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL, body TEXT, link VARCHAR(500) DEFAULT '',
        pinned TINYINT(1) NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (active, created_at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS reports (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        post_id INT UNSIGNED NULL, type VARCHAR(40) NOT NULL,
        message TEXT, url VARCHAR(500) DEFAULT '', contact VARCHAR(191) DEFAULT '',
        ip VARCHAR(64), status VARCHAR(12) NOT NULL DEFAULT 'new',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (status, created_at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS pages (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(191) NOT NULL UNIQUE, title VARCHAR(255) NOT NULL,
        content MEDIUMTEXT, sort INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1, in_footer TINYINT(1) NOT NULL DEFAULT 1,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS team (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL, role VARCHAR(120) DEFAULT '',
        photo VARCHAR(255) DEFAULT NULL, bio VARCHAR(500) DEFAULT '', link VARCHAR(500) DEFAULT '',
        sort INT NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS stats_daily (
        day DATE PRIMARY KEY, visits INT UNSIGNED NOT NULL DEFAULT 0,
        uniques INT UNSIGNED NOT NULL DEFAULT 0, pageviews INT UNSIGNED NOT NULL DEFAULT 0
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS stats_devices (
        day DATE NOT NULL, device CHAR(24) NOT NULL, PRIMARY KEY (day, device)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS stats_pages (
        day DATE NOT NULL, path VARCHAR(191) NOT NULL, views INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (day, path)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS stats_geo (
        day DATE NOT NULL, country VARCHAR(64) NOT NULL, visits INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (day, country)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS search_log (
        q VARCHAR(120) PRIMARY KEY, hits INT UNSIGNED NOT NULL DEFAULT 1,
        last_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX (hits)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS automation_items (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        source_site VARCHAR(191) NOT NULL, source_id VARCHAR(64) NOT NULL,
        source_modified VARCHAR(40) DEFAULT '', source_date VARCHAR(40) DEFAULT '',
        title VARCHAR(500) DEFAULT '', link VARCHAR(500) DEFAULT '',
        status VARCHAR(16) NOT NULL DEFAULT 'new', reason VARCHAR(255) DEFAULT '',
        post_id INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_src (source_site, source_id), INDEX (status)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS automation_runs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        trigger_by VARCHAR(20) DEFAULT 'scheduler',
        status VARCHAR(16) NOT NULL DEFAULT 'running', step INT NOT NULL DEFAULT 0,
        found INT NOT NULL DEFAULT 0, fresh INT NOT NULL DEFAULT 0, skipped INT NOT NULL DEFAULT 0,
        ai_calls INT NOT NULL DEFAULT 0, drafts INT NOT NULL DEFAULT 0,
        tokens_in INT NOT NULL DEFAULT 0, tokens_out INT NOT NULL DEFAULT 0,
        cost DECIMAL(10,5) NOT NULL DEFAULT 0, error TEXT,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS automation_logs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, run_id INT UNSIGNED NULL,
        level VARCHAR(8) NOT NULL DEFAULT 'info', step INT NOT NULL DEFAULT 0,
        message TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (run_id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS push_subs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        endpoint_hash CHAR(64) NOT NULL UNIQUE, endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL, auth VARCHAR(255) NOT NULL,
        saved_ids TEXT, reminded_ids TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME NULL
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS email_subs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(191) NOT NULL UNIQUE, token CHAR(40) NOT NULL,
        confirmed TINYINT(1) NOT NULL DEFAULT 0, last_digest DATE NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS admin_notifications (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, type VARCHAR(20) NOT NULL DEFAULT 'system',
        title VARCHAR(255) NOT NULL, body VARCHAR(500) DEFAULT '', link VARCHAR(255) DEFAULT '',
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX (is_read)
      ) ${T}`,
    ],
  },
  {
    v: 2,
    name: 'post links & gallery images',
    sql: [
      `CREATE TABLE IF NOT EXISTS post_links (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        post_id INT UNSIGNED NOT NULL,
        label VARCHAR(191) NOT NULL DEFAULT '',
        url VARCHAR(600) NOT NULL,
        is_apply TINYINT(1) NOT NULL DEFAULT 0,
        sort INT NOT NULL DEFAULT 0,
        INDEX idx_post (post_id, sort)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS post_images (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        post_id INT UNSIGNED NOT NULL,
        image VARCHAR(255) NOT NULL,
        caption VARCHAR(255) NOT NULL DEFAULT '',
        sort INT NOT NULL DEFAULT 0,
        INDEX idx_post (post_id, sort)
      ) ${T}`,
    ],
  },
  {
    v: 3,
    name: 'legacy ids for importing the old PHP site',
    sql: [
      (db) => addColumn(db, 'posts', 'legacy_id', 'INT UNSIGNED NULL', 'UNIQUE KEY uq_posts_legacy (legacy_id)'),
      (db) => addColumn(db, 'categories', 'legacy_id', 'INT UNSIGNED NULL', 'UNIQUE KEY uq_cats_legacy (legacy_id)'),
      (db) => addColumn(db, 'banners', 'legacy_id', 'INT UNSIGNED NULL', 'UNIQUE KEY uq_banners_legacy (legacy_id)'),
      (db) => addColumn(db, 'notices', 'legacy_id', 'INT UNSIGNED NULL', 'UNIQUE KEY uq_notices_legacy (legacy_id)'),
      (db) => addColumn(db, 'reports', 'legacy_id', 'INT UNSIGNED NULL', 'UNIQUE KEY uq_reports_legacy (legacy_id)'),
    ],
  },
];

async function addColumn(db, table, column, def, key) {
  const has = await db.raw('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
  if (has.length) return;
  await db.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}${key ? `, ADD ${key}` : ''}`);
}

async function run() {
  await db.raw(`CREATE TABLE IF NOT EXISTS migrations (version INT PRIMARY KEY, name VARCHAR(191), applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ${T}`);
  const done = new Set((await db.raw('SELECT version FROM migrations')).map((r) => r.version));
  let applied = 0;
  for (const m of migrations) {
    if (done.has(m.v)) continue;
    for (const sql of m.sql) {
      if (typeof sql === 'function') await sql(db); else await db.raw(sql);
    }
    await db.raw('INSERT INTO migrations (version, name) VALUES (?, ?)', [m.v, m.name]);
    applied++;
  }
  return applied;
}

module.exports = { run, latest: migrations[migrations.length - 1].v };
