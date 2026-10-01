-- =========================================================
--  CakriCircular — অটো-পোস্ট অটোমেশন
--  phpMyAdmin → আপনার ডেটাবেজ → SQL → পেস্ট করে Go
--  (না চালালেও সমস্যা নেই — সাইট প্রথমবার চলার সময় নিজেই বানিয়ে নেবে)
-- =========================================================

ALTER TABLE posts ADD COLUMN is_auto TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN review_pending TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN source_url VARCHAR(500) NULL DEFAULT NULL;
ALTER TABLE posts ADD COLUMN source_lastmod VARCHAR(40) NULL DEFAULT NULL;
ALTER TABLE posts ADD COLUMN auto_note TEXT NULL;
ALTER TABLE posts ADD INDEX idx_review (review_pending);
ALTER TABLE posts ADD INDEX idx_source (source_url(190));

CREATE TABLE IF NOT EXISTS auto_seen (
  url_hash CHAR(40) PRIMARY KEY,
  url VARCHAR(500) NOT NULL,
  lastmod VARCHAR(40) DEFAULT NULL,
  post_id INT DEFAULT NULL,
  seen_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auto_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level VARCHAR(10) NOT NULL DEFAULT 'info',
  msg TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- বারবার ব্যর্থ হওয়া লিংকের গণনা (v51)
ALTER TABLE auto_seen ADD COLUMN fails TINYINT NOT NULL DEFAULT 0;
