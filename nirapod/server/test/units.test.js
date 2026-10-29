// Unit tests for password rules, email templates, config defaults and code generators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { passwordProblems, COMMON_PASSWORDS, hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { render, pickLanguage } from '../src/email/templates.js';
import { newSixDigitCode, createSendThrottle } from '../src/auth/codes.js';
import { testClock } from './helpers.js';

const prodEnv = {
  NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40), MASTER_KEY: 'k', DB_PASSWORD: 'p', DB_ADMIN_USER: 'a', DB_ADMIN_PASSWORD: 'b',
};

test('bcrypt cost defaults to 12 and production refuses less', async () => {
  assert.equal(loadConfig({}).BCRYPT_COST, 12);
  assert.throws(() => loadConfig({ ...prodEnv, BCRYPT_COST: '10' }), /BCRYPT_COST/);
  assert.equal(loadConfig(prodEnv).BCRYPT_COST, 12);
  const h = await hashPassword('Family-Pass-2026', 12);
  assert.match(h, /^\$2b\$12\$/);
  assert.equal(await verifyPassword('Family-Pass-2026', h, 12), true);
  assert.equal(await verifyPassword('family-pass-2026', h, 12), false);
  assert.equal(await verifyPassword('x', null, 4), false, 'missing account still runs a compare');
});

test('new config defaults: UPLOAD_DIR, TERMS_VERSION, refresh limiter', () => {
  const c = loadConfig({});
  assert.equal(c.UPLOAD_DIR, './uploads');
  assert.equal(c.TERMS_VERSION, '2026-10');
  assert.equal(c.REFRESH_RATE_LIMIT_MAX, 30);
});

test('common-password list is bundled (at least 1000 entries) and checked case-insensitively', () => {
  assert.ok(COMMON_PASSWORDS.size >= 1000, `${COMMON_PASSWORDS.size}`);
  for (const pw of ['password1', 'PASSWORD1', 'Qwerty123', 'abc12345', 'iloveyou1']) {
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) assert.ok(passwordProblems(pw).includes('common'), pw);
  }
  assert.ok(passwordProblems('Password1').includes('common'));
});

test('password rules', () => {
  assert.deepEqual(passwordProblems('Nirapod-Family-2026'), []);
  assert.deepEqual(passwordProblems('a1'), ['min_length']);
  assert.deepEqual(passwordProblems('abcdefghxyz'), ['number']);
  assert.deepEqual(passwordProblems('98765432101'), ['letter']);
  assert.deepEqual(passwordProblems('মিনা-২০২৬-ঢাকা'), [], 'Bengali letters and digits count');
  assert.ok(passwordProblems(`A1${'x'.repeat(80)}`).includes('max_length'), 'bcrypt 72-byte limit');
  assert.ok(passwordProblems(undefined).length > 0);
});

test('six-digit codes are always 6 digits', () => {
  for (let i = 0; i < 2000; i++) assert.match(newSixDigitCode(), /^\d{6}$/);
});

test('send throttle: 30 s gap and 5 per hour, keyed by email, independent of accounts', () => {
  const clock = testClock();
  const th = createSendThrottle({ clock, key: 'k' });
  assert.equal(th.retryAfter('verify_email', 'a@x.com'), null);
  th.record('verify_email', 'a@x.com');
  assert.equal(th.retryAfter('verify_email', 'a@x.com'), 30);
  assert.equal(th.retryAfter('reset_password', 'a@x.com'), null, 'per purpose');
  assert.equal(th.retryAfter('verify_email', 'b@x.com'), null, 'per email');
  for (let i = 0; i < 4; i++) { clock.advance(30_000); assert.equal(th.retryAfter('verify_email', 'a@x.com'), null); th.record('verify_email', 'a@x.com'); }
  clock.advance(30_000);
  assert.equal(th.retryAfter('verify_email', 'a@x.com'), 3600 - 4 * 30 - 30);
  clock.advance(3600_000);
  assert.equal(th.retryAfter('verify_email', 'a@x.com'), null);
});

test('email templates: en and bn, HTML + text, code shown, values escaped, fallback to English', () => {
  for (const lang of ['en', 'bn']) {
    for (const tpl of ['verify_email', 'reset_password', 'welcome', 'new_device_login']) {
      const m = render(tpl, lang, { code: '123456', device: 'Pixel <8>', time: '2026-10-28 12:00 (Asia/Dhaka)' });
      assert.equal(m.language, lang);
      assert.ok(m.subject.length > 3);
      assert.match(m.html, /^<!doctype html>/);
      assert.match(m.html, new RegExp(`lang="${lang}"`));
      assert.match(m.html, /name="viewport"/, 'responsive');
      assert.ok(m.text.length > 20);
      if (tpl.endsWith('_email') || tpl === 'reset_password') {
        assert.match(m.text, /^\s{4}123456$/m);
        assert.match(m.html, /dir="ltr" class="code"/, 'code digits stay LTR');
      }
      if (tpl === 'new_device_login') {
        assert.ok(m.html.includes('Pixel &lt;8&gt;') && !m.html.includes('Pixel <8>'));
      }
    }
  }
  assert.match(render('verify_email', 'bn', { code: '1' }).subject, /[ঀ-৿]/, 'Bengali subject');
  assert.doesNotMatch(render('verify_email', 'en', { code: '1' }).html, /[ঀ-৿]/, 'no Bengali in English mail');
  assert.equal(pickLanguage('ms'), 'ms'); // Malay emails exist (Phase 5)
  assert.equal(pickLanguage('xx'), 'en');
  assert.equal(render('welcome', 'ar').language, 'en');
  assert.doesNotMatch(render('welcome', 'ar').html, /[ঀ-৿]/);
});
