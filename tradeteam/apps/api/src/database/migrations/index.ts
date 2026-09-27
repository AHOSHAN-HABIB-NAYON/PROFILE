import { m001 } from './001_initial';
import { m002 } from './002_ledger_immutability';
import { m003 } from './003_seed_rbac';

/** Append new migrations here. Never edit a migration that has shipped — add a new one. */
export const MIGRATIONS = [m001, m002, m003];
