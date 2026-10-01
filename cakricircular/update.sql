-- =========================================================
--  CakriCircular — আপডেট SQL (পুরনো ডেটাবেজেই সরাসরি চালান)
--  phpMyAdmin → আপনার ডেটাবেজ → SQL ট্যাব → পেস্ট করে Go
--  একাধিকবার চালালেও কোনো সমস্যা নেই (কিছু নষ্ট হবে না)
-- =========================================================

-- ১) পুরনো/ভাঙা লিংক নতুন লিংকে পাঠানোর টেবিল
CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug VARCHAR(190) NOT NULL PRIMARY KEY,
  post_id  INT NOT NULL,
  created_at DATETIME NULL,
  INDEX idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ২) নতুন সেটিংস (এডমিন প্যানেল থেকে বদলানো যাবে)
INSERT IGNORE INTO settings (k, v) VALUES
  ('tagline',           'সঠিক তথ্য, আপনার সফলতা'),
  ('app_name',          'Cakricircular'),
  ('footer_slogan',     'ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ'),
  ('notice_limit',      '50'),
  ('maintenance_title', 'সার্ভার আপডেট চলছে'),
  ('cache_ver',         '2');

-- ৩) নোটিশ সর্বশেষ ৫০টির বেশি থাকলে পুরনোগুলো এখনই মুছে ফেলি
DELETE FROM notices
WHERE id NOT IN (
  SELECT id FROM (SELECT id FROM notices ORDER BY created_at DESC, id DESC LIMIT 50) AS keep_list
);

-- ৪) ক্যাশ ভার্সন বাড়িয়ে দিই (সবার ব্রাউজারে নতুন ডিজাইন সাথে সাথে যাবে)
UPDATE settings SET v = UNIX_TIMESTAMP() WHERE k = 'cache_ver';
