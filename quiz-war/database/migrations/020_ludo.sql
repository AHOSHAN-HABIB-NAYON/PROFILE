-- Online Ludo: per-player totals and one row per finished game (weekly / monthly boards).
ALTER TABLE user_profiles ADD COLUMN ludo_games INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN ludo_wins INT UNSIGNED NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS ludo_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  mode VARCHAR(10) NOT NULL,
  place TINYINT UNSIGNED NOT NULL,
  won TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ludo_user (user_id),
  KEY ix_ludo_time (created_at, won)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
