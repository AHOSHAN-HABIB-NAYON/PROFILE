import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { sanitize, scrubString, createLogger } from '../src/logger.js';

test('sanitize removes coordinates and PII wherever they appear', () => {
  const out = sanitize({
    lat: 23.81, lng: 90.41, accuracy: 12, user: { email: 'a@b.com', name: 'Rafi', id: 7 },
    points: [{ latitude: 1, longitude: 2 }], refresh_token: 'x', join_code: 'ABC234', status: 'ok',
  });
  const s = JSON.stringify(out);
  for (const bad of ['23.81', '90.41', 'a@b.com', 'Rafi', 'ABC234']) assert.ok(!s.includes(bad), bad);
  assert.equal(out.user.id, 7);
  assert.equal(out.status, 'ok');
});

test('scrubString removes emails, coordinate pairs and tokens from free text', () => {
  const s = scrubString('user a.b@x.org at 23.810331, 90.412521 sent Bearer abc.def-ghi');
  assert.ok(!s.includes('a.b@x.org'));
  assert.ok(!s.includes('23.810331'));
  assert.ok(!s.includes('abc.def-ghi'));
});

test('logger output never contains coordinates or emails', () => {
  const chunks = [];
  const dest = new Writable({ write(c, e, cb) { chunks.push(String(c)); cb(); } });
  const logger = createLogger('info', dest);
  logger.info({ lat: 23.8103, lng: 90.4125, email: 'x@y.com', nested: { place: 'School' } }, 'fix at 23.8103, 90.4125 for x@y.com');
  logger.error({ err: Object.assign(new Error('bad token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.sig'), { code: 'E1' }) }, 'oops');
  const out = chunks.join('');
  for (const bad of ['23.8103', '90.4125', 'x@y.com', 'School', 'eyJhbGciOiJIUzI1']) assert.ok(!out.includes(bad), bad);
  assert.ok(out.includes('"errCode":"E1"'));
});
