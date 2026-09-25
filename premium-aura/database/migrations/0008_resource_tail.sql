-- Match provider numbers written in another format (with/without "+", country code or trunk 0)
-- by their last 8 digits, using an index instead of scanning every resource.
ALTER TABLE authorized_resources
  ADD COLUMN serial_tail CHAR(8) GENERATED ALWAYS AS (RIGHT(serial_digits, 8)) STORED,
  ADD KEY idx_resources_tail (serial_tail);
