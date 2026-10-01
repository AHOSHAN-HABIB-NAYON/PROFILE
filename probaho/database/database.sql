-- =====================================================================
-- Probaho — Database schema (MySQL 5.7+/MariaDB 10.3+), utf8mb4
-- Import this file once (the web installer at /install does it for you).
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
  k          VARCHAR(100) NOT NULL,
  v          MEDIUMTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS smtp_settings (
  id           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_enabled   TINYINT(1) NOT NULL DEFAULT 0,
  host         VARCHAR(190) NOT NULL DEFAULT '',
  port         SMALLINT UNSIGNED NOT NULL DEFAULT 587,
  username     VARCHAR(190) NOT NULL DEFAULT '',
  password     TEXT NULL,
  encryption   ENUM('none','ssl','tls') NOT NULL DEFAULT 'tls',
  from_email   VARCHAR(190) NOT NULL DEFAULT '',
  from_name    VARCHAR(190) NOT NULL DEFAULT '',
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_settings (
  id                TINYINT UNSIGNED NOT NULL DEFAULT 1,
  title             VARCHAR(190) NOT NULL DEFAULT '',
  description       TEXT NULL,
  working_hours     VARCHAR(190) NOT NULL DEFAULT '',
  response_message  VARCHAR(255) NOT NULL DEFAULT '',
  telegram_enabled  TINYINT(1) NOT NULL DEFAULT 0,
  telegram_name     VARCHAR(190) NOT NULL DEFAULT '',
  telegram_username VARCHAR(100) NOT NULL DEFAULT '',
  telegram_url      VARCHAR(255) NOT NULL DEFAULT '',
  whatsapp_enabled  TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_name     VARCHAR(190) NOT NULL DEFAULT '',
  whatsapp_number   VARCHAR(40)  NOT NULL DEFAULT '',
  whatsapp_url      VARCHAR(255) NOT NULL DEFAULT '',
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(10) NOT NULL,
  name              VARCHAR(120) NOT NULL,
  email             VARCHAR(190) NOT NULL,
  phone             VARCHAR(30) NULL,
  password_hash     VARCHAR(255) NULL,
  google_id         VARCHAR(64) NULL,
  webauthn_handle   CHAR(43) NOT NULL,
  avatar            VARCHAR(255) NULL,
  user_group        VARCHAR(40) NOT NULL DEFAULT 'default',
  status            ENUM('active','suspended') NOT NULL DEFAULT 'active',
  email_verified_at DATETIME NULL,
  totp_secret       VARCHAR(255) NULL,
  totp_enabled      TINYINT(1) NOT NULL DEFAULT 0,
  theme             ENUM('light','dark','system') NULL,
  email_alerts      TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at     DATETIME NULL,
  last_login_ip     VARCHAR(45) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uid (uid),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_google (google_id),
  UNIQUE KEY uq_users_handle (webauthn_handle),
  KEY idx_users_group (user_group),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  selector       CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,
  remember       TINYINT(1) NOT NULL DEFAULT 0,
  method         VARCHAR(20) NOT NULL DEFAULT 'password',
  user_agent     VARCHAR(255) NULL,
  ip             VARCHAR(45) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NOT NULL,
  revoked_at     DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_selector (selector),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_tokens (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('verify_email','reset_password') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tokens_hash (token_hash),
  KEY idx_tokens_user (user_id, type),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passkeys (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  credential_id VARCHAR(255) NOT NULL,
  public_key    TEXT NOT NULL,
  sign_count    INT UNSIGNED NOT NULL DEFAULT 0,
  transports    VARCHAR(100) NULL,
  aaguid        CHAR(36) NULL,
  name          VARCHAR(100) NOT NULL,
  device_info   VARCHAR(190) NULL,
  backed_up     TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_passkeys_cred (credential_id),
  KEY idx_passkeys_user (user_id),
  CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope      VARCHAR(20) NOT NULL DEFAULT 'user',
  identifier VARCHAR(190) NOT NULL,
  ip         VARCHAR(45) NOT NULL,
  success    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_ident (scope, identifier, created_at),
  KEY idx_attempts_ip (scope, ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  k        VARCHAR(120) NOT NULL,
  hits     INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at DATETIME NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Wallet, transactions & payments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  balance        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  locked_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status         ENUM('active','frozen') NOT NULL DEFAULT 'active',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallets_user (user_id),
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_methods (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(40) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  description     VARCHAR(255) NULL,
  icon            VARCHAR(255) NULL,
  color           VARCHAR(20) NULL,
  direction       ENUM('deposit','withdraw','both') NOT NULL DEFAULT 'both',
  account_label   VARCHAR(100) NULL,
  instructions    TEXT NULL,
  min_amount      DECIMAL(18,2) NOT NULL DEFAULT 1.00,
  max_amount      DECIMAL(18,2) NOT NULL DEFAULT 10000.00,
  fee_percent     DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  fee_fixed       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  show_on_landing TINYINT(1) NOT NULL DEFAULT 1,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pm_code (code),
  KEY idx_pm_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_payment_methods (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  method_code VARCHAR(40) NOT NULL,
  label       VARCHAR(100) NOT NULL,
  account_ref VARCHAR(190) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_upm_user (user_id),
  CONSTRAINT fk_upm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                  CHAR(16) NOT NULL,
  user_id              INT UNSIGNED NOT NULL,
  wallet_id            INT UNSIGNED NOT NULL,
  type                 ENUM('deposit','withdraw','payment','transfer') NOT NULL,
  direction            ENUM('credit','debit') NOT NULL,
  amount               DECIMAL(18,2) NOT NULL,
  fee                  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  net_amount           DECIMAL(18,2) NOT NULL,
  balance_after        DECIMAL(18,2) NULL,
  method               VARCHAR(40) NOT NULL DEFAULT 'wallet',
  status               ENUM('pending','success','failed','expired','cancelled') NOT NULL DEFAULT 'pending',
  reference            VARCHAR(120) NULL,
  account_ref          VARCHAR(190) NULL,
  counterparty_user_id INT UNSIGNED NULL,
  description          VARCHAR(255) NULL,
  admin_note           VARCHAR(255) NULL,
  meta                 TEXT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tx_uid (uid),
  KEY idx_tx_user (user_id, created_at),
  KEY idx_tx_type (type, status),
  KEY idx_tx_status (status, created_at),
  KEY idx_tx_reference (reference),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_counterparty FOREIGN KEY (counterparty_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  transaction_id INT UNSIGNED NULL,
  method_code    VARCHAR(40) NOT NULL,
  amount         DECIMAL(18,2) NOT NULL,
  currency       VARCHAR(10) NOT NULL,
  status         ENUM('pending','success','failed','expired','cancelled') NOT NULL DEFAULT 'pending',
  provider_ref   VARCHAR(120) NULL,
  payload        TEXT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_user (user_id, created_at),
  KEY idx_payments_status (status),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_tx FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS binance_pay_orders (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  payment_id        INT UNSIGNED NULL,
  transaction_id    INT UNSIGNED NULL,
  mode              ENUM('api','manual') NOT NULL DEFAULT 'api',
  merchant_trade_no VARCHAR(32) NOT NULL,
  prepay_id         VARCHAR(64) NULL,
  binance_order_id  VARCHAR(64) NULL,
  amount            DECIMAL(18,2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USDT',
  status            ENUM('pending','success','failed','expired','cancelled') NOT NULL DEFAULT 'pending',
  checkout_url      VARCHAR(500) NULL,
  qrcode_link       VARCHAR(500) NULL,
  qr_content        VARCHAR(500) NULL,
  deeplink          VARCHAR(500) NULL,
  universal_url     VARCHAR(500) NULL,
  expire_at         DATETIME NULL,
  paid_at           DATETIME NULL,
  raw_response      TEXT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bpo_trade (merchant_trade_no),
  UNIQUE KEY uq_bpo_binance_order (binance_order_id),
  KEY idx_bpo_user (user_id, created_at),
  KEY idx_bpo_status (status),
  CONSTRAINT fk_bpo_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_bpo_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_bpo_tx FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Notifications & push
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  category   ENUM('payment','security','product','system','admin') NOT NULL DEFAULT 'system',
  title      VARCHAR(190) NOT NULL,
  body       TEXT NULL,
  url        VARCHAR(255) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  endpoint      TEXT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh        VARCHAR(255) NOT NULL,
  auth          VARCHAR(100) NOT NULL,
  device        VARCHAR(190) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_campaigns (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id     INT UNSIGNED NULL,
  target       ENUM('user','group','all') NOT NULL,
  target_value VARCHAR(190) NULL,
  channels     VARCHAR(60) NOT NULL,
  title        VARCHAR(190) NOT NULL,
  body         TEXT NULL,
  url          VARCHAR(255) NULL,
  recipients   INT UNSIGNED NOT NULL DEFAULT 0,
  push_sent    INT UNSIGNED NOT NULL DEFAULT 0,
  push_failed  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_logs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  to_email   VARCHAR(190) NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  template   VARCHAR(60) NULL,
  status     ENUM('sent','failed','skipped') NOT NULL,
  error      VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Services & products
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scat_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NULL,
  slug        VARCHAR(120) NOT NULL,
  title       VARCHAR(150) NOT NULL,
  subtitle    VARCHAR(150) NULL,
  description TEXT NULL,
  icon        VARCHAR(255) NOT NULL DEFAULT 'grid',
  color       VARCHAR(20) NOT NULL DEFAULT '#5b4bff',
  badge       VARCHAR(30) NULL,
  price       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  action_url  VARCHAR(255) NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_slug (slug),
  KEY idx_services_active (is_active, sort_order),
  CONSTRAINT fk_services_cat FOREIGN KEY (category_id) REFERENCES service_categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug         VARCHAR(160) NOT NULL,
  title_bn     VARCHAR(190) NOT NULL,
  title_en     VARCHAR(190) NULL,
  summary      VARCHAR(300) NULL,
  description  MEDIUMTEXT NULL,
  cover_image  VARCHAR(255) NULL,
  gallery      TEXT NULL,
  category     VARCHAR(80) NULL,
  release_date DATE NULL,
  button_text  VARCHAR(60) NULL,
  button_url   VARCHAR(255) NULL,
  is_featured  TINYINT(1) NOT NULL DEFAULT 0,
  status       ENUM('draft','published') NOT NULL DEFAULT 'draft',
  notify_inapp TINYINT(1) NOT NULL DEFAULT 0,
  notify_push  TINYINT(1) NOT NULL DEFAULT 0,
  notify_email TINYINT(1) NOT NULL DEFAULT 0,
  notified_at  DATETIME NULL,
  views        INT UNSIGNED NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_status (status, published_at),
  KEY idx_products_featured (is_featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Announcements / news posts (optionally linked to a product)
CREATE TABLE IF NOT EXISTS product_posts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NULL,
  type       ENUM('announcement','news','update') NOT NULL DEFAULT 'announcement',
  title      VARCHAR(190) NOT NULL,
  body       TEXT NULL,
  url        VARCHAR(255) NULL,
  is_pinned  TINYINT(1) NOT NULL DEFAULT 0,
  status     ENUM('draft','published') NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_posts_status (status, is_pinned, created_at),
  CONSTRAINT fk_posts_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid         CHAR(10) NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  category    VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  tx_ref      VARCHAR(60) NULL,
  status      ENUM('pending','reviewing','resolved','rejected') NOT NULL DEFAULT 'pending',
  admin_reply TEXT NULL,
  replied_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reports_uid (uid),
  KEY idx_reports_user (user_id),
  KEY idx_reports_status (status, created_at),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_files (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id  INT UNSIGNED NOT NULL,
  path       VARCHAR(255) NOT NULL,
  mime       VARCHAR(40) NOT NULL,
  size       INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rfiles_report (report_id),
  CONSTRAINT fk_rfiles_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Content: AI knowledge base, FAQ, static pages, chat logs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_knowledge (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title      VARCHAR(190) NOT NULL,
  category   VARCHAR(60) NOT NULL DEFAULT 'general',
  keywords   VARCHAR(500) NULL,
  content    TEXT NOT NULL,
  priority   INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kb_active (is_active, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_chat_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  session_key CHAR(32) NOT NULL,
  role        ENUM('user','assistant') NOT NULL,
  message     TEXT NOT NULL,
  source      VARCHAR(20) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chat_session (session_key, id),
  KEY idx_chat_created (created_at),
  CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS faqs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question   VARCHAR(255) NOT NULL,
  answer     TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_faqs_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug       VARCHAR(80) NOT NULL,
  title      VARCHAR(190) NOT NULL,
  content    MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pages_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('super','admin','editor') NOT NULL DEFAULT 'admin',
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  totp_secret   VARCHAR(255) NULL,
  totp_enabled  TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  last_login_ip VARCHAR(45) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id   INT UNSIGNED NULL,
  action     VARCHAR(80) NOT NULL,
  target     VARCHAR(190) NULL,
  ip         VARCHAR(45) NULL,
  meta       TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alogs_admin (admin_id, created_at),
  CONSTRAINT fk_alogs_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Seed data
-- =====================================================================
INSERT IGNORE INTO site_settings (k, v) VALUES
('site_name', 'Probaho'),
('site_name_bn', 'প্রবাহ'),
('site_tagline', 'সহজ, দ্রুত ও নিরাপদ ডিজিটাল পেমেন্ট'),
('site_description', 'Probaho (প্রবাহ) — একটি আধুনিক ডিজিটাল পেমেন্ট ও সার্ভিস প্ল্যাটফর্ম। ওয়ালেট, Binance Pay, QR পেমেন্ট, ট্রান্সফার এবং প্রয়োজনীয় সব ডিজিটাল সার্ভিস এক অ্যাপে।'),
('contact_email', 'support@example.com'),
('contact_phone', '+8801000000000'),
('contact_address', 'ঢাকা, বাংলাদেশ'),
('timezone', 'Asia/Dhaka'),
('currency_code', 'USDT'),
('currency_symbol', '$'),
('logo', ''),
('favicon', ''),
('og_image', ''),
('pwa_icon', ''),
('theme_color', '#5b4bff'),
('accent_color', '#5b4bff'),
('login_title', 'আবার স্বাগতম'),
('login_subtitle', 'আপনার অ্যাকাউন্টে নিরাপদে লগইন করুন'),
('auth_manual', '1'),
('auth_google', '0'),
('auth_passkey', '1'),
('auth_registration', '1'),
('auth_email_verification', '0'),
('auth_2fa', '1'),
('captcha_provider', 'builtin'),
('captcha_on_login', '0'),
('captcha_on_register', '1'),
('captcha_site_key', ''),
('captcha_secret', ''),
('google_client_id', ''),
('google_client_secret', ''),
('theme_light', '1'),
('theme_dark', '1'),
('theme_system', '1'),
('theme_default', 'light'),
('pwa_enabled', '1'),
('pwa_auto_prompt', '1'),
('pwa_install_delay', '25'),
('pwa_app_name', 'Probaho — Smart Payments'),
('pwa_short_name', 'Probaho'),
('pwa_description', 'সহজ, দ্রুত ও নিরাপদ ডিজিটাল পেমেন্ট'),
('pwa_background_color', '#ffffff'),
('push_enabled', '1'),
('push_vapid_public', ''),
('push_vapid_private', ''),
('push_subject', 'mailto:support@example.com'),
('ai_enabled', '1'),
('ai_name', 'AI সহকারী'),
('ai_welcome', 'আসসালামু আলাইকুম! 👋 আমি Probaho-এর AI সহকারী। পেমেন্ট, ওয়ালেট, Binance Pay, অ্যাকাউন্ট বা সার্ভিস নিয়ে যেকোনো প্রশ্ন করুন।'),
('ai_provider', 'local'),
('ai_api_key', ''),
('ai_model', 'claude-opus-5-5'),
('ai_base_url', ''),
('ai_system_prompt', 'You are the official assistant of this website. Answer ONLY using the provided site knowledge. Reply in the same language the user writes in (Bengali or English). Be short, friendly and precise. If the knowledge does not contain the answer, say so and suggest contacting human support. Never invent links, numbers, prices or policies.'),
('ai_log_chats', '1'),
('ai_quick_questions', 'Binance Pay দিয়ে কীভাবে পেমেন্ট করব?\nকীভাবে টাকা জমা দেব?\nPasskey কী?\nআপনাদের Telegram কোথায়?\nঅ্যাপ কীভাবে ইনস্টল করব?'),
('binance_enabled', '1'),
('binance_mode', 'manual'),
('binance_api_key', ''),
('binance_api_secret', ''),
('binance_pay_id', ''),
('binance_pay_name', ''),
('binance_currency', 'USDT'),
('binance_min', '1'),
('binance_max', '5000'),
('binance_expire_minutes', '30'),
('binance_instructions', '১. পরিমাণ লিখে "পেমেন্ট শুরু করুন" চাপুন।\n২. Binance অ্যাপে QR স্ক্যান করুন অথবা Checkout বাটনে চাপুন।\n৩. পেমেন্ট সম্পন্ন হলে স্ট্যাটাস স্বয়ংক্রিয়ভাবে আপডেট হবে।\n৪. Manual মোডে Binance Pay ID-তে টাকা পাঠিয়ে Order ID জমা দিন — অ্যাডমিন যাচাই করে ব্যালেন্স যোগ করবেন।'),
('transfer_enabled', '1'),
('transfer_fee_percent', '0'),
('transfer_fee_fixed', '0'),
('transfer_min', '1'),
('transfer_max', '5000'),
('withdraw_enabled', '1'),
('security_session_timeout', '120'),
('security_remember_days', '30'),
('security_max_attempts', '5'),
('security_lockout_minutes', '15'),
('security_password_min', '8'),
('security_password_strong', '1'),
('security_admin_2fa', '0'),
('security_login_alerts', '1'),
('security_notify_admin_email', ''),
('maintenance_mode', '0'),
('hero_title', 'সহজ, দ্রুত ও নিরাপদ ডিজিটাল পেমেন্ট'),
('hero_subtitle', 'এক অ্যাপেই ওয়ালেট, Binance Pay, QR পেমেন্ট, ট্রান্সফার এবং প্রয়োজনীয় সব ডিজিটাল সার্ভিস — ব্যাংক-গ্রেড নিরাপত্তা ও Passkey সুরক্ষাসহ।'),
('hero_subtitle_en', 'One secure app for your wallet, Binance Pay, QR payments, transfers and everyday digital services.'),
('about_text', 'Probaho একটি আধুনিক ডিজিটাল পেমেন্ট ও সার্ভিস প্ল্যাটফর্ম। এখানে আপনি নিজের ওয়ালেটে টাকা জমা, উত্তোলন ও ট্রান্সফার করতে পারবেন, Binance Pay দিয়ে নিরাপদে পেমেন্ট করতে পারবেন এবং সরকারি ও মোবাইল সংক্রান্ত বিভিন্ন সার্ভিস এক জায়গা থেকে নিতে পারবেন।'),
('footer_text', 'সহজ, দ্রুত ও নিরাপদ ডিজিটাল পেমেন্ট ও সার্ভিস প্ল্যাটফর্ম।'),
('social_facebook', ''),
('analytics_head', '');

INSERT IGNORE INTO smtp_settings (id, is_enabled, host, port, username, password, encryption, from_email, from_name)
VALUES (1, 0, '', 587, '', NULL, 'tls', 'no-reply@example.com', 'Probaho');

INSERT IGNORE INTO support_settings (id, title, description, working_hours, response_message,
  telegram_enabled, telegram_name, telegram_username, telegram_url,
  whatsapp_enabled, whatsapp_name, whatsapp_number, whatsapp_url)
VALUES (1, 'আমরা সাহায্য করতে প্রস্তুত', 'যেকোনো সমস্যা, পেমেন্ট সংক্রান্ত প্রশ্ন বা পরামর্শের জন্য সরাসরি আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন।',
  'প্রতিদিন সকাল ৯টা — রাত ১১টা', 'সাধারণত ১০–৩০ মিনিটের মধ্যে উত্তর দেওয়া হয়।',
  1, 'Probaho Support', 'probaho_support', 'https://t.me/probaho_support',
  1, 'Probaho Help Desk', '+8801000000000', 'https://wa.me/8801000000000');

INSERT IGNORE INTO service_categories (id, name, slug, sort_order) VALUES
(1, 'সরকারি সার্ভিস', 'government', 1),
(2, 'মোবাইল ও টেলিকম', 'telecom', 2),
(3, 'পেমেন্ট', 'payment', 3),
(4, 'অন্যান্য', 'other', 4);

INSERT IGNORE INTO services (id, category_id, slug, title, subtitle, description, icon, color, badge, price, action_url, sort_order) VALUES
(1, 2, 'sim-biometric', 'SIM Biometric', 'সিম বায়োমেট্রিক তথ্য', 'আপনার নামে নিবন্ধিত সিম ও বায়োমেট্রিক তথ্য সংক্রান্ত সহায়তা।', 'fingerprint', '#5b4bff', NULL, 0, NULL, 1),
(2, 1, 'nid-documents', 'NID Documents', 'এনআইডি ডকুমেন্টস', 'জাতীয় পরিচয়পত্র সংক্রান্ত ডকুমেন্ট ও তথ্য সহায়তা।', 'id-card', '#0ea5e9', NULL, 0, NULL, 2),
(3, 1, 'government-service', 'Government Service', 'সরকারি সেবা', 'বিভিন্ন সরকারি অনলাইন সেবায় আবেদন সহায়তা।', 'landmark', '#16a34a', NULL, 0, NULL, 3),
(4, 3, 'mfs-wallet', 'MFS Wallet', 'মোবাইল ফিন্যান্সিয়াল সার্ভিস', 'মোবাইল ব্যাংকিং ওয়ালেট সংক্রান্ত সেবা।', 'smartphone', '#ec4899', NULL, 0, NULL, 4),
(5, 2, 'btrc-services', 'BTRC Services', 'বিটিআরসি সেবা', 'টেলিকম রেগুলেটরি সংক্রান্ত তথ্য ও সহায়তা।', 'radio', '#f59e0b', NULL, 0, NULL, 5),
(6, 2, 'imei-checker', 'IMEI Checker', 'IMEI যাচাই', 'মোবাইল ফোনের IMEI নিবন্ধন যাচাই করুন।', 'scan', '#8b5cf6', 'নতুন', 0, NULL, 6),
(7, 2, 'mobile-recharge', 'Mobile Recharge', 'মোবাইল রিচার্জ', 'যেকোনো অপারেটরে দ্রুত রিচার্জ।', 'zap', '#ef4444', NULL, 0, NULL, 7),
(8, 3, 'bill-payment', 'Bill Payment', 'বিল পেমেন্ট', 'বিদ্যুৎ, গ্যাস, পানি, ইন্টারনেট বিল পরিশোধ।', 'receipt', '#14b8a6', NULL, 0, NULL, 8),
(9, 3, 'qr-payment', 'QR Payment', 'QR পেমেন্ট', 'QR স্ক্যান করে তাৎক্ষণিক পেমেন্ট।', 'qr', '#6366f1', NULL, 0, '/qr', 9),
(10, 3, 'bank-service', 'Bank Service', 'ব্যাংক সেবা', 'ব্যাংক ট্রান্সফার ও সংশ্লিষ্ট সহায়তা।', 'bank', '#0f766e', NULL, 0, NULL, 10),
(11, 3, 'binance-pay', 'Binance Pay', 'ক্রিপ্টো পেমেন্ট', 'Binance Pay দিয়ে নিরাপদে ওয়ালেটে টাকা যোগ করুন।', 'binance', '#f0b90b', 'জনপ্রিয়', 0, '/payment/binance-pay', 11),
(12, 4, 'other-services', 'Other Services', 'অন্যান্য সেবা', 'আরও নতুন সেবা শীঘ্রই আসছে।', 'grid', '#64748b', NULL, 0, '/support', 12);

INSERT IGNORE INTO payment_methods (code, name, description, icon, color, direction, account_label, instructions, min_amount, max_amount, fee_percent, fee_fixed, is_active, show_on_landing, sort_order) VALUES
('binance_pay', 'Binance Pay', 'ক্রিপ্টো (USDT) দিয়ে তাৎক্ষণিক পেমেন্ট', 'binance', '#f0b90b', 'both', 'Binance Pay ID', 'Binance Pay ID / ইমেইল লিখুন।', 1, 5000, 0, 0, 1, 1, 1),
('bank', 'Bank Transfer', 'যেকোনো ব্যাংক অ্যাকাউন্টে ট্রান্সফার', 'bank', '#0f766e', 'withdraw', 'ব্যাংক অ্যাকাউন্ট (নাম, ব্যাংক, নম্বর)', 'অ্যাকাউন্টের নাম, ব্যাংক ও শাখার নাম এবং অ্যাকাউন্ট নম্বর লিখুন।', 10, 5000, 1, 0, 1, 1, 2),
('qr', 'QR Payment', 'QR স্ক্যান করে ইউজার-টু-ইউজার পেমেন্ট', 'qr', '#6366f1', 'both', NULL, NULL, 1, 5000, 0, 0, 1, 1, 3);

INSERT IGNORE INTO products (id, slug, title_bn, title_en, summary, description, category, release_date, button_text, button_url, is_featured, status, published_at) VALUES
(1, 'probaho-wallet-2', 'প্রবাহ ওয়ালেট ২.০ — নতুন অভিজ্ঞতা', 'Probaho Wallet 2.0', 'আরও দ্রুত ট্রান্সফার, Passkey লগইন এবং নতুন ডিজাইন।', 'প্রবাহ ওয়ালেট ২.০-এ যুক্ত হয়েছে:\n\n• Passkey দিয়ে পাসওয়ার্ড ছাড়া লগইন\n• QR দিয়ে তাৎক্ষণিক পেমেন্ট\n• Binance Pay সাপোর্ট\n• নতুন ডার্ক মোড\n• পুশ নোটিফিকেশন\n\nএখনই আপডেট করে নতুন অভিজ্ঞতা নিন।', 'Wallet', CURDATE(), 'ওয়ালেট খুলুন', '/wallet', 1, 'published', NOW());

INSERT IGNORE INTO product_posts (id, product_id, type, title, body, url, is_pinned, status) VALUES
(1, 1, 'announcement', 'স্বাগতম প্রবাহে! 🎉', 'Passkey চালু করে আপনার অ্যাকাউন্ট আরও সুরক্ষিত করুন। প্রোফাইল → নিরাপত্তা থেকে এক ক্লিকে Passkey যোগ করুন।', '/settings', 1, 'published');

INSERT IGNORE INTO faqs (id, question, answer, sort_order) VALUES
(1, 'কীভাবে অ্যাকাউন্ট তৈরি করব?', 'হোমপেজে "অ্যাকাউন্ট তৈরি করুন" বাটনে চাপুন। নাম, ইমেইল, মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে রেজিস্টার করুন, অথবা "Continue with Google" দিয়ে এক ক্লিকে অ্যাকাউন্ট খুলুন।', 1),
(2, 'কীভাবে লগইন করব?', 'তিনভাবে লগইন করা যায়: ইমেইল/মোবাইল ও পাসওয়ার্ড দিয়ে, Google অ্যাকাউন্ট দিয়ে অথবা Passkey (ফিঙ্গারপ্রিন্ট/ফেস/ডিভাইস PIN) দিয়ে।', 2),
(3, 'Passkey কী?', 'Passkey হলো পাসওয়ার্ড ছাড়া লগইনের আধুনিক ও নিরাপদ পদ্ধতি। আপনার ফোনের ফিঙ্গারপ্রিন্ট, ফেস আনলক বা স্ক্রিন লক দিয়ে লগইন হয়। আপনার বায়োমেট্রিক তথ্য কখনোই আমাদের সার্ভারে যায় না।', 3),
(4, 'Binance Pay কীভাবে ব্যবহার করব?', 'ওয়ালেট → জমা → Binance Pay নির্বাচন করুন। পরিমাণ লিখে পেমেন্ট শুরু করুন, তারপর Binance অ্যাপে QR স্ক্যান করুন বা Checkout বাটনে চাপুন। পেমেন্ট সফল হলে ব্যালেন্স স্বয়ংক্রিয়ভাবে যোগ হবে।', 4),
(5, 'টাকা জমা কীভাবে দেব?', 'ওয়ালেট পেজে "জমা" বাটনে চাপুন, পেমেন্ট মেথড নির্বাচন করুন এবং নির্দেশনা অনুযায়ী পেমেন্ট সম্পন্ন করুন।', 5),
(6, 'Transaction কোথায় দেখব?', 'নিচের মেনু থেকে ওয়ালেট → লেনদেন অথবা /transactions পেজে সব লেনদেন দেখতে পারবেন। প্রতিটি লেনদেনে চাপলে বিস্তারিত দেখা যাবে।', 6),
(7, 'অ্যাপ কীভাবে ইনস্টল করব?', 'Android Chrome-এ "অ্যাপ ইনস্টল করুন" বাটনে চাপুন। iPhone-এ Safari-র Share বাটন → "Add to Home Screen" নির্বাচন করুন।', 7),
(8, 'Support কোথায় পাব?', 'সাপোর্ট পেজ থেকে সরাসরি Telegram বা WhatsApp-এ আমাদের টিমের সাথে কথা বলতে পারবেন। এছাড়া AI সহকারী ২৪/৭ প্রশ্নের উত্তর দেয়।', 8);

INSERT IGNORE INTO pages (slug, title, content) VALUES
('privacy', 'গোপনীয়তা নীতি (Privacy Policy)', 'আমরা আপনার ব্যক্তিগত তথ্যের গোপনীয়তাকে সর্বোচ্চ গুরুত্ব দিই।\n\n১. আমরা যে তথ্য সংগ্রহ করি: নাম, ইমেইল, মোবাইল নম্বর, লেনদেনের তথ্য এবং ডিভাইস/ব্রাউজারের প্রাথমিক তথ্য।\n\n২. Passkey: আপনার ফিঙ্গারপ্রিন্ট, ফেস বা অন্য কোনো বায়োমেট্রিক তথ্য আমরা কখনো সংগ্রহ বা সংরক্ষণ করি না। শুধুমাত্র WebAuthn পাবলিক কী সংরক্ষিত থাকে।\n\n৩. তথ্যের ব্যবহার: সেবা প্রদান, নিরাপত্তা, লেনদেন প্রক্রিয়াকরণ ও নোটিফিকেশন পাঠাতে।\n\n৪. তৃতীয় পক্ষ: পেমেন্ট প্রক্রিয়ার জন্য প্রয়োজনীয় তথ্য পেমেন্ট প্রোভাইডারের (যেমন Binance Pay) সাথে শেয়ার হতে পারে। আমরা কোনো তথ্য বিক্রি করি না।\n\n৫. যোগাযোগ: গোপনীয়তা সংক্রান্ত প্রশ্নে সাপোর্ট পেজ থেকে যোগাযোগ করুন।'),
('terms', 'শর্তাবলী (Terms of Service)', 'এই প্ল্যাটফর্ম ব্যবহার করে আপনি নিচের শর্তাবলীতে সম্মত হচ্ছেন।\n\n১. অ্যাকাউন্টের নিরাপত্তা রক্ষার দায়িত্ব ব্যবহারকারীর।\n২. প্রতারণামূলক বা অবৈধ লেনদেন সম্পূর্ণ নিষিদ্ধ; এমন কার্যক্রমে অ্যাকাউন্ট স্থগিত করা হবে।\n৩. লেনদেনের ফি ও সীমা সময়ে সময়ে পরিবর্তিত হতে পারে এবং অ্যাপে প্রদর্শিত হবে।\n৪. ক্রিপ্টো পেমেন্ট (Binance Pay) Binance-এর নিজস্ব শর্তাবলীর অধীন।\n৫. যেকোনো বিরোধে সাপোর্ট টিমের সিদ্ধান্ত চূড়ান্ত বলে বিবেচিত হবে।'),
('about', 'আমাদের সম্পর্কে', 'Probaho (প্রবাহ) একটি আধুনিক ডিজিটাল পেমেন্ট ও সার্ভিস প্ল্যাটফর্ম। আমাদের লক্ষ্য — সবার জন্য সহজ, দ্রুত ও নিরাপদ ডিজিটাল লেনদেন।\n\nএক অ্যাপেই ওয়ালেট, Binance Pay, QR পেমেন্ট, ট্রান্সফার এবং সরকারি ও মোবাইল সংক্রান্ত প্রয়োজনীয় সার্ভিস।'),
('contact', 'যোগাযোগ', 'যেকোনো প্রয়োজনে আমাদের সাপোর্ট পেজ থেকে Telegram বা WhatsApp-এ যোগাযোগ করুন, অথবা ইমেইল করুন।');

INSERT IGNORE INTO ai_knowledge (id, title, category, keywords, content, priority) VALUES
(1, 'প্ল্যাটফর্ম পরিচিতি', 'site', 'about,কী,what,platform,প্রবাহ,probaho,পরিচিতি', 'Probaho (প্রবাহ) একটি ডিজিটাল পেমেন্ট ও সার্ভিস প্ল্যাটফর্ম। এখানে ওয়ালেটে টাকা জমা (Deposit), উত্তোলন (Withdraw), ট্রান্সফার, QR পেমেন্ট এবং Binance Pay দিয়ে পেমেন্ট করা যায়। এছাড়া SIM Biometric, NID, সরকারি সেবা, মোবাইল রিচার্জ, বিল পেমেন্টসহ বিভিন্ন সার্ভিস রয়েছে।', 10),
(2, 'Binance Pay দিয়ে পেমেন্ট', 'payment', 'binance,বাইন্যান্স,pay,usdt,crypto,ক্রিপ্টো,deposit,জমা', 'Binance Pay দিয়ে পেমেন্ট করতে: ১) ওয়ালেট → জমা (Deposit) → Binance Pay নির্বাচন করুন অথবা সরাসরি /payment/binance-pay পেজে যান। ২) পরিমাণ লিখে "পেমেন্ট শুরু করুন" চাপুন। ৩) Binance অ্যাপ দিয়ে QR স্ক্যান করুন অথবা "Binance-এ পেমেন্ট করুন" বাটনে চাপুন। ৪) পেমেন্ট সফল হলে স্ট্যাটাস Success হবে এবং ব্যালেন্স স্বয়ংক্রিয়ভাবে যোগ হবে। Manual মোডে দেখানো Binance Pay ID-তে টাকা পাঠিয়ে Binance Order ID জমা দিন, অ্যাডমিন যাচাই করে ব্যালেন্স যোগ করবেন। Binance শুধুমাত্র পেমেন্ট মেথড — Binance দিয়ে লগইন করা যায় না।', 9),
(3, 'অ্যাকাউন্ট তৈরি ও লগইন', 'account', 'register,signup,account,অ্যাকাউন্ট,রেজিস্টার,login,লগইন,password,পাসওয়ার্ড,google', 'অ্যাকাউন্ট তৈরি করতে /register পেজে নাম, ইমেইল, মোবাইল ও পাসওয়ার্ড দিন অথবা "Continue with Google" ব্যবহার করুন। লগইন করার তিনটি উপায়: ১) ইমেইল/মোবাইল + পাসওয়ার্ড, ২) Google লগইন, ৩) Passkey। পাসওয়ার্ড ভুলে গেলে লগইন পেজে "পাসওয়ার্ড ভুলে গেছেন?" লিংকে চাপুন — ইমেইলে রিসেট লিংক যাবে।', 8),
(4, 'Passkey', 'security', 'passkey,পাসকি,fingerprint,ফিঙ্গারপ্রিন্ট,face,biometric,webauthn,windows hello', 'Passkey হলো পাসওয়ার্ডবিহীন নিরাপদ লগইন। Android ফিঙ্গারপ্রিন্ট, ফেস আনলক, ডিভাইস PIN, Windows Hello বা সিকিউরিটি কী সাপোর্ট করে। যোগ করতে: প্রোফাইল → সেটিংস → নিরাপত্তা → "নতুন Passkey যোগ করুন"। একাধিক ডিভাইসে Passkey রাখা যায়, নাম পরিবর্তন ও মুছে ফেলা যায়। আপনার বায়োমেট্রিক তথ্য কখনো সার্ভারে সংরক্ষণ হয় না।', 8),
(5, 'টাকা জমা, উত্তোলন ও ট্রান্সফার', 'wallet', 'deposit,withdraw,transfer,জমা,উত্তোলন,ট্রান্সফার,wallet,ওয়ালেট,balance,ব্যালেন্স,টাকা', 'ওয়ালেট পেজ থেকে: "জমা" দিয়ে পেমেন্ট মেথড বেছে টাকা যোগ করুন; "উত্তোলন" দিয়ে মেথড ও অ্যাকাউন্ট দিয়ে টাকা তোলার অনুরোধ করুন (অ্যাডমিন অনুমোদনের পর সম্পন্ন হয়); "ট্রান্সফার" দিয়ে অন্য ব্যবহারকারীর ইমেইল/মোবাইল/ইউজার আইডি দিয়ে তাৎক্ষণিক টাকা পাঠান। QR পেজে অন্যের QR স্ক্যান করেও টাকা পাঠানো যায়।', 7),
(6, 'লেনদেন (Transactions)', 'wallet', 'transaction,লেনদেন,history,হিস্ট্রি,status,স্ট্যাটাস', 'সব লেনদেন /transactions পেজে দেখা যায়। ফিল্টার: সব, জমা, উত্তোলন, পেমেন্ট, ট্রান্সফার। প্রতিটি লেনদেনে আইডি, পরিমাণ, ফি, মেথড, স্ট্যাটাস (Pending/Success/Failed/Expired), তারিখ ও রেফারেন্স থাকে। বিস্তারিত দেখতে লেনদেনে চাপুন।', 6),
(7, 'অ্যাপ ইনস্টল (PWA)', 'pwa', 'install,ইনস্টল,app,অ্যাপ,pwa,home screen,হোম স্ক্রিন,iphone,android', 'এই ওয়েবসাইটটি অ্যাপের মতো ইনস্টল করা যায়। Android/Chrome: "অ্যাপ ইনস্টল করুন" বাটনে চাপুন বা ব্রাউজার মেনু → "Install app/Add to Home Screen"। iPhone (Safari): Share বাটন → "Add to Home Screen"। Desktop Chrome/Edge: অ্যাড্রেস বারের ইনস্টল আইকনে ক্লিক করুন।', 5),
(8, 'রিপোর্ট ও অভিযোগ', 'support', 'report,রিপোর্ট,complain,অভিযোগ,problem,সমস্যা,issue', 'কোনো সমস্যা হলে /report পেজ থেকে ক্যাটাগরি, বিবরণ, স্ক্রিনশট (JPG/PNG/WEBP) এবং প্রয়োজনে Transaction ID দিয়ে রিপোর্ট করুন। রিপোর্টের স্ট্যাটাস (Pending, Reviewing, Resolved, Rejected) ও অ্যাডমিনের উত্তর "আমার রিপোর্ট" অংশে দেখা যাবে।', 5),
(9, 'নোটিফিকেশন', 'account', 'notification,নোটিফিকেশন,push,পুশ,email,ইমেইল,alert', 'অ্যাপের ভেতরে নোটিফিকেশন সেন্টারে পেমেন্ট, নিরাপত্তা, প্রোডাক্ট, সিস্টেম ও অ্যাডমিন নোটিফিকেশন দেখা যায়। সেটিংস থেকে Push Notification চালু করলে ফোনেও নোটিফিকেশন পাবেন। গুরুত্বপূর্ণ ঘটনায় ইমেইলও পাঠানো হয়।', 4);

-- No admin is seeded on purpose. Run the installer (/install) or open
-- /v2admin/login once to create the first super-admin account.
