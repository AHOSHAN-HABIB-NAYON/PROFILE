import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorCodes } from '../src/errors.js';
import { PUBLIC_SETTING_KEYS } from '../src/routes/app-config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const contracts = path.resolve(here, '../../docs/CONTRACTS');

test('error-codes.md lists every server error code', () => {
  const md = fs.readFileSync(path.join(contracts, 'error-codes.md'), 'utf8');
  for (const code of Object.keys(ErrorCodes)) assert.ok(md.includes(`\`${code}\``), code);
});

test('openapi.yaml documents the implemented endpoints and every public app-config key', () => {
  const y = fs.readFileSync(path.join(contracts, 'openapi.yaml'), 'utf8');
  for (const p of ['/health:', '/app-config:', '/auth/refresh:', '/auth/logout:', '/me/profile:', '/me/photo:']) assert.ok(y.includes(`  ${p}`), p);
  for (const k of PUBLIC_SETTING_KEYS) assert.ok(y.includes(`        ${k}:`), `AppConfig.${k}`);
});
