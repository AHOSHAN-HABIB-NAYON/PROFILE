-- =========================================================
--  CakriCircular — বেতনের ঘর যোগ (Google JobPosting baseSalary)
--  phpMyAdmin → আপনার ডেটাবেজ → SQL → পেস্ট করে Go
--  (না চালালেও সমস্যা নেই — সাইট প্রথমবার চলার সময় নিজেই বানিয়ে নেবে)
-- =========================================================

ALTER TABLE posts ADD COLUMN salary VARCHAR(100) NULL DEFAULT NULL;
