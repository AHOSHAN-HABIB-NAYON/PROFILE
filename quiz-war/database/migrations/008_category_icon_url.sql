-- Optional custom category icon (uploaded SVG/PNG/JPG, stored as a rendered WebP).
ALTER TABLE categories ADD COLUMN icon_url VARCHAR(500) NULL AFTER icon;
