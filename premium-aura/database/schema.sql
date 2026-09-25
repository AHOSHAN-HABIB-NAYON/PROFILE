-- =====================================================================
-- Premium Aura — MySQL 8+ schema
-- All timestamps are stored in UTC (the app sets time_zone = '+00:00').
-- All money values use DECIMAL — never FLOAT/DOUBLE.
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(120)    NOT NULL,
  email               VARCHAR(190)    NOT NULL,
  password_hash       VARCHAR(255)    NOT NULL,
  role                ENUM('user','admin') NOT NULL DEFAULT 'user',
  status              ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  email_verified_at   DATETIME        NULL,
  address             VARCHAR(255)    NULL,
  binance_uid         VARCHAR(64)     NULL,
  theme               ENUM('light','dark') NOT NULL DEFAULT 'light',
  timezone            VARCHAR(64)     NOT NULL DEFAULT 'auto',
  custom_hourly_limit INT UNSIGNED    NULL,
  custom_daily_limit  INT UNSIGNED    NULL,
  custom_quota        INT UNSIGNED    NULL,
  last_active_at      DATETIME        NULL,
  last_login_at       DATETIME        NULL,
  last_login_ip       VARCHAR(64)     NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status),
  KEY idx_users_role (role),
  KEY idx_users_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id  VARCHAR(128)    NOT NULL,
  user_id     BIGINT UNSIGNED NULL,
  data        MEDIUMTEXT      NOT NULL,
  ip          VARCHAR(64)     NULL,
  user_agent  VARCHAR(255)    NULL,
  expires_at  DATETIME        NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_security (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                  BIGINT UNSIGNED NOT NULL,
  failed_login_attempts    INT UNSIGNED    NOT NULL DEFAULT 0,
  locked_until             DATETIME        NULL,
  email_verify_token_hash  CHAR(64)        NULL,
  email_verify_expires_at  DATETIME        NULL,
  password_reset_token_hash CHAR(64)       NULL,
  password_reset_expires_at DATETIME       NULL,
  password_changed_at      DATETIME        NULL,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_security_user (user_id),
  KEY idx_user_security_verify (email_verify_token_hash),
  KEY idx_user_security_reset (password_reset_token_hash),
  CONSTRAINT fk_user_security_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS two_factor_auth (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  secret_encrypted VARCHAR(512)    NOT NULL,
  enabled          TINYINT(1)      NOT NULL DEFAULT 0,
  recovery_codes   JSON            NULL,
  confirmed_at     DATETIME        NULL,
  last_used_step   BIGINT          NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_2fa_user (user_id),
  CONSTRAINT fk_2fa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(100) NOT NULL,
  setting_value TEXT         NULL,
  is_secret     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS smtp_settings (
  id                  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  host                VARCHAR(190) NULL,
  port                INT UNSIGNED NULL,
  username            VARCHAR(190) NULL,
  password_encrypted  VARCHAR(1024) NULL,
  encryption          ENUM('none','ssl','tls') NOT NULL DEFAULT 'tls',
  from_name           VARCHAR(120) NULL,
  from_email          VARCHAR(190) NULL,
  enabled             TINYINT(1)   NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance (
  id             TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_active      TINYINT(1)   NOT NULL DEFAULT 0,
  title          VARCHAR(190) NOT NULL DEFAULT 'We will be back soon',
  message        TEXT         NULL,
  contact        VARCHAR(190) NULL,
  estimated_end  DATETIME     NULL,
  activated_by   BIGINT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_maintenance_user FOREIGN KEY (activated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope             VARCHAR(64)  NOT NULL,
  interval_seconds  INT UNSIGNED NOT NULL DEFAULT 1,
  hourly_limit      INT UNSIGNED NOT NULL DEFAULT 50,
  daily_limit       INT UNSIGNED NOT NULL DEFAULT 200,
  enabled           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rate_limits_scope (scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_uploads (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NULL,
  purpose        VARCHAR(40)  NOT NULL,
  visibility     ENUM('public','private') NOT NULL DEFAULT 'private',
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INT UNSIGNED NOT NULL,
  sha256         CHAR(64)     NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_file_stored (stored_name),
  KEY idx_files_user (user_id),
  KEY idx_files_purpose (purpose),
  CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Access services & authorized resources
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  country_name       VARCHAR(80)  NOT NULL,
  country_code       VARCHAR(8)   NOT NULL,
  flag_code          VARCHAR(8)   NOT NULL,
  app_name           VARCHAR(80)  NOT NULL,
  app_code           VARCHAR(16)  NOT NULL,
  app_icon           VARCHAR(255) NULL,
  description        VARCHAR(255) NULL,
  status             ENUM('active','inactive','maintenance') NOT NULL DEFAULT 'active',
  manual_available   INT UNSIGNED NULL,
  sort_order         INT          NOT NULL DEFAULT 0,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_country_app (country_code, app_code),
  KEY idx_services_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorized_resources (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id        BIGINT UNSIGNED NOT NULL,
  resource_value    VARCHAR(64)  NOT NULL,
  serial_digits     VARCHAR(64)  NOT NULL DEFAULT '',
  status            ENUM('available','assigned','disabled','retired') NOT NULL DEFAULT 'available',
  assigned_user_id  BIGINT UNSIGNED NULL,
  import_batch      VARCHAR(40)  NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resource_value (service_id, resource_value),
  KEY idx_resources_alloc (service_id, status, id),
  KEY idx_resources_user (assigned_user_id),
  KEY idx_resources_serial (serial_digits),
  KEY idx_resources_value (resource_value),
  CONSTRAINT fk_resources_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE,
  CONSTRAINT fk_resources_user FOREIGN KEY (assigned_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resource_assignments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  resource_id   BIGINT UNSIGNED NOT NULL,
  service_id    BIGINT UNSIGNED NOT NULL,
  status        ENUM('pending','received','released','expired','returned') NOT NULL DEFAULT 'pending',
  last_code     VARCHAR(16)  NULL,
  assigned_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at   DATETIME     NULL,
  -- Only one *active* (unreleased) assignment per resource: NULL values do not collide in UNIQUE indexes.
  active_resource_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(released_at IS NULL, resource_id, NULL)) STORED,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assign_active_resource (active_resource_id),
  KEY idx_assign_user_time (user_id, assigned_at),
  KEY idx_assign_resource (resource_id),
  KEY idx_assign_service (service_id),
  CONSTRAINT fk_assign_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  -- RESTRICT is required: MySQL forbids CASCADE on the base column of a stored generated column.
  CONSTRAINT fk_assign_resource FOREIGN KEY (resource_id) REFERENCES authorized_resources (id),
  CONSTRAINT fk_assign_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- API providers & events
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_providers (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(120) NOT NULL,
  provider_type        VARCHAR(40)  NOT NULL DEFAULT 'generic',
  base_url             VARCHAR(500) NOT NULL,
  endpoint             VARCHAR(500) NOT NULL DEFAULT '',
  http_method          ENUM('GET','POST') NOT NULL DEFAULT 'GET',
  auth_type            ENUM('none','bearer','api_key','query_token','custom_header') NOT NULL DEFAULT 'bearer',
  auth_param_name      VARCHAR(80)  NULL,
  credential_env       VARCHAR(80)  NULL,
  credential_encrypted VARCHAR(2048) NULL,
  headers_json         JSON         NULL,
  query_json           JSON         NULL,
  body_json            JSON         NULL,
  records_path         VARCHAR(190) NULL,
  polling_interval_sec INT UNSIGNED NOT NULL DEFAULT 5,
  timeout_ms           INT UNSIGNED NOT NULL DEFAULT 8000,
  enabled              TINYINT(1)   NOT NULL DEFAULT 0,
  health_status        ENUM('unknown','online','offline','error') NOT NULL DEFAULT 'unknown',
  last_checked_at      DATETIME     NULL,
  last_success_at      DATETIME     NULL,
  last_error           VARCHAR(500) NULL,
  total_fetched        BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_providers_name (name),
  KEY idx_providers_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_field_mappings (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_id     BIGINT UNSIGNED NOT NULL,
  provider_field  VARCHAR(190) NOT NULL,
  system_field    ENUM('id','country','country_code','service','application','code','resource','received_at','status','message') NOT NULL,
  transform       VARCHAR(40)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mapping (provider_id, system_field),
  CONSTRAINT fk_mapping_provider FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_provider_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_id   BIGINT UNSIGNED NOT NULL,
  level         ENUM('info','warn','error') NOT NULL DEFAULT 'info',
  http_status   INT          NULL,
  duration_ms   INT UNSIGNED NULL,
  fetched_count INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  message       VARCHAR(500) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_provider_logs (provider_id, created_at),
  CONSTRAINT fk_provider_logs_provider FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_sources (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_type  ENUM('provider','demo','manual') NOT NULL,
  provider_id  BIGINT UNSIGNED NULL,
  label        VARCHAR(120) NOT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_source_provider (provider_id),
  KEY idx_event_source_type (source_type),
  CONSTRAINT fk_event_source_provider FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Authorized (non-demo) events. Only the extracted code is stored — never the message body.
CREATE TABLE IF NOT EXISTS event_records (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id       BIGINT UNSIGNED NULL,
  provider_id     BIGINT UNSIGNED NULL,
  external_id     VARCHAR(190) NULL,
  hash            CHAR(64)     NOT NULL,
  country         VARCHAR(80)  NULL,
  country_code    VARCHAR(8)   NULL,
  service         VARCHAR(80)  NULL,
  application     VARCHAR(40)  NOT NULL,
  code            VARCHAR(16)  NOT NULL,
  resource_value  VARCHAR(64)  NULL,
  resource_id     BIGINT UNSIGNED NULL,
  user_id         BIGINT UNSIGNED NULL,
  status          ENUM('received','expired','rejected') NOT NULL DEFAULT 'received',
  reward_amount   DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  normalized_data JSON         NULL,
  received_at     DATETIME     NOT NULL,
  expires_at      DATETIME     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_hash (hash),
  UNIQUE KEY uq_event_provider_external (provider_id, external_id),
  KEY idx_events_user_feed (user_id, status, id),
  KEY idx_events_feed (status, id),
  KEY idx_events_expires (status, expires_at),
  KEY idx_events_resource (resource_id),
  KEY idx_events_received (received_at),
  CONSTRAINT fk_events_source FOREIGN KEY (source_id) REFERENCES event_sources (id) ON DELETE SET NULL,
  CONSTRAINT fk_events_provider FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE SET NULL,
  CONSTRAINT fk_events_resource FOREIGN KEY (resource_id) REFERENCES authorized_resources (id) ON DELETE SET NULL,
  CONSTRAINT fk_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS demo_event_settings (
  id                 TINYINT UNSIGNED NOT NULL DEFAULT 1,
  enabled            TINYINT(1)   NOT NULL DEFAULT 0,
  events_per_second  TINYINT UNSIGNED NOT NULL DEFAULT 2,
  interval_ms        INT UNSIGNED NOT NULL DEFAULT 1000,
  applications       JSON         NULL,
  countries          JSON         NULL,
  expiration_hours   INT UNSIGNED NOT NULL DEFAULT 24,
  starting_count     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  generated_total    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demo / test events are stored separately and always carry the DEMO status.
CREATE TABLE IF NOT EXISTS demo_event_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sequence_no   BIGINT UNSIGNED NOT NULL,
  application   VARCHAR(40)  NOT NULL,
  country_code  VARCHAR(8)   NOT NULL,
  code          VARCHAR(16)  NOT NULL,
  status        ENUM('DEMO','expired') NOT NULL DEFAULT 'DEMO',
  received_at   DATETIME     NOT NULL,
  expires_at    DATETIME     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_demo_feed (status, id),
  KEY idx_demo_expires (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Premium, wallet, payments, withdrawals
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS premium_plans (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(80)   NOT NULL,
  description     VARCHAR(255)  NULL,
  duration_days   INT UNSIGNED  NOT NULL,
  price           DECIMAL(12,2) NOT NULL,
  resource_limit  INT UNSIGNED  NULL COMMENT 'NULL = unlimited',
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  is_featured     TINYINT(1)    NOT NULL DEFAULT 0,
  sort_order      INT           NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plans_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  balance       DECIMAL(16,4) NOT NULL DEFAULT 0.0000,
  total_earned  DECIMAL(16,4) NOT NULL DEFAULT 0.0000,
  total_withdrawn DECIMAL(16,4) NOT NULL DEFAULT 0.0000,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_user (user_id),
  CONSTRAINT chk_wallet_balance CHECK (balance >= 0),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  plan_id           BIGINT UNSIGNED NULL,
  method            ENUM('trc20','binance','wallet') NOT NULL,
  amount            DECIMAL(12,2) NOT NULL,
  transaction_ref   VARCHAR(190) NULL,
  screenshot_file_id BIGINT UNSIGNED NULL,
  status            ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note        VARCHAR(255) NULL,
  reviewed_by       BIGINT UNSIGNED NULL,
  reviewed_at       DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_user (user_id, created_at),
  KEY idx_payments_status (status, created_at),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES premium_plans (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_file FOREIGN KEY (screenshot_file_id) REFERENCES file_uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_premium (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  plan_id         BIGINT UNSIGNED NULL,
  plan_name       VARCHAR(80)  NOT NULL,
  resource_limit  INT UNSIGNED NULL COMMENT 'NULL = unlimited',
  starts_at       DATETIME     NOT NULL,
  expires_at      DATETIME     NOT NULL,
  status          ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  payment_id      BIGINT UNSIGNED NULL,
  granted_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_premium_user (user_id, status, expires_at),
  KEY idx_premium_expires (status, expires_at),
  CONSTRAINT fk_premium_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_premium_plan FOREIGN KEY (plan_id) REFERENCES premium_plans (id) ON DELETE SET NULL,
  CONSTRAINT fk_premium_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_premium_granted FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS withdrawals (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  amount        DECIMAL(16,4) NOT NULL,
  binance_uid   VARCHAR(64)  NOT NULL,
  status        ENUM('pending','waiting_admin','approved','rejected','paid') NOT NULL DEFAULT 'pending',
  admin_note    VARCHAR(255) NULL,
  reviewed_by   BIGINT UNSIGNED NULL,
  reviewed_at   DATETIME     NULL,
  paid_at       DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_withdrawals_user (user_id, created_at),
  KEY idx_withdrawals_status (status, created_at),
  CONSTRAINT fk_withdrawals_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_withdrawals_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_id       BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  type            ENUM('credit','debit','withdraw','refund','admin_adjustment') NOT NULL,
  amount          DECIMAL(16,4) NOT NULL COMMENT 'signed: positive = in, negative = out',
  balance_after   DECIMAL(16,4) NOT NULL,
  description     VARCHAR(255) NOT NULL,
  status          ENUM('completed','pending','failed','reversed') NOT NULL DEFAULT 'completed',
  event_id        BIGINT UNSIGNED NULL,
  withdrawal_id   BIGINT UNSIGNED NULL,
  payment_id      BIGINT UNSIGNED NULL,
  admin_id        BIGINT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_tx_event (event_id),
  KEY idx_wallet_tx_user (user_id, id),
  KEY idx_wallet_tx_type (type, created_at),
  CONSTRAINT fk_wallet_tx_wallet FOREIGN KEY (wallet_id) REFERENCES wallets (id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_tx_event FOREIGN KEY (event_id) REFERENCES event_records (id) ON DELETE SET NULL,
  CONSTRAINT fk_wallet_tx_withdrawal FOREIGN KEY (withdrawal_id) REFERENCES withdrawals (id) ON DELETE SET NULL,
  CONSTRAINT fk_wallet_tx_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_wallet_tx_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- News & notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_posts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id         BIGINT UNSIGNED NULL,
  title             VARCHAR(200) NOT NULL,
  slug              VARCHAR(220) NOT NULL,
  category          ENUM('announcement','update','offer','maintenance','premium','tips','general') NOT NULL DEFAULT 'general',
  body_html         MEDIUMTEXT   NOT NULL,
  excerpt           VARCHAR(300) NULL,
  image_url         VARCHAR(500) NULL,
  app_icons         JSON         NULL,
  link_url          VARCHAR(500) NULL,
  link_label        VARCHAR(80)  NULL,
  status            ENUM('draft','published') NOT NULL DEFAULT 'published',
  is_pinned         TINYINT(1)   NOT NULL DEFAULT 0,
  views             INT UNSIGNED NOT NULL DEFAULT 0,
  demo_likes        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Clearly labelled demo engagement — never mixed into real counts',
  demo_shares       INT UNSIGNED NOT NULL DEFAULT 0,
  demo_views        INT UNSIGNED NOT NULL DEFAULT 0,
  meta_title        VARCHAR(200) NULL,
  meta_description  VARCHAR(300) NULL,
  canonical_url     VARCHAR(500) NULL,
  og_title          VARCHAR(200) NULL,
  og_description    VARCHAR(300) NULL,
  og_image          VARCHAR(500) NULL,
  twitter_card      ENUM('summary','summary_large_image') NOT NULL DEFAULT 'summary_large_image',
  published_at      DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_slug (slug),
  KEY idx_news_feed (status, is_pinned, published_at),
  KEY idx_news_category (category),
  CONSTRAINT fk_news_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_likes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id     BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_like (post_id, user_id),
  KEY idx_news_likes_user (user_id),
  CONSTRAINT fk_news_likes_post FOREIGN KEY (post_id) REFERENCES news_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_news_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_shares (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id     BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NULL,
  channel     VARCHAR(40) NOT NULL DEFAULT 'link',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_news_shares_post (post_id),
  CONSTRAINT fk_news_shares_post FOREIGN KEY (post_id) REFERENCES news_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_news_shares_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  type        ENUM('service','resource','post','payment','premium','withdrawal','system') NOT NULL DEFAULT 'system',
  title       VARCHAR(160) NOT NULL,
  body        VARCHAR(500) NULL,
  link        VARCHAR(255) NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read, id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id     BIGINT UNSIGNED NULL,
  category     ENUM('admin','security','auth','system') NOT NULL DEFAULT 'admin',
  action       VARCHAR(80)  NOT NULL,
  target_type  VARCHAR(40)  NULL,
  target_id    VARCHAR(64)  NULL,
  details      JSON         NULL,
  ip           VARCHAR(64)  NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_logs_admin (admin_id, created_at),
  KEY idx_admin_logs_category (category, created_at),
  KEY idx_admin_logs_action (action),
  CONSTRAINT fk_admin_logs_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(100) NOT NULL,
  applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
