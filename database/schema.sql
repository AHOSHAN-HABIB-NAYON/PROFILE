-- =====================================================================
--  Platform database schema (MySQL 5.7+/MariaDB 10.3+)
--  All tables: InnoDB, utf8mb4 / utf8mb4_unicode_ci (full Bangla + emoji)
--  Executed automatically by the installer (/install).
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('user','support','editor','admin') NOT NULL DEFAULT 'user',
  status ENUM('active','suspended','banned','deleted') NOT NULL DEFAULT 'active',
  suspended_until DATETIME NULL,
  status_reason VARCHAR(255) NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_vip TINYINT(1) NOT NULL DEFAULT 0,
  avatar VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  bio VARCHAR(500) NULL,
  lang CHAR(2) NULL,
  google_id VARCHAR(64) NULL,
  email_verified_at DATETIME NULL,
  last_login_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google (google_id),
  KEY idx_users_role (role),
  KEY idx_users_status (status),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  session_hash CHAR(64) NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  device VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_hash (session_hash),
  KEY idx_us_user (user_id, revoked_at),
  CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_security (
  user_id INT UNSIGNED NOT NULL,
  login_notify TINYINT(1) NOT NULL DEFAULT 1,
  email_login_verify TINYINT(1) NOT NULL DEFAULT 0,
  password_changed_at DATETIME NULL,
  notify_sound TINYINT(1) NOT NULL DEFAULT 1,
  notify_email TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_usec_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_2fa (
  user_id INT UNSIGNED NOT NULL,
  secret_enc VARCHAR(255) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  recovery_codes TEXT NULL,
  last_used_step BIGINT NULL,
  enabled_at DATETIME NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_2fa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_passkeys (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  credential_id VARCHAR(512) NOT NULL,
  public_key TEXT NOT NULL,
  sign_count INT UNSIGNED NOT NULL DEFAULT 0,
  name VARCHAR(100) NOT NULL DEFAULT 'Passkey',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_passkey_cred (credential_id(255)),
  KEY idx_pk_user (user_id),
  CONSTRAINT fk_pk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_devices (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  device_hash CHAR(64) NOT NULL,
  label VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device (user_id, device_hash),
  CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('verify','reset','login_code','2fa_recovery') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_et_lookup (token_hash),
  KEY idx_et_user (user_id, type),
  CONSTRAINT fk_et_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_history (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  email VARCHAR(191) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  device VARCHAR(120) NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'password',
  success TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lh_user (user_id, created_at),
  KEY idx_lh_email (email, success, created_at),
  KEY idx_lh_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  k CHAR(64) NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (k),
  KEY idx_rl_reset (reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Services, products, orders, payments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(120) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  name_bn VARCHAR(150) NULL,
  icon VARCHAR(80) NULL,
  color VARCHAR(20) NULL,
  sort INT NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sc_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NULL,
  slug VARCHAR(120) NOT NULL,
  title_en VARCHAR(190) NOT NULL,
  title_bn VARCHAR(190) NULL,
  short_en VARCHAR(400) NULL,
  short_bn VARCHAR(400) NULL,
  description_en MEDIUMTEXT NULL,
  description_bn MEDIUMTEXT NULL,
  features_en TEXT NULL,
  features_bn TEXT NULL,
  icon VARCHAR(80) NULL,
  icon_image VARCHAR(255) NULL,
  image VARCHAR(255) NULL,
  price_from DECIMAL(12,2) NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  orderable TINYINT(1) NOT NULL DEFAULT 1,
  status TINYINT(1) NOT NULL DEFAULT 1,
  sort INT NOT NULL DEFAULT 0,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_slug (slug),
  KEY idx_services_cat (category_id, status),
  CONSTRAINT fk_services_cat FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id INT UNSIGNED NULL,
  slug VARCHAR(140) NOT NULL,
  name_en VARCHAR(190) NOT NULL,
  name_bn VARCHAR(190) NULL,
  price_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  price_bdt DECIMAL(12,2) NULL,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  short_en VARCHAR(400) NULL,
  short_bn VARCHAR(400) NULL,
  description_en MEDIUMTEXT NULL,
  description_bn MEDIUMTEXT NULL,
  features_en TEXT NULL,
  features_bn TEXT NULL,
  demo_url VARCHAR(255) NULL,
  delivery_days SMALLINT UNSIGNED NULL,
  support_months SMALLINT UNSIGNED NULL,
  image VARCHAR(255) NULL,
  icon VARCHAR(80) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_service (service_id, status),
  CONSTRAINT fk_products_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(24) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  product_name VARCHAR(190) NOT NULL,
  amount_usd DECIMAL(12,2) NOT NULL,
  amount_bdt DECIMAL(12,2) NOT NULL,
  status ENUM('pending_payment','payment_submitted','under_review','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending_payment',
  admin_note VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_code (code),
  KEY idx_orders_user (user_id, status),
  KEY idx_orders_status (status, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_methods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(80) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  details TEXT NULL,
  instructions_en TEXT NULL,
  instructions_bn TEXT NULL,
  logo VARCHAR(255) NULL,
  sort INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pm_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  method VARCHAR(30) NOT NULL,
  txid VARCHAR(191) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  screenshot VARCHAR(255) NULL,
  note VARCHAR(1000) NULL,
  status ENUM('pending','approved','rejected','cancelled','completed') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(1000) NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_tx (method, txid),
  KEY idx_pay_status (status, created_at),
  KEY idx_pay_user (user_id),
  KEY idx_pay_order (order_id),
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS balance_transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  admin_id INT UNSIGNED NULL,
  type ENUM('credit','debit') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  reference VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bt_user (user_id, created_at),
  CONSTRAINT fk_bt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- News
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(120) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  name_bn VARCHAR(150) NULL,
  icon VARCHAR(80) NULL,
  sort INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_nc_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NULL,
  author_id INT UNSIGNED NULL,
  slug VARCHAR(190) NOT NULL,
  title_en VARCHAR(255) NULL,
  title_bn VARCHAR(255) NULL,
  excerpt_en VARCHAR(500) NULL,
  excerpt_bn VARCHAR(500) NULL,
  content_en MEDIUMTEXT NULL,
  content_bn MEDIUMTEXT NULL,
  image VARCHAR(255) NULL,
  icon VARCHAR(80) NULL,
  emoji VARCHAR(16) NULL,
  tags VARCHAR(255) NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  publish_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seo_title VARCHAR(190) NULL,
  seo_description VARCHAR(300) NULL,
  seo_keywords VARCHAR(255) NULL,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_slug (slug),
  KEY idx_news_pub (status, publish_at),
  KEY idx_news_cat (category_id),
  CONSTRAINT fk_news_cat FOREIGN KEY (category_id) REFERENCES news_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_news_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_reactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  news_id INT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NULL,
  reaction VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reaction (news_id, visitor_hash),
  CONSTRAINT fk_nr_news FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type ENUM('news','payment','order','promotion','security','system','admin') NOT NULL DEFAULT 'system',
  title_en VARCHAR(190) NULL,
  title_bn VARCHAR(190) NULL,
  body_en VARCHAR(1000) NULL,
  body_bn VARCHAR(1000) NULL,
  icon VARCHAR(80) NULL,
  link VARCHAR(255) NULL,
  target VARCHAR(40) NOT NULL DEFAULT 'user',
  is_broadcast TINYINT(1) NOT NULL DEFAULT 0,
  play_sound TINYINT(1) NOT NULL DEFAULT 1,
  send_push TINYINT(1) NOT NULL DEFAULT 0,
  send_email TINYINT(1) NOT NULL DEFAULT 0,
  recipients INT UNSIGNED NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_n_broadcast (is_broadcast, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_targets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_nt (notification_id, user_id),
  KEY idx_nt_user (user_id, read_at, notification_id),
  CONSTRAINT fk_nt_n FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  endpoint VARCHAR(600) NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(200) NULL,
  auth VARCHAR(100) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_ok_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_ep (endpoint_hash),
  KEY idx_push_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_queue (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  to_email VARCHAR(191) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eq_pending (sent_at, attempts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Team, support, contact, AI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  position_en VARCHAR(120) NULL,
  position_bn VARCHAR(120) NULL,
  bio_en TEXT NULL,
  bio_bn TEXT NULL,
  photo VARCHAR(255) NULL,
  skills VARCHAR(500) NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(40) NULL,
  whatsapp VARCHAR(40) NULL,
  website VARCHAR(255) NULL,
  cv_file VARCHAR(255) NULL,
  is_vip TINYINT(1) NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_conversations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  guest_name VARCHAR(120) NULL,
  guest_email VARCHAR(191) NULL,
  guest_token CHAR(64) NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  unread_admin INT UNSIGNED NOT NULL DEFAULT 0,
  unread_user INT UNSIGNED NOT NULL DEFAULT 0,
  last_message_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_reply_seconds INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sc_user (user_id),
  KEY idx_sc_guest (guest_token),
  KEY idx_sc_last (status, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED NOT NULL,
  sender ENUM('user','admin') NOT NULL,
  admin_id INT UNSIGNED NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sm_conv (conversation_id, id),
  CONSTRAINT fk_sm_conv FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(191) NOT NULL,
  subject VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  attachment VARCHAR(255) NULL,
  status ENUM('new','read','replied','archived') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cm_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NULL,
  role ENUM('user','assistant') NOT NULL,
  message TEXT NOT NULL,
  tokens INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_visitor (visitor_hash, id),
  KEY idx_ai_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Analytics (privacy-conscious: no raw IPs, random first-party visitor id)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visits INT UNSIGNED NOT NULL DEFAULT 1,
  pageviews INT UNSIGNED NOT NULL DEFAULT 0,
  device VARCHAR(20) NULL,
  browser VARCHAR(40) NULL,
  os VARCHAR(40) NULL,
  country CHAR(2) NULL,
  region VARCHAR(80) NULL,
  city VARCHAR(80) NULL,
  source VARCHAR(80) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_an_visitor (visitor_hash),
  KEY idx_an_last (last_seen),
  KEY idx_an_first (first_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS page_views (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_id INT UNSIGNED NOT NULL,
  path VARCHAR(255) NOT NULL,
  page_type VARCHAR(30) NULL,
  ref_id INT UNSIGNED NULL,
  source VARCHAR(80) NULL,
  device VARCHAR(20) NULL,
  country CHAR(2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pv_created (created_at),
  KEY idx_pv_path (path(100), created_at),
  KEY idx_pv_type (page_type, ref_id),
  KEY idx_pv_visitor (visitor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Media, settings, social, audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  path VARCHAR(255) NOT NULL,
  thumb VARCHAR(255) NULL,
  original_name VARCHAR(255) NULL,
  mime VARCHAR(60) NOT NULL,
  size INT UNSIGNED NOT NULL,
  original_size INT UNSIGNED NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  usage_tag VARCHAR(40) NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Key/value store for every admin-controlled setting
-- (general, theme, home, SEO, SMTP, Google, AI, security, PWA, maintenance ...).
-- Secrets (SMTP password, API keys, VAPID private key) are stored encrypted.
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(100) NOT NULL,
  v MEDIUMTEXT NULL,
  grp VARCHAR(40) NOT NULL DEFAULT 'general',
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (k),
  KEY idx_settings_grp (grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS social_links (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  platform VARCHAR(30) NOT NULL,
  label VARCHAR(60) NOT NULL,
  icon VARCHAR(60) NOT NULL,
  url VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id INT UNSIGNED NULL,
  description VARCHAR(500) NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_admin (admin_id),
  KEY idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
