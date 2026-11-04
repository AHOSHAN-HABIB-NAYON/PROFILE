-- Home "Collections" (e.g. previous-year BCS questions) are categories with a flag, so the
-- existing question tools (manual, CSV, AI) and match flow work for them unchanged.
-- Old app versions never see them: the public list hides collections unless asked.
ALTER TABLE categories ADD COLUMN is_collection TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0;
