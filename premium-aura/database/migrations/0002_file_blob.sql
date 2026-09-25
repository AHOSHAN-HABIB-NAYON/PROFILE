-- Keep a copy of uploaded images in the database so they survive hosts that
-- wipe the filesystem on redeploy (e.g. Hostinger). Disk is used as a cache.
ALTER TABLE file_uploads ADD COLUMN data MEDIUMBLOB NULL;
