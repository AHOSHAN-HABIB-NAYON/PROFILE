-- =========================================================
--  CakriCircular — রিসাইকেল বিন (ডিলিট করা পোস্ট ফেরানোর সুবিধা)
--  phpMyAdmin → আপনার ডেটাবেজ → SQL → পেস্ট করে Go
-- =========================================================

ALTER TABLE posts ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE posts ADD INDEX idx_deleted (deleted_at);
