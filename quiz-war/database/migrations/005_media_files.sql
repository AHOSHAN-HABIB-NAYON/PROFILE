-- Uploaded media (avatars, squad logos, question images, music) are also kept in the database,
-- so they survive redeploys on hosts that replace the app folder (e.g. Hostinger zip uploads).
-- Files on disk are a cache; missing ones are restored from here on start.
CREATE TABLE IF NOT EXISTS media_files (
  media_key VARCHAR(255) NOT NULL,
  content_type VARCHAR(80) NOT NULL,
  size INT UNSIGNED NOT NULL,
  data LONGBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
