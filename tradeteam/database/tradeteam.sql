-- TradeTeam 1.0.0 database schema (generated from migrations — do not edit by hand)
-- Import into an EMPTY database, then open the site and complete the installer.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT UNSIGNED PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  checksum CHAR(64) NOT NULL,
  status ENUM('applied','skipped') NOT NULL DEFAULT 'applied',
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration 1: initial_schema
CREATE TABLE system_settings (
      `key` VARCHAR(100) PRIMARY KEY,
      value MEDIUMTEXT NOT NULL,
      is_secret TINYINT(1) NOT NULL DEFAULT 0,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(16) NOT NULL,
      email VARCHAR(254) NOT NULL,
      email_verified_at DATETIME(3) NULL,
      password_hash VARCHAR(255) NULL,
      name VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(500) NULL,
      phone VARCHAR(32) NULL,
      google_sub VARCHAR(64) NULL,
      status ENUM('active','suspended','locked','closed') NOT NULL DEFAULT 'active',
      failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME(3) NULL,
      password_changed_at DATETIME(3) NULL,
      last_login_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      deleted_at DATETIME(3) NULL,
      UNIQUE KEY uq_users_uid (uid),
      UNIQUE KEY uq_users_email (email),
      UNIQUE KEY uq_users_google (google_sub),
      KEY ix_users_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE user_profiles (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      language VARCHAR(10) NOT NULL DEFAULT 'en',
      theme ENUM('light','dark') NOT NULL DEFAULT 'light',
      notification_prefs JSON NULL,
      kyc_status ENUM('none','pending','verified','rejected') NOT NULL DEFAULT 'none',
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE admin_roles (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      description VARCHAR(255) NULL,
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_role_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE admin_permissions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) NOT NULL,
      description VARCHAR(255) NULL,
      UNIQUE KEY uq_perm_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE admin_role_permissions (
      role_id INT UNSIGNED NOT NULL,
      permission_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      CONSTRAINT fk_arp_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
      CONSTRAINT fk_arp_perm FOREIGN KEY (permission_id) REFERENCES admin_permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE admin_users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(254) NOT NULL,
      name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role_id INT UNSIGNED NOT NULL,
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME(3) NULL,
      last_login_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_admin_email (email),
      CONSTRAINT fk_admin_role FOREIGN KEY (role_id) REFERENCES admin_roles(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE user_devices (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      principal_type ENUM('user','admin') NOT NULL, principal_id BIGINT UNSIGNED NOT NULL,
      fingerprint CHAR(64) NOT NULL,
      browser VARCHAR(64) NULL,
      os VARCHAR(64) NULL,
      device_type VARCHAR(32) NULL,
      last_ip VARCHAR(45) NULL,
      trusted TINYINT(1) NOT NULL DEFAULT 0,
      first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_device (principal_type, principal_id, fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE user_sessions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      principal_type ENUM('user','admin') NOT NULL, principal_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      device_id BIGINT UNSIGNED NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      auth_method VARCHAR(20) NOT NULL,
      mfa_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      idle_expires_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      revoke_reason VARCHAR(64) NULL,
      UNIQUE KEY uq_session_token (token_hash),
      KEY ix_session_principal (principal_type, principal_id, revoked_at),
      CONSTRAINT fk_session_device FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE passkeys (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      principal_type ENUM('user','admin') NOT NULL, principal_id BIGINT UNSIGNED NOT NULL,
      credential_id VARCHAR(512) NOT NULL,
      public_key BLOB NOT NULL,
      counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
      transports VARCHAR(255) NULL,
      device_type VARCHAR(32) NULL,
      backed_up TINYINT(1) NOT NULL DEFAULT 0,
      aaguid VARCHAR(64) NULL,
      name VARCHAR(100) NOT NULL,
      device_info VARCHAR(255) NULL,
      last_used_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_passkey_cred (credential_id),
      KEY ix_passkey_principal (principal_type, principal_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE two_factor_auth (
      principal_type ENUM('user','admin') NOT NULL, principal_id BIGINT UNSIGNED NOT NULL,
      secret_enc VARCHAR(512) NOT NULL,
      enabled_at DATETIME(3) NULL,
      last_used_step BIGINT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (principal_type, principal_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE backup_codes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      principal_type ENUM('user','admin') NOT NULL, principal_id BIGINT UNSIGNED NOT NULL,
      code_hash CHAR(64) NOT NULL,
      used_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_backup_principal (principal_type, principal_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE login_attempts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      principal_type ENUM('user','admin') NOT NULL,
      principal_id BIGINT UNSIGNED NULL,
      email VARCHAR(254) NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      method VARCHAR(20) NOT NULL,
      success TINYINT(1) NOT NULL,
      reason VARCHAR(64) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_login_principal (principal_type, principal_id, created_at),
      KEY ix_login_ip (ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE security_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      principal_type ENUM('user','admin') NOT NULL, principal_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(50) NOT NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      meta JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_secev_principal (principal_type, principal_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE email_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      purpose ENUM('verify_email','reset_password','email_otp','withdrawal') NOT NULL,
      token_hash CHAR(64) NULL,
      code_hash CHAR(64) NULL,
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      expires_at DATETIME(3) NOT NULL,
      used_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_email_tokens_user (user_id, purpose, used_at),
      UNIQUE KEY uq_email_token_hash (token_hash),
      CONSTRAINT fk_email_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body VARCHAR(2000) NOT NULL,
      data JSON NULL,
      read_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_notif_user (user_id, read_at, id),
      CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE push_subscriptions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      endpoint VARCHAR(700) NOT NULL,
      endpoint_hash CHAR(64) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_push_endpoint (endpoint_hash),
      CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE assets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      name VARCHAR(100) NULL,
      logo_url VARCHAR(500) NULL,
      `precision` TINYINT UNSIGNED NOT NULL DEFAULT 8,
      market_cap DECIMAL(36,18) NULL,
      status ENUM('active','disabled','delisted') NOT NULL DEFAULT 'active',
      source ENUM('provider','manual') NOT NULL DEFAULT 'provider',
      deposit_enabled TINYINT(1) NOT NULL DEFAULT 1,
      withdraw_enabled TINYINT(1) NOT NULL DEFAULT 1,
      last_synced_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_asset_symbol (symbol),
      KEY ix_asset_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE networks (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      asset_id INT UNSIGNED NOT NULL,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(100) NOT NULL,
      chain_family ENUM('evm','bitcoin','tron','solana','other') NOT NULL DEFAULT 'other',
      deposit_mode ENUM('xpub','static') NOT NULL DEFAULT 'static',
      xpub_enc VARCHAR(1024) NULL,
      next_derivation_index INT UNSIGNED NOT NULL DEFAULT 0,
      static_address VARCHAR(128) NULL,
      contract_address VARCHAR(128) NULL,
      memo_required TINYINT(1) NOT NULL DEFAULT 0,
      address_regex VARCHAR(255) NULL,
      explorer_tx_url VARCHAR(255) NULL,
      confirmations INT UNSIGNED NOT NULL DEFAULT 12,
      min_deposit DECIMAL(36,18) NOT NULL DEFAULT 0,
      min_withdraw DECIMAL(36,18) NOT NULL DEFAULT 0,
      deposit_enabled TINYINT(1) NOT NULL DEFAULT 1,
      withdraw_enabled TINYINT(1) NOT NULL DEFAULT 1,
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_network (asset_id, code),
      CONSTRAINT fk_network_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE markets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      symbol VARCHAR(30) NOT NULL,
      base_asset_id INT UNSIGNED NOT NULL,
      quote_asset_id INT UNSIGNED NOT NULL,
      base VARCHAR(20) NOT NULL,
      quote VARCHAR(20) NOT NULL,
      type ENUM('spot','futures') NOT NULL DEFAULT 'spot',
      engine ENUM('internal','external') NOT NULL DEFAULT 'external',
      provider VARCHAR(32) NOT NULL,
      provider_symbol VARCHAR(40) NOT NULL,
      status ENUM('trading','halted','delisted') NOT NULL DEFAULT 'trading',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      tick_size DECIMAL(36,18) NOT NULL,
      step_size DECIMAL(36,18) NOT NULL,
      price_precision TINYINT UNSIGNED NOT NULL,
      qty_precision TINYINT UNSIGNED NOT NULL,
      min_qty DECIMAL(36,18) NOT NULL DEFAULT 0,
      max_qty DECIMAL(36,18) NULL,
      min_notional DECIMAL(36,18) NOT NULL DEFAULT 0,
      max_notional DECIMAL(36,18) NULL,
      sort_rank INT NOT NULL DEFAULT 0,
      sync_locked TINYINT(1) NOT NULL DEFAULT 0,
      last_synced_at DATETIME(3) NULL,
      delisted_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_market_symbol (symbol),
      KEY ix_market_quote (quote, status),
      KEY ix_market_status (status, enabled),
      KEY ix_market_base (base),
      CONSTRAINT fk_market_base FOREIGN KEY (base_asset_id) REFERENCES assets(id),
      CONSTRAINT fk_market_quote FOREIGN KEY (quote_asset_id) REFERENCES assets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE favorites (
      user_id BIGINT UNSIGNED NOT NULL,
      market_id INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, market_id),
      CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_fav_market FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE candles (
      market_id INT UNSIGNED NOT NULL,
      `interval` VARCHAR(4) NOT NULL,
      open_time BIGINT NOT NULL,
      open DECIMAL(36,18) NOT NULL,
      high DECIMAL(36,18) NOT NULL,
      low DECIMAL(36,18) NOT NULL,
      close DECIMAL(36,18) NOT NULL,
      volume DECIMAL(36,18) NOT NULL,
      PRIMARY KEY (market_id, `interval`, open_time),
      CONSTRAINT fk_candle_market FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE market_ticks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      market_id INT UNSIGNED NOT NULL,
      price DECIMAL(36,18) NOT NULL,
      qty DECIMAL(36,18) NOT NULL,
      side ENUM('buy','sell') NOT NULL,
      ts BIGINT NOT NULL,
      KEY ix_tick_market (market_id, ts),
      CONSTRAINT fk_tick_market FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE fees (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      scope ENUM('trading','withdrawal','deposit') NOT NULL,
      market_id INT UNSIGNED NULL,
      network_id INT UNSIGNED NULL,
      maker_rate DECIMAL(36,18) NULL,
      taker_rate DECIMAL(36,18) NULL,
      fixed_amount DECIMAL(36,18) NULL,
      percent_rate DECIMAL(36,18) NULL,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_fee_scope (scope, market_id, network_id),
      CONSTRAINT fk_fee_market FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
      CONSTRAINT fk_fee_network FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE wallets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type ENUM('spot') NOT NULL DEFAULT 'spot',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_wallet (user_id, type),
      CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE balances (
      wallet_id BIGINT UNSIGNED NOT NULL,
      asset_id INT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      available DECIMAL(36,18) NOT NULL DEFAULT 0,
      locked DECIMAL(36,18) NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (wallet_id, asset_id),
      KEY ix_balance_user (user_id),
      CONSTRAINT chk_available_nonneg CHECK (available >= 0),
      CONSTRAINT chk_locked_nonneg CHECK (locked >= 0),
      CONSTRAINT fk_balance_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
      CONSTRAINT fk_balance_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE ledger_entries (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      wallet_id BIGINT UNSIGNED NOT NULL,
      asset_id INT UNSIGNED NOT NULL,
      type VARCHAR(32) NOT NULL,
      available_delta DECIMAL(36,18) NOT NULL,
      locked_delta DECIMAL(36,18) NOT NULL,
      available_after DECIMAL(36,18) NOT NULL,
      locked_after DECIMAL(36,18) NOT NULL,
      ref_type VARCHAR(32) NOT NULL,
      ref_id VARCHAR(64) NOT NULL,
      memo VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_ledger_user (user_id, asset_id, id),
      KEY ix_ledger_ref (ref_type, ref_id),
      CONSTRAINT fk_ledger_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
      CONSTRAINT fk_ledger_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE wallet_addresses (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      network_id INT UNSIGNED NOT NULL,
      address VARCHAR(128) NOT NULL,
      memo VARCHAR(64) NULL,
      derivation_index INT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_user_network (user_id, network_id),
      UNIQUE KEY uq_address (network_id, address, memo),
      CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_addr_network FOREIGN KEY (network_id) REFERENCES networks(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE deposits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      asset_id INT UNSIGNED NOT NULL,
      network_id INT UNSIGNED NOT NULL,
      address VARCHAR(128) NOT NULL,
      memo VARCHAR(64) NULL,
      amount DECIMAL(36,18) NOT NULL,
      txid VARCHAR(128) NOT NULL,
      output_index INT UNSIGNED NOT NULL DEFAULT 0,
      confirmations INT UNSIGNED NOT NULL DEFAULT 0,
      required_confirmations INT UNSIGNED NOT NULL,
      status ENUM('pending','confirming','credited','failed','manual_review') NOT NULL DEFAULT 'pending',
      source ENUM('webhook','manual') NOT NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      note VARCHAR(255) NULL,
      credited_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_deposit_tx (network_id, txid, output_index),
      KEY ix_deposit_user (user_id, created_at),
      KEY ix_deposit_status (status, created_at),
      CONSTRAINT fk_dep_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_dep_asset FOREIGN KEY (asset_id) REFERENCES assets(id),
      CONSTRAINT fk_dep_network FOREIGN KEY (network_id) REFERENCES networks(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE withdrawals (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      asset_id INT UNSIGNED NOT NULL,
      network_id INT UNSIGNED NOT NULL,
      address VARCHAR(128) NOT NULL,
      memo VARCHAR(64) NULL,
      amount DECIMAL(36,18) NOT NULL,
      fee DECIMAL(36,18) NOT NULL,
      total DECIMAL(36,18) NOT NULL,
      status ENUM('pending','manual_review','approved','processing','completed','rejected','failed','cancelled') NOT NULL DEFAULT 'pending',
      verification_method VARCHAR(20) NOT NULL,
      txid VARCHAR(128) NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      reject_reason VARCHAR(255) NULL,
      ip VARCHAR(45) NULL,
      completed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY ix_wd_user (user_id, created_at),
      KEY ix_wd_status (status, created_at),
      CONSTRAINT fk_wd_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_wd_asset FOREIGN KEY (asset_id) REFERENCES assets(id),
      CONSTRAINT fk_wd_network FOREIGN KEY (network_id) REFERENCES networks(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE transactions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type ENUM('deposit','withdrawal','transfer_in','transfer_out','adjustment') NOT NULL,
      asset_id INT UNSIGNED NOT NULL,
      amount DECIMAL(36,18) NOT NULL,
      fee DECIMAL(36,18) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL,
      ref_type VARCHAR(32) NOT NULL,
      ref_id VARCHAR(64) NOT NULL,
      description VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_tx_ref (user_id, ref_type, ref_id),
      KEY ix_tx_user (user_id, created_at),
      CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_tx_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE orders (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      market_id INT UNSIGNED NOT NULL,
      client_order_id VARCHAR(64) NULL,
      side ENUM('buy','sell') NOT NULL,
      type ENUM('market','limit','stop_market','stop_limit','take_profit','stop_loss') NOT NULL,
      time_in_force ENUM('GTC','IOC','FOK') NOT NULL DEFAULT 'GTC',
      status ENUM('pending','open','partially_filled','filled','cancelled','rejected','expired') NOT NULL,
      price DECIMAL(36,18) NULL,
      stop_price DECIMAL(36,18) NULL,
      trigger_condition ENUM('gte','lte') NULL,
      quantity DECIMAL(36,18) NULL,
      quote_quantity DECIMAL(36,18) NULL,
      filled_qty DECIMAL(36,18) NOT NULL DEFAULT 0,
      filled_quote DECIMAL(36,18) NOT NULL DEFAULT 0,
      fee_total DECIMAL(36,18) NOT NULL DEFAULT 0,
      fee_asset VARCHAR(20) NULL,
      lock_asset_id INT UNSIGNED NOT NULL,
      locked_remaining DECIMAL(36,18) NOT NULL DEFAULT 0,
      engine ENUM('internal','external') NOT NULL,
      external_id VARCHAR(64) NULL,
      reject_reason VARCHAR(255) NULL,
      triggered_at DATETIME(3) NULL,
      expires_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_client_order (user_id, client_order_id),
      KEY ix_order_book (market_id, status, side, price),
      KEY ix_order_user (user_id, status, created_at),
      KEY ix_order_user_market (user_id, market_id, created_at),
      KEY ix_order_external (engine, status),
      CONSTRAINT chk_order_locked CHECK (locked_remaining >= 0),
      CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_order_market FOREIGN KEY (market_id) REFERENCES markets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE trades (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      market_id INT UNSIGNED NOT NULL,
      price DECIMAL(36,18) NOT NULL,
      qty DECIMAL(36,18) NOT NULL,
      quote_qty DECIMAL(36,18) NOT NULL,
      taker_side ENUM('buy','sell') NOT NULL,
      maker_order_id BIGINT UNSIGNED NULL,
      taker_order_id BIGINT UNSIGNED NOT NULL,
      maker_user_id BIGINT UNSIGNED NULL,
      taker_user_id BIGINT UNSIGNED NOT NULL,
      maker_fee DECIMAL(36,18) NOT NULL DEFAULT 0,
      taker_fee DECIMAL(36,18) NOT NULL DEFAULT 0,
      external_ref VARCHAR(64) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_trade_market (market_id, id),
      KEY ix_trade_created (created_at),
      UNIQUE KEY uq_trade_external (market_id, external_ref),
      CONSTRAINT fk_trade_market FOREIGN KEY (market_id) REFERENCES markets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE order_fills (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      trade_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      market_id INT UNSIGNED NOT NULL,
      side ENUM('buy','sell') NOT NULL,
      role ENUM('maker','taker') NOT NULL,
      price DECIMAL(36,18) NOT NULL,
      qty DECIMAL(36,18) NOT NULL,
      quote_qty DECIMAL(36,18) NOT NULL,
      fee DECIMAL(36,18) NOT NULL,
      fee_asset VARCHAR(20) NOT NULL,
      realized_pnl DECIMAL(36,18) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_fill_order (order_id),
      KEY ix_fill_user (user_id, created_at),
      CONSTRAINT fk_fill_order FOREIGN KEY (order_id) REFERENCES orders(id),
      CONSTRAINT fk_fill_trade FOREIGN KEY (trade_id) REFERENCES trades(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE order_book (
      market_id INT UNSIGNED NOT NULL,
      side ENUM('bid','ask') NOT NULL,
      price DECIMAL(36,18) NOT NULL,
      quantity DECIMAL(36,18) NOT NULL,
      order_count INT UNSIGNED NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (market_id, side, price),
      CONSTRAINT fk_ob_market FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE cost_basis (
      user_id BIGINT UNSIGNED NOT NULL,
      asset_id INT UNSIGNED NOT NULL,
      quantity DECIMAL(36,18) NOT NULL DEFAULT 0,
      cost DECIMAL(36,18) NOT NULL DEFAULT 0,
      realized_pnl DECIMAL(36,18) NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, asset_id),
      CONSTRAINT fk_cb_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_cb_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE portfolio_snapshots (
      user_id BIGINT UNSIGNED NOT NULL,
      ts DATETIME NOT NULL,
      value DECIMAL(36,18) NOT NULL,
      PRIMARY KEY (user_id, ts),
      CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      admin_user_id BIGINT UNSIGNED NULL,
      user_id BIGINT UNSIGNED NULL,
      action VARCHAR(64) NOT NULL,
      target_type VARCHAR(32) NULL,
      target_id VARCHAR(64) NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      before_data JSON NULL,
      after_data JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_audit_admin (admin_user_id, created_at),
      KEY ix_audit_action (action, created_at),
      KEY ix_audit_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO schema_migrations (version, name, checksum) VALUES (1, 'initial_schema', 'bd53d2eecb73e33ea2c84c521647db9ce4d871be621eb9c59db90085099d5a74');

-- Migration 2 (ledger_immutability) is optional and applied by the installer when privileges allow.

-- Migration 3: seed_rbac
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('dashboard.view', 'View admin dashboard');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('users.view', 'View users');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('users.manage', 'Suspend/activate users and reset security');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('balances.adjust', 'Manually adjust user balances');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('markets.view', 'View assets, networks and markets');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('markets.manage', 'Create/edit/disable assets, networks and markets');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('orders.view', 'View orders and trades');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('orders.manage', 'Cancel user orders');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('deposits.view', 'View deposits');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('deposits.manage', 'Credit or reject deposits');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('withdrawals.view', 'View withdrawals');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('withdrawals.manage', 'Approve/reject/complete withdrawals');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('fees.manage', 'Configure fees');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('notifications.send', 'Send announcements and notifications');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('audit.view', 'View audit and security logs');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('settings.manage', 'Change system settings');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('security.manage', 'Manage admin accounts, roles, IP restrictions');
INSERT IGNORE INTO admin_permissions (code, description) VALUES ('system.view', 'View system health and versions');
INSERT IGNORE INTO admin_roles (name, description, is_system) VALUES ('super_admin', 'super admin', 1);
INSERT IGNORE INTO admin_roles (name, description, is_system) VALUES ('admin', 'admin', 1);
INSERT IGNORE INTO admin_roles (name, description, is_system) VALUES ('support', 'support', 1);
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN ('dashboard.view','users.view','users.manage','balances.adjust','markets.view','markets.manage','orders.view','orders.manage','deposits.view','deposits.manage','withdrawals.view','withdrawals.manage','fees.manage','notifications.send','audit.view','settings.manage','security.manage','system.view')
         WHERE r.name = 'super_admin';
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN ('dashboard.view','users.view','users.manage','markets.view','markets.manage','orders.view','orders.manage','deposits.view','deposits.manage','withdrawals.view','withdrawals.manage','fees.manage','notifications.send','audit.view','system.view')
         WHERE r.name = 'admin';
INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN ('dashboard.view','users.view','orders.view','deposits.view','withdrawals.view','markets.view')
         WHERE r.name = 'support';
INSERT IGNORE INTO fees (scope, market_id, network_id, maker_rate, taker_rate) VALUES ('trading', NULL, NULL, 0.001, 0.001);
INSERT INTO schema_migrations (version, name, checksum) VALUES (3, 'seed_rbac', '502bac7779584ee542fef249c69804cd7374e52a111640cd38c88483ccd72796');

SET FOREIGN_KEY_CHECKS = 1;
