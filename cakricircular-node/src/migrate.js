/* ─────────────────────────────────────────────
   ডাটাবেস প্রস্তুতি — শুধু নতুন টেবিল/কলাম যোগ করে।
   পুরোনো কোনো টেবিল বা ডেটা মোছে না, বারবার চালালেও ক্ষতি নেই।
   ───────────────────────────────────────────── */
import { run, one, all } from './db.js';

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/* PHP সংস্করণের টেবিলগুলো (নতুন ইনস্টলে দরকার; পুরোনো ডাটাবেসে আগে থেকেই আছে) */
const BASE = [
`CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) NOT NULL PRIMARY KEY, v LONGTEXT NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE,
  icon VARCHAR(60) DEFAULT 'fa-folder', meta_title VARCHAR(190) DEFAULT NULL, meta_desc VARCHAR(300) DEFAULT NULL,
  sort_order INT DEFAULT 0, is_active TINYINT(1) DEFAULT 1) ${T}`,
`CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY, cat_id INT DEFAULT NULL, title VARCHAR(255) NOT NULL, slug VARCHAR(190) NOT NULL UNIQUE,
  content LONGTEXT NULL, thumb VARCHAR(120) DEFAULT NULL, pdf VARCHAR(120) DEFAULT NULL, division VARCHAR(60) DEFAULT NULL,
  district VARCHAR(60) DEFAULT NULL, vacancy VARCHAR(30) DEFAULT NULL, company VARCHAR(160) DEFAULT NULL,
  employment_type VARCHAR(30) DEFAULT 'FULL_TIME', deadline DATE DEFAULT NULL, is_job TINYINT(1) DEFAULT 0,
  keywords VARCHAR(300) DEFAULT NULL, meta_title VARCHAR(190) DEFAULT NULL, meta_desc VARCHAR(300) DEFAULT NULL,
  views INT DEFAULT 0, status TINYINT(1) DEFAULT 1, published_at DATETIME NOT NULL, updated_at DATETIME DEFAULT NULL,
  created_by INT DEFAULT NULL, deleted_at DATETIME NULL DEFAULT NULL, salary VARCHAR(100) NULL DEFAULT NULL,
  is_premium TINYINT(1) NOT NULL DEFAULT 0, premium_until DATE NULL DEFAULT NULL, is_auto TINYINT(1) NOT NULL DEFAULT 0,
  review_pending TINYINT(1) NOT NULL DEFAULT 0, source_url VARCHAR(500) NULL DEFAULT NULL, source_lastmod VARCHAR(40) NULL DEFAULT NULL,
  auto_note TEXT NULL, application_start DATE NULL DEFAULT NULL,
  INDEX idx_list (status, published_at), INDEX idx_cat (cat_id, status, published_at), INDEX idx_deadline (deadline),
  INDEX idx_premium (is_premium, premium_until), INDEX idx_deleted (deleted_at), INDEX idx_review (review_pending),
  INDEX idx_source (source_url(190))) ${T}`,
`CREATE TABLE IF NOT EXISTS slug_redirects (old_slug VARCHAR(190) NOT NULL PRIMARY KEY, post_id INT NOT NULL, created_at DATETIME NULL, INDEX idx_post (post_id)) ${T}`,
`CREATE TABLE IF NOT EXISTS post_images (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT NOT NULL, image VARCHAR(120) NOT NULL, sort_order INT DEFAULT 0, INDEX idx_post (post_id)) ${T}`,
`CREATE TABLE IF NOT EXISTS post_links (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT NOT NULL, label VARCHAR(120) DEFAULT NULL, url VARCHAR(500) NOT NULL, is_apply TINYINT(1) DEFAULT 0, sort_order INT DEFAULT 0, INDEX idx_post (post_id)) ${T}`,
`CREATE TABLE IF NOT EXISTS banners (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(160) DEFAULT NULL, image VARCHAR(120) NOT NULL, link VARCHAR(500) DEFAULT NULL, sort_order INT DEFAULT 0, is_active TINYINT(1) DEFAULT 1, created_at DATETIME DEFAULT NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS notices (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, body TEXT NULL, link VARCHAR(500) DEFAULT NULL, is_active TINYINT(1) DEFAULT 1, created_at DATETIME NOT NULL, INDEX idx_active (is_active, created_at)) ${T}`,
`CREATE TABLE IF NOT EXISTS reports (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(150) NOT NULL, title VARCHAR(190) NOT NULL, details TEXT NOT NULL, ip VARCHAR(45) DEFAULT NULL, status TINYINT(1) DEFAULT 0, created_at DATETIME NOT NULL, INDEX idx_status (status, created_at)) ${T}`,
`CREATE TABLE IF NOT EXISTS admins (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(60) NOT NULL UNIQUE, pass VARCHAR(255) NOT NULL, name VARCHAR(120) DEFAULT NULL, role ENUM('super','admin','moderator') DEFAULT 'moderator', perms TEXT NULL, is_active TINYINT(1) DEFAULT 1, last_login DATETIME DEFAULT NULL, created_at DATETIME NOT NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS visitors (vid CHAR(32) NOT NULL PRIMARY KEY, country VARCHAR(80) DEFAULT NULL, region VARCHAR(80) DEFAULT NULL, device VARCHAR(20) DEFAULT NULL, first_seen DATETIME NOT NULL, last_seen DATETIME NOT NULL, hits INT DEFAULT 1, INDEX idx_seen (last_seen)) ${T}`,
`CREATE TABLE IF NOT EXISTS visits (id BIGINT AUTO_INCREMENT PRIMARY KEY, vid CHAR(32) NOT NULL, path VARCHAR(190) NOT NULL, day DATE NOT NULL, created_at DATETIME NOT NULL, INDEX idx_day (day), INDEX idx_path (path(120))) ${T}`,
`CREATE TABLE IF NOT EXISTS post_views (post_id INT NOT NULL, vid CHAR(32) NOT NULL, day DATE NOT NULL, PRIMARY KEY (post_id, vid, day), INDEX idx_day (day)) ${T}`,
`CREATE TABLE IF NOT EXISTS searches (term VARCHAR(100) NOT NULL PRIMARY KEY, hits INT DEFAULT 1, last_at DATETIME NOT NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS geo_cache (ip VARCHAR(45) NOT NULL PRIMARY KEY, country VARCHAR(80) DEFAULT NULL, region VARCHAR(80) DEFAULT NULL, created_at DATETIME NOT NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS login_attempts (id INT AUTO_INCREMENT PRIMARY KEY, ip VARCHAR(45) NOT NULL, username VARCHAR(60) DEFAULT NULL, created_at DATETIME NOT NULL, INDEX idx_ip (ip, created_at)) ${T}`,
/* অটোমেশনের টেবিল */
`CREATE TABLE IF NOT EXISTS auto_seen (url_hash CHAR(40) PRIMARY KEY, url VARCHAR(500) NOT NULL, lastmod VARCHAR(40) DEFAULT NULL, post_id INT DEFAULT NULL, seen_at DATETIME NOT NULL, fails TINYINT NOT NULL DEFAULT 0, note VARCHAR(20) NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS auto_log (id INT AUTO_INCREMENT PRIMARY KEY, level VARCHAR(10) NOT NULL DEFAULT 'info', msg TEXT NOT NULL, created_at DATETIME NOT NULL, INDEX idx_time (created_at)) ${T}`,
`CREATE TABLE IF NOT EXISTS source_posts (
  source_id INT UNSIGNED NOT NULL PRIMARY KEY, slug VARCHAR(200) NULL DEFAULT NULL, source_link VARCHAR(500) NULL DEFAULT NULL,
  title_raw VARCHAR(500) NULL DEFAULT NULL, title_norm VARCHAR(500) NULL DEFAULT NULL, content_hash CHAR(32) NULL DEFAULT NULL,
  new_hash CHAR(32) NULL DEFAULT NULL, source_date DATETIME NULL DEFAULT NULL, source_modified DATETIME NULL DEFAULT NULL,
  status ENUM('baseline','new','processing','done','failed','update_pending','needs_review','skipped_duplicate') NOT NULL DEFAULT 'baseline',
  prev_status VARCHAR(20) NULL DEFAULT NULL, approved TINYINT(1) NOT NULL DEFAULT 0, my_post_id INT NULL DEFAULT NULL,
  match_post_id INT NULL DEFAULT NULL, tries TINYINT NOT NULL DEFAULT 0, note VARCHAR(255) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, job VARCHAR(10) NOT NULL DEFAULT 'create',
  INDEX idx_status (status, updated_at), INDEX idx_slug (slug(190)), INDEX idx_mypost (my_post_id), INDEX idx_date (source_date)) ${T}`,
`CREATE TABLE IF NOT EXISTS source_decisions (id INT AUTO_INCREMENT PRIMARY KEY, source_id INT UNSIGNED NOT NULL, decision VARCHAR(30) NOT NULL, reason VARCHAR(500) NULL DEFAULT NULL, created_at DATETIME NOT NULL, INDEX idx_src (source_id), INDEX idx_dec_time (decision, created_at), INDEX idx_time (created_at)) ${T}`,
];

/* ─── v3-র নতুন টেবিল ─── */
const NEW = [
`CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, role VARCHAR(120) DEFAULT NULL, bio VARCHAR(400) DEFAULT NULL,
  photo VARCHAR(120) DEFAULT NULL, facebook VARCHAR(300) DEFAULT NULL, linkedin VARCHAR(300) DEFAULT NULL,
  whatsapp VARCHAR(300) DEFAULT NULL, email VARCHAR(150) DEFAULT NULL, sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, INDEX idx_team (is_active, sort_order)) ${T}`,
`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY, endpoint_hash CHAR(40) NOT NULL UNIQUE, endpoint TEXT NOT NULL,
  p256dh VARCHAR(200) NOT NULL, auth VARCHAR(100) NOT NULL, cats VARCHAR(200) NOT NULL DEFAULT '',
  divs VARCHAR(300) NOT NULL DEFAULT '', remind TINYINT(1) NOT NULL DEFAULT 1, ua VARCHAR(200) DEFAULT NULL,
  fails TINYINT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, last_ok_at DATETIME NULL DEFAULT NULL,
  INDEX idx_fail (fails)) ${T}`,
`CREATE TABLE IF NOT EXISTS push_saved (
  sub_id INT NOT NULL, post_id INT NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY (sub_id, post_id), INDEX idx_post (post_id)) ${T}`,
`CREATE TABLE IF NOT EXISTS reminder_log (
  sub_id INT NOT NULL, post_id INT NOT NULL, stage TINYINT NOT NULL, sent_at DATETIME NOT NULL, PRIMARY KEY (sub_id, post_id, stage)) ${T}`,
`CREATE TABLE IF NOT EXISTS email_subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(150) NOT NULL UNIQUE, token CHAR(32) NOT NULL, confirmed TINYINT(1) NOT NULL DEFAULT 0,
  mode ENUM('instant','daily') NOT NULL DEFAULT 'daily', cats VARCHAR(200) NOT NULL DEFAULT '', created_at DATETIME NOT NULL,
  confirmed_at DATETIME NULL DEFAULT NULL, unsub_at DATETIME NULL DEFAULT NULL, last_sent_at DATETIME NULL DEFAULT NULL,
  ip VARCHAR(45) DEFAULT NULL, INDEX idx_conf (confirmed, unsub_at, mode)) ${T}`,
`CREATE TABLE IF NOT EXISTS notify_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY, post_id INT NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'new_post',
  status ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending', push_cursor INT NOT NULL DEFAULT 0,
  mail_cursor INT NOT NULL DEFAULT 0, push_sent INT NOT NULL DEFAULT 0, mail_sent INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, updated_at DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_post_kind (post_id, kind), INDEX idx_status (status)) ${T}`,
`CREATE TABLE IF NOT EXISTS job_locks (name VARCHAR(40) NOT NULL PRIMARY KEY, holder VARCHAR(60) NOT NULL, until_at DATETIME NOT NULL) ${T}`,
`CREATE TABLE IF NOT EXISTS mail_queue (
  id INT AUTO_INCREMENT PRIMARY KEY, to_email VARCHAR(150) NOT NULL, subject VARCHAR(250) NOT NULL, body MEDIUMTEXT NOT NULL,
  status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending', tries TINYINT NOT NULL DEFAULT 0, err VARCHAR(250) NULL,
  created_at DATETIME NOT NULL, sent_at DATETIME NULL, INDEX idx_q (status, id)) ${T}`,
];

/* যে কলামগুলো পুরোনো ডাটাবেসে না থাকতে পারে */
const COLS = [
  ['posts', 'deleted_at', 'DATETIME NULL DEFAULT NULL'], ['posts', 'salary', 'VARCHAR(100) NULL DEFAULT NULL'],
  ['posts', 'is_premium', 'TINYINT(1) NOT NULL DEFAULT 0'], ['posts', 'premium_until', 'DATE NULL DEFAULT NULL'],
  ['posts', 'is_auto', 'TINYINT(1) NOT NULL DEFAULT 0'], ['posts', 'review_pending', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['posts', 'source_url', 'VARCHAR(500) NULL DEFAULT NULL'], ['posts', 'source_lastmod', 'VARCHAR(40) NULL DEFAULT NULL'],
  ['posts', 'auto_note', 'TEXT NULL'], ['posts', 'application_start', 'DATE NULL DEFAULT NULL'],
  ['auto_seen', 'fails', 'TINYINT NOT NULL DEFAULT 0'], ['auto_seen', 'note', 'VARCHAR(20) NULL'], ['source_posts', 'job', "VARCHAR(10) NOT NULL DEFAULT 'create'"],
];

export async function migrate({ log = () => {} } = {}) {
  for (const sql of [...BASE, ...NEW]) await run(sql);
  for (const [t, c, def] of COLS) {
    const has = await one('SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [t, c]);
    if (!Number(has?.n)) { await run(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`); log(`+ ${t}.${c}`); }
  }
  /* ডিফল্ট ক্যাটাগরি (খালি ডাটাবেসে) */
  const n = await one('SELECT COUNT(*) n FROM categories');
  if (!Number(n?.n)) {
    const d = [['চাকরি', 'chakri', 'briefcase', 1], ['ভর্তি', 'bhorti', 'cap', 2], ['রেজাল্ট', 'result', 'chart', 3],
      ['প্রতিষ্ঠান', 'protisthan', 'building', 4], ['নোটিশ', 'notice', 'megaphone', 5], ['স্কলারশিপ', 'scholarship', 'award', 6]];
    for (const [name, slug, icon, so] of d) await run('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?,?,?,?)', [name, slug, icon, so]);
  }
  const t = await all("SHOW TABLES");
  return t.length;
}
