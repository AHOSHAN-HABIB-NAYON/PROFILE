-- Premium Direct-Order Shop schema (MySQL 5.7+/MariaDB 10.3+, utf8mb4)
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  twofa_secret VARCHAR(64) NULL,
  last_login_at DATETIME NULL,
  last_login_ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(80) NOT NULL PRIMARY KEY,
  `value` MEDIUMTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_settings (
  page_key VARCHAR(40) NOT NULL PRIMARY KEY,
  title VARCHAR(190) NULL,
  description VARCHAR(400) NULL,
  keywords VARCHAR(400) NULL,
  og_image VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  icon_type ENUM('fa','image') NOT NULL DEFAULT 'fa',
  icon VARCHAR(60) NULL,
  image VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cat_active (is_active, deleted_at, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NULL,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(210) NOT NULL UNIQUE,
  sku VARCHAR(60) NULL,
  short_description VARCHAR(500) NULL,
  description MEDIUMTEXT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_price DECIMAL(10,2) NULL,
  stock INT NOT NULL DEFAULT 0,
  sold INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NULL,
  free_delivery TINYINT(1) NOT NULL DEFAULT 0,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_flash TINYINT(1) NOT NULL DEFAULT 0,
  flash_price DECIMAL(10,2) NULL,
  flash_start DATETIME NULL,
  flash_end DATETIME NULL,
  is_combo_eligible TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  seo_title VARCHAR(190) NULL,
  seo_description VARCHAR(400) NULL,
  seo_keywords VARCHAR(400) NULL,
  og_image VARCHAR(255) NULL,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_prod_list (is_active, deleted_at, created_at),
  KEY idx_prod_cat (category_id, is_active, deleted_at),
  KEY idx_prod_feat (is_featured),
  KEY idx_prod_flash (is_flash, flash_start, flash_end),
  KEY idx_prod_sku (sku),
  FULLTEXT KEY ft_prod (name, short_description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  path VARCHAR(255) NOT NULL COMMENT 'base path without extension',
  width INT NOT NULL DEFAULT 0,
  height INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pimg (product_id, sort_order),
  CONSTRAINT fk_pimg FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_sizes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  size VARCHAR(40) NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_psize (product_id, sort_order),
  CONSTRAINT fk_psize FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_related (
  product_id INT UNSIGNED NOT NULL,
  related_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, related_id),
  CONSTRAINT fk_prel_a FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_prel_b FOREIGN KEY (related_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS combos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(210) NOT NULL UNIQUE,
  image VARCHAR(255) NULL,
  description VARCHAR(500) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  original_price DECIMAL(10,2) NULL,
  stock INT NOT NULL DEFAULT 0,
  free_delivery TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_combo (is_active, deleted_at, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS combo_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  combo_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  KEY idx_ci (combo_id),
  CONSTRAINT fk_ci_combo FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banners (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NULL,
  subtitle VARCHAR(255) NULL,
  image VARCHAR(255) NOT NULL,
  width INT NOT NULL DEFAULT 1200,
  height INT NOT NULL DEFAULT 500,
  link VARCHAR(255) NULL,
  cta_text VARCHAR(60) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_banner (is_active, deleted_at, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  value DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(10,2) NULL,
  starts_at DATETIME NULL,
  expires_at DATETIME NULL,
  usage_limit INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  is_highlighted TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_usage (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  phone VARCHAR(20) NOT NULL,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cu (coupon_id),
  KEY idx_cu_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carts (
  token CHAR(40) NOT NULL PRIMARY KEY,
  items MEDIUMTEXT NOT NULL,
  coupon_code VARCHAR(40) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cart_upd (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(30) NOT NULL UNIQUE,
  idempotency_key CHAR(40) NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  district VARCHAR(80) NOT NULL,
  address VARCHAR(500) NOT NULL,
  note VARCHAR(500) NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  coupon_code VARCHAR(40) NULL,
  delivery_zone ENUM('inside','outside','free') NOT NULL DEFAULT 'outside',
  payment_method VARCHAR(20) NOT NULL DEFAULT 'COD',
  status ENUM('pending','confirmed','processing','courier_sent','delivered','cancelled','returned','failed') NOT NULL DEFAULT 'pending',
  stock_deducted TINYINT(1) NOT NULL DEFAULT 1,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  device VARCHAR(30) NULL,
  browser VARCHAR(40) NULL,
  os VARCHAR(40) NULL,
  geo MEDIUMTEXT NULL,
  risk_level VARCHAR(20) NULL,
  admin_note VARCHAR(500) NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ord_status (status, deleted_at, created_at),
  KEY idx_ord_phone (phone),
  KEY idx_ord_ip (ip, created_at),
  KEY idx_ord_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  item_type ENUM('product','combo') NOT NULL DEFAULT 'product',
  product_id INT UNSIGNED NULL,
  combo_id INT UNSIGNED NULL,
  name VARCHAR(190) NOT NULL,
  image VARCHAR(255) NULL,
  size VARCHAR(40) NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  KEY idx_oi_order (order_id),
  KEY idx_oi_prod (product_id),
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  note VARCHAR(500) NULL,
  admin_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_osh (order_id),
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courier_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  api_key TEXT NULL,
  secret_key TEXT NULL,
  base_url VARCHAR(255) NULL,
  extra TEXT NULL COMMENT 'JSON for driver-specific settings',
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  last_test_status VARCHAR(20) NULL,
  last_test_message VARCHAR(255) NULL,
  last_test_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courier_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  courier_code VARCHAR(30) NOT NULL,
  consignment_id VARCHAR(80) NULL,
  tracking_code VARCHAR(80) NULL,
  reference VARCHAR(120) NULL,
  status VARCHAR(60) NULL,
  cod_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  response MEDIUMTEXT NULL,
  last_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_co_order (order_id),
  CONSTRAINT fk_co_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courier_checks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'bdcourier',
  total INT NOT NULL DEFAULT 0,
  delivered INT NOT NULL DEFAULT 0,
  cancelled INT NOT NULL DEFAULT 0,
  returned INT NOT NULL DEFAULT 0,
  success_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  couriers MEDIUMTEXT NULL COMMENT 'JSON courier-wise breakdown',
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cc_phone (phone, checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fraud_checks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NULL,
  phone VARCHAR(20) NOT NULL,
  courier_check_id INT UNSIGNED NULL,
  local_total INT NOT NULL DEFAULT 0,
  local_delivered INT NOT NULL DEFAULT 0,
  local_cancelled INT NOT NULL DEFAULT 0,
  local_returned INT NOT NULL DEFAULT 0,
  risk_level ENUM('new','normal','review','high') NOT NULL DEFAULT 'new',
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fc_phone (phone),
  KEY idx_fc_order (order_id),
  KEY idx_fc_risk (risk_level, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocked_ips (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL UNIQUE,
  reason VARCHAR(255) NULL,
  attempts INT NOT NULL DEFAULT 0,
  block_type ENUM('temporary','lifetime') NOT NULL DEFAULT 'temporary',
  blocked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bip_until (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  rl_key VARCHAR(120) NOT NULL PRIMARY KEY,
  hits INT NOT NULL DEFAULT 0,
  window_start INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visitors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visitor_key CHAR(32) NOT NULL UNIQUE,
  ip VARCHAR(45) NULL,
  device VARCHAR(30) NULL,
  browser VARCHAR(40) NULL,
  os VARCHAR(40) NULL,
  country VARCHAR(60) NULL,
  source VARCHAR(120) NULL,
  landing VARCHAR(255) NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vis_first (first_seen),
  KEY idx_vis_last (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visitor_id INT UNSIGNED NULL,
  event VARCHAR(30) NOT NULL,
  product_id INT UNSIGNED NULL,
  url VARCHAR(255) NULL,
  value DECIMAL(10,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ae_event (event, created_at),
  KEY idx_ae_prod (product_id, event),
  KEY idx_ae_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(190) NOT NULL,
  message VARCHAR(500) NULL,
  link VARCHAR(255) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif (is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trash (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(20) NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  admin_id INT UNSIGNED NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trash (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
