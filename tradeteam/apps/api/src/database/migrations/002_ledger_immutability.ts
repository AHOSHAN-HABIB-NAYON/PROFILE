import type { Migration } from '../migrator';

/**
 * Database-level guarantee that ledger rows are append-only. Creating triggers may require the
 * TRIGGER privilege (and SUPER when binary logging is on); if unavailable the migration records a
 * warning — the application layer never updates or deletes ledger rows regardless.
 */
export const m002: Migration = {
  version: 2,
  name: 'ledger_immutability',
  optional: true,
  up: [
    `CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON ledger_entries FOR EACH ROW
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries is append-only'`,
    `CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON ledger_entries FOR EACH ROW
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries is append-only'`,
  ],
};
