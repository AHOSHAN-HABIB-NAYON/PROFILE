-- Referrals ("invite a friend") and free trials. One trial / referral reward per phone.
ALTER TABLE user_profiles ADD COLUMN referred_by BIGINT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN referral_rewarded TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN device_hash CHAR(64) NULL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN premium_reminded_for DATETIME NULL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN premium_trial_until DATETIME NULL DEFAULT NULL;
ALTER TABLE user_profiles ADD KEY ix_profiles_referred_by (referred_by);
CREATE TABLE IF NOT EXISTS device_rewards (
  device_hash CHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_hash, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
