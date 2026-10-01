-- =========================================================
--  CakriCircular — অটোমেশন v61 (সোর্স পোস্ট ID ধরে ট্র্যাকিং)
--  না চালালেও চলবে — এডমিনের অটোমেশন পাতা বা ক্রন প্রথমবার চললে নিজেই বানিয়ে নেয়।
--  শুধু নতুন টেবিল/কলাম যোগ করে; পুরনো কোনো টেবিল বা ডেটা মোছে না। বারবার চালালেও ক্ষতি নেই।
-- =========================================================

CREATE TABLE IF NOT EXISTS source_posts (
  source_id INT UNSIGNED NOT NULL PRIMARY KEY,
  slug VARCHAR(200) NULL DEFAULT NULL,
  source_link VARCHAR(500) NULL DEFAULT NULL,
  title_raw VARCHAR(500) NULL DEFAULT NULL,
  title_norm VARCHAR(500) NULL DEFAULT NULL,
  content_hash CHAR(32) NULL DEFAULT NULL,
  new_hash CHAR(32) NULL DEFAULT NULL,
  source_date DATETIME NULL DEFAULT NULL,
  source_modified DATETIME NULL DEFAULT NULL,
  status ENUM('baseline','new','processing','done','failed','update_pending','needs_review','skipped_duplicate') NOT NULL DEFAULT 'baseline',
  prev_status VARCHAR(20) NULL DEFAULT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  my_post_id INT NULL DEFAULT NULL,
  match_post_id INT NULL DEFAULT NULL,
  tries TINYINT NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_status (status, updated_at),
  INDEX idx_slug (slug(190)),
  INDEX idx_mypost (my_post_id),
  INDEX idx_date (source_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_decisions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id INT UNSIGNED NOT NULL,
  decision VARCHAR(30) NOT NULL,
  reason VARCHAR(500) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_src (source_id),
  INDEX idx_dec_time (decision, created_at),
  INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- আবেদন শুরুর তারিখ (ডুপ্লিকেট মেলানোর জন্য)। "Duplicate column" এরর এলে বুঝবেন আগেই আছে — সমস্যা নেই।
ALTER TABLE posts ADD COLUMN application_start DATE NULL DEFAULT NULL;
