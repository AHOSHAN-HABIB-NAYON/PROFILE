<?php
/* ডেটাবেজ স্কিমা — সব টেবিল utf8mb4 (বাংলা ১০০% সাপোর্টেড) */
return [

"CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  icon VARCHAR(60) DEFAULT 'fa-folder',
  meta_title VARCHAR(190) DEFAULT NULL,
  meta_desc VARCHAR(300) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cat_id INT DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(190) NOT NULL UNIQUE,
  content LONGTEXT NULL,
  thumb VARCHAR(120) DEFAULT NULL,
  pdf VARCHAR(120) DEFAULT NULL,
  division VARCHAR(60) DEFAULT NULL,
  district VARCHAR(60) DEFAULT NULL,
  vacancy VARCHAR(30) DEFAULT NULL,
  company VARCHAR(160) DEFAULT NULL,
  employment_type VARCHAR(30) DEFAULT 'FULL_TIME',
  deadline DATE DEFAULT NULL,
  is_job TINYINT(1) DEFAULT 0,
  keywords VARCHAR(300) DEFAULT NULL,
  meta_title VARCHAR(190) DEFAULT NULL,
  meta_desc VARCHAR(300) DEFAULT NULL,
  views INT DEFAULT 0,
  status TINYINT(1) DEFAULT 1,
  published_at DATETIME NOT NULL,
  updated_at DATETIME DEFAULT NULL,
  created_by INT DEFAULT NULL,
  salary VARCHAR(100) NULL DEFAULT NULL,
  is_premium TINYINT(1) NOT NULL DEFAULT 0,
  premium_until DATE NULL DEFAULT NULL,
  INDEX idx_premium (is_premium, premium_until),
  deleted_at DATETIME NULL DEFAULT NULL,
  INDEX idx_deleted (deleted_at),
  INDEX idx_list (status, published_at),
  INDEX idx_cat (cat_id, status, published_at),
  INDEX idx_deadline (deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug VARCHAR(190) NOT NULL PRIMARY KEY,
  post_id INT NOT NULL,
  created_at DATETIME NULL,
  INDEX idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS post_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  image VARCHAR(120) NOT NULL,
  sort_order INT DEFAULT 0,
  INDEX idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS post_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  label VARCHAR(120) DEFAULT NULL,
  url VARCHAR(500) NOT NULL,
  is_apply TINYINT(1) DEFAULT 0,
  sort_order INT DEFAULT 0,
  INDEX idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) DEFAULT NULL,
  image VARCHAR(120) NOT NULL,
  link VARCHAR(500) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  link VARCHAR(500) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME NOT NULL,
  INDEX idx_active (is_active, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL,
  title VARCHAR(190) NOT NULL,
  details TEXT NOT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  status TINYINT(1) DEFAULT 0,
  created_at DATETIME NOT NULL,
  INDEX idx_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  pass VARCHAR(255) NOT NULL,
  name VARCHAR(120) DEFAULT NULL,
  role ENUM('super','admin','moderator') DEFAULT 'moderator',
  perms TEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  last_login DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS visitors (
  vid CHAR(32) NOT NULL PRIMARY KEY,
  country VARCHAR(80) DEFAULT NULL,
  region VARCHAR(80) DEFAULT NULL,
  device VARCHAR(20) DEFAULT NULL,
  first_seen DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  hits INT DEFAULT 1,
  INDEX idx_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS visits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vid CHAR(32) NOT NULL,
  path VARCHAR(190) NOT NULL,
  day DATE NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_day (day),
  INDEX idx_path (path(120))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS post_views (
  post_id INT NOT NULL,
  vid CHAR(32) NOT NULL,
  day DATE NOT NULL,
  PRIMARY KEY (post_id, vid, day),
  INDEX idx_day (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS searches (
  term VARCHAR(100) NOT NULL PRIMARY KEY,
  hits INT DEFAULT 1,
  last_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS geo_cache (
  ip VARCHAR(45) NOT NULL PRIMARY KEY,
  country VARCHAR(80) DEFAULT NULL,
  region VARCHAR(80) DEFAULT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

"CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  username VARCHAR(60) DEFAULT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

];
