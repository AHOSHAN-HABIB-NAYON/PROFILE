-- OryzenX BD schema (MySQL 8 / MariaDB 10.6+). All money is USD, stored as DECIMAL.
-- All DATETIME values are wall-clock time in APP_TZ (default Asia/Dhaka, +06:00).
-- Safe to run repeatedly: every table uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role             ENUM('super_admin','admin','user') NOT NULL DEFAULT 'user',
  status           ENUM('pending','active','restricted','disabled') NOT NULL DEFAULT 'pending',
  name             VARCHAR(120) NOT NULL,
  email            VARCHAR(190) NOT NULL UNIQUE,
  password_hash    VARCHAR(100) NULL,
  google_sub       VARCHAR(64) NULL UNIQUE,
  email_verified_at DATETIME NULL,
  avatar_url       VARCHAR(255) NULL,
  -- Private fields: only the user and admins can read these.
  phone            VARCHAR(40) NULL,
  address          VARCHAR(255) NULL,
  -- Admin-controlled investment terms.
  deposit_amount   DECIMAL(18,2) NOT NULL DEFAULT 0,
  deposit_date     DATE NULL,
  deposit_received_at DATETIME NULL,
  salary           DECIMAL(18,2) NOT NULL DEFAULT 0,
  privacy_accepted_at DATETIME NULL,
  reminder_emails  TINYINT(1) NOT NULL DEFAULT 1,  -- users may opt out of reminder emails only
  token_version    INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- One-time tokens for email verification and password reset (only the hash is stored).
CREATE TABLE IF NOT EXISTS user_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  type        ENUM('verify_email','reset_password') NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invites (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(32) NOT NULL UNIQUE,
  email       VARCHAR(190) NULL,
  created_by  INT UNSIGNED NULL,
  used_by     INT UNSIGNED NULL,
  used_at     DATETIME NULL,
  expires_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_events (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  email       VARCHAR(190) NULL,
  ip          VARCHAR(64) NULL,
  user_agent  VARCHAR(255) NULL,
  success     TINYINT(1) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, created_at)
);

-- Key/value project settings (balances, email toggles, ...). Values are JSON.
CREATE TABLE IF NOT EXISTS settings (
  k          VARCHAR(64) PRIMARY KEY,
  v          JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- The payment day for each month, set by admin.
CREATE TABLE IF NOT EXISTS payment_schedule (
  month      CHAR(7) PRIMARY KEY,            -- 'YYYY-MM'
  pay_date   DATE NOT NULL,
  note       VARCHAR(255) NULL,
  set_by     INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- One salary payment per user per month.
CREATE TABLE IF NOT EXISTS payments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  month      CHAR(7) NOT NULL,
  amount     DECIMAL(18,2) NOT NULL,
  status     ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  method     VARCHAR(30) NULL,
  paid_at    DATETIME NULL,
  note       VARCHAR(255) NULL,
  marked_by  INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (user_id, month),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Private payout details (bKash, Nagad, Rocket, Bank, Crypto).
CREATE TABLE IF NOT EXISTS payment_methods (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('bkash','nagad','rocket','bank','crypto') NOT NULL,
  account    VARCHAR(190) NOT NULL,
  holder     VARCHAR(120) NULL,
  network    VARCHAR(40) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (user_id, type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Closed trades. profit is net of nothing (fee stored separately); negative profit = loss.
CREATE TABLE IF NOT EXISTS trades (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coin       VARCHAR(20) NOT NULL,
  side       ENUM('long','short','spot') NOT NULL DEFAULT 'spot',
  profit     DECIMAL(18,2) NOT NULL,
  fee        DECIMAL(18,2) NOT NULL DEFAULT 0,
  traded_at  DATETIME NOT NULL,
  note       VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (traded_at),
  INDEX (coin)
);

-- Main Flow Invest holdings.
CREATE TABLE IF NOT EXISTS investments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coin        VARCHAR(20) NOT NULL,
  quantity    DECIMAL(30,10) NOT NULL,
  entry_price DECIMAL(24,10) NOT NULL,
  invested_at DATE NOT NULL,
  status      ENUM('open','closed') NOT NULL DEFAULT 'open',
  note        VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loans (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind           ENUM('coin','usd') NOT NULL,
  coin           VARCHAR(20) NULL,
  quantity       DECIMAL(30,10) NULL,
  entry_price    DECIMAL(24,10) NULL,
  amount_usd     DECIMAL(18,2) NOT NULL DEFAULT 0,
  remaining_usd  DECIMAL(18,2) NOT NULL DEFAULT 0,
  lender         VARCHAR(120) NULL,
  borrowed_at    DATE NOT NULL,
  repay_date     DATE NULL,
  status         ENUM('open','repaid') NOT NULL DEFAULT 'open',
  note           VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NULL,               -- NULL = everyone
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS notification_reads (
  user_id         INT UNSIGNED PRIMARY KEY,
  last_read_id    BIGINT UNSIGNED NOT NULL DEFAULT 0
);

-- Outgoing email queue; a worker sends these so requests never wait on SMTP.
CREATE TABLE IF NOT EXISTS email_queue (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  to_email    VARCHAR(190) NOT NULL,
  type        VARCHAR(40) NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  html        MEDIUMTEXT NOT NULL,
  status      ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(500) NULL,
  send_after  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (status, send_after)
);

-- Who changed what and when.
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id   INT UNSIGNED NULL,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(40) NULL,
  entity_id  VARCHAR(40) NULL,
  details    JSON NULL,
  ip         VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
);
