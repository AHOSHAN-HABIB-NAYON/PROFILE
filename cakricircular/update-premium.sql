-- =========================================================
--  CakriCircular — প্রিমিয়াম (বিজ্ঞাপন) পোস্ট
--  phpMyAdmin → আপনার ডেটাবেজ → SQL → পেস্ট করে Go
--  (না চালালেও সমস্যা নেই — সাইট প্রথমবার চলার সময় নিজেই বানিয়ে নেবে)
-- =========================================================

ALTER TABLE posts ADD COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN premium_until DATE NULL DEFAULT NULL;
ALTER TABLE posts ADD INDEX idx_premium (is_premium, premium_until);
