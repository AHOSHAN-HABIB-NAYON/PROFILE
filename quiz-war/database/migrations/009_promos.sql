-- Promotions: admin-made cards (logo, text, link) that pop up at good moments in the app.
CREATE TABLE IF NOT EXISTS promos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  body VARCHAR(300) NOT NULL DEFAULT '',
  cta_label VARCHAR(30) NOT NULL DEFAULT '',
  link_url VARCHAR(500) NOT NULL,
  logo_url VARCHAR(500) NULL,
  color VARCHAR(16) NULL,
  placements VARCHAR(40) NOT NULL DEFAULT 'home,result',
  weight TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  impressions INT UNSIGNED NOT NULL DEFAULT 0,
  clicks INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_promos_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
