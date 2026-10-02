-- Per-user restrictions (admin) and notification preferences (user).
ALTER TABLE users
  ADD COLUMN block_numbers TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN block_otp TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN notify_inapp TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN notify_email TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN notify_push TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN notify_security TINYINT(1) NOT NULL DEFAULT 1;

-- Browser push subscriptions (one per device/browser).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  endpoint_hash CHAR(64)        NOT NULL,
  endpoint      TEXT            NOT NULL,
  p256dh        VARCHAR(255)    NOT NULL,
  auth          VARCHAR(255)    NOT NULL,
  user_agent    VARCHAR(255)    NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
