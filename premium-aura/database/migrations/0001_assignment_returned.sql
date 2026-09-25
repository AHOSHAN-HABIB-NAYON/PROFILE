-- Unused numbers are returned to the pool after a timeout (status 'returned').
ALTER TABLE resource_assignments
  MODIFY status ENUM('pending','received','released','expired','returned') NOT NULL DEFAULT 'pending';
