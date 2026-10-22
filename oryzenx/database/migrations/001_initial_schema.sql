-- OryzenX initial schema. MySQL 5.7.8+/MariaDB 10.3+ (InnoDB, utf8mb4).
-- Money: DECIMAL(24,8) USD. Quantities/prices: DECIMAL(36,18). Never FLOAT for authoritative values.
-- All timestamps are stored in UTC.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(40) NULL,
  phone VARCHAR(32) NULL,
  status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  suspended_reason VARCHAR(255) NULL,
  email_verified_at DATETIME NULL,
  identity_status ENUM('not_submitted','pending','approved','rejected') NOT NULL DEFAULT 'not_submitted',
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  locale VARCHAR(5) NOT NULL DEFAULT 'en',
  theme ENUM('light','dark','system') NOT NULL DEFAULT 'light',
  google_sub VARCHAR(64) NULL,
  avatar_path VARCHAR(255) NULL,
  last_login_at DATETIME NULL,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  terms_accepted_at DATETIME NULL,
  password_changed_at DATETIME NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_users_uuid (uuid),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_google (google_sub),
  KEY idx_users_status (status, email_verified_at),
  KEY idx_users_identity (identity_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  address_line VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  date_of_birth DATE NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_roles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  group_name VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_permissions_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  kind ENUM('web','api') NOT NULL DEFAULT 'web',
  csrf_token CHAR(43) NULL,
  device_name VARCHAR(100) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  reauth_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  email VARCHAR(190) NULL,
  method ENUM('password','google','token') NOT NULL DEFAULT 'password',
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  success TINYINT(1) NOT NULL,
  reason VARCHAR(60) NULL,
  suspicious TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_login_user (user_id, created_at),
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('email_verify') NOT NULL DEFAULT 'email_verify',
  token_hash CHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_vt_token (token_hash),
  KEY idx_vt_user (user_id, purpose, used_at),
  CONSTRAINT fk_vt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip VARCHAR(45) NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_prt_token (token_hash),
  KEY idx_prt_user (user_id),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('national_id','passport','driving_license') NOT NULL,
  document_number_masked VARCHAR(40) NOT NULL,
  document_number_encrypted TEXT NOT NULL,
  front_path VARCHAR(255) NOT NULL,
  back_path VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  user_message VARCHAR(500) NULL,
  review_note VARCHAR(1000) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_uv_status (status, created_at),
  KEY idx_uv_user (user_id, created_at),
  CONSTRAINT fk_uv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uv_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id VARCHAR(64) NULL,
  details JSON NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_audit_actor (actor_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_action (action, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(15) NOT NULL,
  name VARCHAR(80) NOT NULL,
  coingecko_id VARCHAR(80) NULL,
  binance_symbol VARCHAR(30) NULL,
  price_decimals TINYINT UNSIGNED NOT NULL DEFAULT 2,
  quantity_decimals TINYINT UNSIGNED NOT NULL DEFAULT 8,
  logo_path VARCHAR(255) NULL,
  color CHAR(7) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_assets_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_price_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  asset_id INT UNSIGNED NOT NULL,
  price_usd DECIMAL(36,18) NOT NULL,
  change_24h_pct DECIMAL(12,4) NULL,
  source VARCHAR(30) NOT NULL,
  source_updated_at DATETIME NULL,
  fetched_at DATETIME NOT NULL,
  KEY idx_mps_asset_time (asset_id, fetched_at),
  CONSTRAINT fk_mps_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_latest_prices (
  asset_id INT UNSIGNED NOT NULL PRIMARY KEY,
  price_usd DECIMAL(36,18) NOT NULL,
  change_24h_pct DECIMAL(12,4) NULL,
  source VARCHAR(30) NOT NULL,
  fetched_at DATETIME NOT NULL,
  CONSTRAINT fk_alp_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Header of every financial event. Lines live in ledger_entries and must sum to zero.
CREATE TABLE IF NOT EXISTS financial_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  type VARCHAR(40) NOT NULL,
  status ENUM('completed','reversed','reversal') NOT NULL DEFAULT 'completed',
  asset_id INT UNSIGNED NULL,
  quantity DECIMAL(36,18) NULL,
  unit_price DECIMAL(36,18) NULL,
  amount_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  fee_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  realized_pnl_usd DECIMAL(24,8) NULL,
  effective_at DATETIME NOT NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(1000) NULL,
  idempotency_key VARCHAR(80) NULL,
  related_type VARCHAR(40) NULL,
  related_id BIGINT UNSIGNED NULL,
  reversal_of_id BIGINT UNSIGNED NULL,
  reversed_by_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_ft_uuid (uuid),
  UNIQUE KEY uq_ft_idem (idempotency_key),
  KEY idx_ft_user_time (user_id, effective_at),
  KEY idx_ft_type_time (type, effective_at),
  KEY idx_ft_related (related_type, related_id),
  KEY idx_ft_asset (asset_id),
  CONSTRAINT fk_ft_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ft_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ft_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  account VARCHAR(32) NOT NULL,
  asset_id INT UNSIGNED NULL,
  quantity DECIMAL(36,18) NULL,
  amount_usd DECIMAL(24,8) NOT NULL,
  effective_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_le_user_acct (user_id, account, effective_at),
  KEY idx_le_tx (transaction_id),
  KEY idx_le_acct_time (account, effective_at),
  CONSTRAINT fk_le_tx FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_le_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acquisition lots. Never updated when market prices move.
CREATE TABLE IF NOT EXISTS investment_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  asset_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(36,18) NOT NULL,
  unit_price DECIMAL(36,18) NOT NULL,
  fee_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  cost_basis_usd DECIMAL(24,8) NOT NULL,
  acquired_at DATETIME NOT NULL,
  funding ENUM('cash','external','loan') NOT NULL DEFAULT 'external',
  loan_id BIGINT UNSIGNED NULL,
  status ENUM('open','reversed','archived') NOT NULL DEFAULT 'open',
  transaction_id BIGINT UNSIGNED NOT NULL,
  notes VARCHAR(1000) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_ie_user_asset (user_id, asset_id, status),
  CONSTRAINT fk_ie_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ie_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ie_tx FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Current holding per user/asset (average-cost method). Derived; verified by reconciliation.
CREATE TABLE IF NOT EXISTS investment_positions (
  user_id BIGINT UNSIGNED NOT NULL,
  asset_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(36,18) NOT NULL DEFAULT 0,
  cost_basis_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  realized_pnl_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, asset_id),
  CONSTRAINT fk_ip_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ip_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investment_sales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  asset_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(36,18) NOT NULL,
  unit_price DECIMAL(36,18) NOT NULL,
  fee_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  proceeds_usd DECIMAL(24,8) NOT NULL,
  cost_basis_removed_usd DECIMAL(24,8) NOT NULL,
  realized_pnl_usd DECIMAL(24,8) NOT NULL,
  sold_at DATETIME NOT NULL,
  status ENUM('completed','reversed') NOT NULL DEFAULT 'completed',
  transaction_id BIGINT UNSIGNED NOT NULL,
  notes VARCHAR(1000) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  KEY idx_is_user_asset (user_id, asset_id),
  CONSTRAINT fk_is_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_is_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_is_tx FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trades (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  asset_id INT UNSIGNED NOT NULL,
  direction ENUM('long','short') NOT NULL DEFAULT 'long',
  trade_type ENUM('spot','futures','margin','other') NOT NULL DEFAULT 'spot',
  quantity DECIMAL(36,18) NOT NULL,
  entry_price DECIMAL(36,18) NOT NULL,
  exit_price DECIMAL(36,18) NULL,
  fee_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  opened_at DATETIME NOT NULL,
  closed_at DATETIME NULL,
  status ENUM('open','closed','reversed') NOT NULL DEFAULT 'open',
  gross_pnl_usd DECIMAL(24,8) NULL,
  realized_pnl_usd DECIMAL(24,8) NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(1000) NULL,
  close_transaction_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_trades_uuid (uuid),
  UNIQUE KEY uq_trades_ref (user_id, reference),
  KEY idx_trades_user_time (user_id, opened_at),
  KEY idx_trades_status (status, closed_at),
  CONSTRAINT fk_trades_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_trades_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  denomination ENUM('USD','COIN') NOT NULL,
  asset_id INT UNSIGNED NULL,
  principal_quantity DECIMAL(36,18) NULL,
  origination_price DECIMAL(36,18) NULL,
  principal_usd DECIMAL(24,8) NOT NULL,
  outstanding_quantity DECIMAL(36,18) NULL,
  outstanding_usd DECIMAL(24,8) NULL,
  book_value_usd DECIMAL(24,8) NOT NULL,
  interest_rate_pct DECIMAL(9,4) NULL,
  credited_to ENUM('cash','holdings','external') NOT NULL DEFAULT 'external',
  loan_date DATETIME NOT NULL,
  due_date DATE NULL,
  status ENUM('active','repaid','reversed') NOT NULL DEFAULT 'active',
  reference VARCHAR(100) NULL,
  notes VARCHAR(1000) NULL,
  transaction_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_loans_user (user_id, status),
  CONSTRAINT fk_loans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_tx FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_repayments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('repayment','charge') NOT NULL DEFAULT 'repayment',
  charge_type ENUM('fee','interest') NULL,
  quantity DECIMAL(36,18) NULL,
  amount_usd DECIMAL(24,8) NOT NULL,
  price_used DECIMAL(36,18) NULL,
  book_reduction_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  realized_pnl_usd DECIMAL(24,8) NOT NULL DEFAULT 0,
  paid_from ENUM('cash','external') NOT NULL DEFAULT 'external',
  paid_at DATETIME NOT NULL,
  status ENUM('completed','reversed') NOT NULL DEFAULT 'completed',
  transaction_id BIGINT UNSIGNED NOT NULL,
  notes VARCHAR(1000) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  KEY idx_lr_loan (loan_id, paid_at),
  CONSTRAINT fk_lr_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lr_tx FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_methods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(80) NOT NULL,
  type ENUM('wallet','mobile_banking','bank') NOT NULL,
  logo_path VARCHAR(255) NULL,
  fields JSON NOT NULL,
  instructions VARCHAR(500) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_pm_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_payment_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  payment_method_id INT UNSIGNED NOT NULL,
  details_encrypted TEXT NOT NULL,
  details_masked JSON NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_upd_user_method (user_id, payment_method_id),
  CONSTRAINT fk_upd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_upd_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salary_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(24,8) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  period ENUM('monthly') NOT NULL DEFAULT 'monthly',
  pay_day TINYINT UNSIGNED NOT NULL DEFAULT 1,
  payment_method_id INT UNSIGNED NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_ss_user (user_id),
  CONSTRAINT fk_ss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salary_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  schedule_id BIGINT UNSIGNED NULL,
  period CHAR(7) NOT NULL,
  expected_amount DECIMAL(24,8) NOT NULL,
  actual_amount DECIMAL(24,8) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  usd_rate DECIMAL(36,18) NULL COMMENT 'USD per 1 unit of currency used for the ledger posting',
  status ENUM('pending','processed','paid','rejected') NOT NULL DEFAULT 'pending',
  due_date DATE NOT NULL,
  payment_date DATE NULL,
  payment_method_id INT UNSIGNED NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(500) NULL,
  transaction_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_sr_user_period (user_id, period),
  KEY idx_sr_status (status, due_date),
  CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_pm FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profit_allocation_rules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category ENUM('retained','salary','reinvestment','fees') NOT NULL,
  label VARCHAR(80) NOT NULL,
  percent DECIMAL(7,4) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_par_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profit_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope_key VARCHAR(40) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  realized_profit_usd DECIMAL(24,8) NOT NULL,
  eligible_usd DECIMAL(24,8) NOT NULL,
  allocated_usd DECIMAL(24,8) NOT NULL,
  status ENUM('completed','reversed') NOT NULL DEFAULT 'completed',
  transaction_id BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  KEY idx_pa_scope (scope_key, period_start, period_end),
  CONSTRAINT fk_pa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profit_allocation_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  allocation_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(20) NOT NULL,
  label VARCHAR(80) NOT NULL,
  percent DECIMAL(7,4) NOT NULL,
  amount_usd DECIMAL(24,8) NOT NULL,
  CONSTRAINT fk_pal_alloc FOREIGN KEY (allocation_id) REFERENCES profit_allocations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  email_pnl TINYINT(1) NOT NULL DEFAULT 1,
  email_trades TINYINT(1) NOT NULL DEFAULT 1,
  email_salary TINYINT(1) NOT NULL DEFAULT 1,
  email_loans TINYINT(1) NOT NULL DEFAULT 1,
  email_portfolio_threshold TINYINT(1) NOT NULL DEFAULT 0,
  email_reminders TINYINT(1) NOT NULL DEFAULT 1,
  push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  push_trades TINYINT(1) NOT NULL DEFAULT 1,
  push_salary TINYINT(1) NOT NULL DEFAULT 1,
  push_security TINYINT(1) NOT NULL DEFAULT 1,
  threshold_pct DECIMAL(6,2) NOT NULL DEFAULT 5.00,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  data JSON NULL,
  event_key VARCHAR(120) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_notif_event (user_id, event_key),
  KEY idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  to_email VARCHAR(190) NOT NULL,
  to_name VARCHAR(120) NULL,
  subject VARCHAR(200) NOT NULL,
  body_html MEDIUMTEXT NOT NULL,
  body_text MEDIUMTEXT NOT NULL,
  template VARCHAR(50) NOT NULL,
  event_key VARCHAR(150) NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 5,
  status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
  next_attempt_at DATETIME NOT NULL,
  locked_until DATETIME NULL,
  last_error VARCHAR(500) NULL,
  smtp_message_id VARCHAR(190) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_eq_uuid (uuid),
  UNIQUE KEY uq_eq_event (event_key),
  KEY idx_eq_status (status, next_attempt_at),
  KEY idx_eq_user (user_id, created_at),
  CONSTRAINT fk_eq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email_queue_id BIGINT UNSIGNED NULL,
  to_email VARCHAR(190) NOT NULL,
  status ENUM('attempted','accepted','failed_temporary','failed_permanent','skipped') NOT NULL,
  detail VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_el_queue (email_queue_id),
  KEY idx_el_time (created_at),
  CONSTRAINT fk_el_queue FOREIGN KEY (email_queue_id) REFERENCES email_queue(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  token_encrypted TEXT NOT NULL,
  platform ENUM('android','ios','web') NOT NULL DEFAULT 'android',
  device_name VARCHAR(100) NULL,
  last_seen_at DATETIME NOT NULL,
  invalidated_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_pt_token (token_hash),
  KEY idx_pt_user (user_id, invalidated_at),
  CONSTRAINT fk_pt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  push_token_id BIGINT UNSIGNED NULL,
  event_key VARCHAR(150) NULL,
  title VARCHAR(150) NOT NULL,
  status ENUM('sent','failed','skipped','invalid_token') NOT NULL,
  detail VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_pl_event_token (event_key, push_token_id),
  KEY idx_pl_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  subject VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'en',
  source ENUM('website','app') NOT NULL DEFAULT 'website',
  status ENUM('new','open','resolved','spam') NOT NULL DEFAULT 'new',
  ip_hash CHAR(64) NULL,
  admin_note VARCHAR(1000) NULL,
  handled_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_support_status (status, created_at),
  CONSTRAINT fk_support_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  value MEDIUMTEXT NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS landing_page_content (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  locale VARCHAR(5) NOT NULL,
  content_key VARCHAR(80) NOT NULL,
  value TEXT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_lpc (locale, content_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS translations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  locale VARCHAR(5) NOT NULL,
  group_name VARCHAR(40) NOT NULL,
  item_key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_tr (locale, group_name, item_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduled_task_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task VARCHAR(50) NOT NULL,
  status ENUM('running','success','failed','skipped') NOT NULL,
  items INT UNSIGNED NOT NULL DEFAULT 0,
  message VARCHAR(1000) NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  KEY idx_stl_task (task, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  bucket VARCHAR(40) NOT NULL,
  window_start INT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_rl_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cache_items (
  cache_key VARCHAR(190) NOT NULL PRIMARY KEY,
  value MEDIUMTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_cache_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  user_id BIGINT UNSIGNED NOT NULL,
  snapshot_date DATE NOT NULL,
  gross_assets_usd DECIMAL(24,8) NOT NULL,
  liabilities_usd DECIMAL(24,8) NOT NULL,
  net_value_usd DECIMAL(24,8) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, snapshot_date),
  CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
