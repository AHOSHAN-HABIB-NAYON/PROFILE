import type { Migration } from 'kysely/migration';
import * as m001 from './2026_09_001_initial.js';

/**
 * Registry of all schema migrations, in order. Updates append new entries —
 * existing entries are never edited or removed once released.
 */
export const migrations: Record<string, Migration> = {
  '2026_09_001_initial': m001,
};
