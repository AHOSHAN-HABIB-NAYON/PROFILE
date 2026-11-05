-- Premium subscription (Google Play monthly), redeem codes and admin grants.
-- premium_at (older, admin badge) still means "premium for good"; premium_until is time-limited premium.
ALTER TABLE user_profiles ADD COLUMN premium_until DATETIME NULL DEFAULT NULL;
CREATE TABLE IF NOT EXISTS premium_purchases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  purchase_token TEXT NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  order_id VARCHAR(100) NULL,
  state VARCHAR(40) NOT NULL,
  expiry_at DATETIME NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_premium_token (token_hash),
  KEY ix_premium_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS redeem_codes (
  code VARCHAR(24) NOT NULL PRIMARY KEY,
  days INT UNSIGNED NOT NULL,
  max_uses INT UNSIGNED NOT NULL DEFAULT 1,
  uses INT UNSIGNED NOT NULL DEFAULT 0,
  note VARCHAR(120) NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS redeem_uses (
  code VARCHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code, user_id),
  KEY ix_redeem_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Which month's "top N get premium" reward was already given (so it is given once).
CREATE TABLE IF NOT EXISTS premium_month_rewards (
  month CHAR(7) NOT NULL PRIMARY KEY,
  user_ids TEXT NULL,
  given_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
