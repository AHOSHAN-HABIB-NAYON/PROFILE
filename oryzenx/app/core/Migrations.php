<?php
/** Upgrades existing installs in place. Each step is idempotent; the applied version is stored in settings. */
final class Migrations
{
    public const LATEST = 4;

    public static function run(): void
    {
        $current = (int)Settings::get('db_version', '1');
        if ($current >= self::LATEST) return;
        if ($current < 2) {
            DB::pdo()->exec("CREATE TABLE IF NOT EXISTS post_likes (
                post_id INT UNSIGNED NOT NULL, liker_hash CHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (post_id, liker_hash),
                CONSTRAINT fk_plikes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            if (!DB::val("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'likes'")) {
                DB::pdo()->exec('ALTER TABLE posts ADD likes INT UNSIGNED NOT NULL DEFAULT 0 AFTER views');
            }
        }
        if ($current < 3) {
            DB::pdo()->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('deposit','withdraw','purchase','refund','adjust') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method_code VARCHAR(30) NULL,
  account VARCHAR(190) NULL,
  transaction_id VARCHAR(120) NULL,
  screenshot VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  note VARCHAR(500) NULL,
  admin_note VARCHAR(1000) NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wt_user (user_id, created_at),
  KEY idx_wt_status (status, type),
  CONSTRAINT fk_wt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }
        if ($current < 4) {
            DB::pdo()->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  title_bn VARCHAR(160) NULL,
  brand VARCHAR(120) NULL,
  link VARCHAR(255) NULL,
  category VARCHAR(80) NULL,
  description VARCHAR(600) NULL,
  description_bn VARCHAR(600) NULL,
  tags VARCHAR(300) NULL,
  image1 VARCHAR(255) NULL,
  image2 VARCHAR(255) NULL,
  image3 VARCHAR(255) NULL,
  image4 VARCHAR(255) NULL,
  image5 VARCHAR(255) NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_projects_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
            DB::pdo()->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS offer_claims (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  offer_key VARCHAR(40) NOT NULL,
  percent TINYINT UNSIGNED NOT NULL,
  ip VARCHAR(45) NOT NULL,
  payment_id INT UNSIGNED NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_offer_user (user_id, offer_key),
  KEY idx_offer_ip (ip, offer_key),
  CONSTRAINT fk_offer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
            if (!DB::val("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'discount'")) {
                DB::pdo()->exec('ALTER TABLE payments ADD discount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER amount');
            }
        }
        Settings::set(['db_version' => (string)self::LATEST]);
    }
}
