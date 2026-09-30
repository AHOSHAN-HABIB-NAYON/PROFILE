'use strict';
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const bn = require('../src/util/bn');
const { clean, strip, safeUrl } = require('../src/util/html');
const { verifyPassword } = require('../src/util/security');
const uploads = require('../src/util/uploads');
const { explain } = require('../src/automation/errors');

test('Bangla digits & counts', () => {
  assert.strictEqual(bn.bnNum(2026), '২০২৬');
  assert.strictEqual(bn.enNum('১২৩'), '123');
  assert.strictEqual(bn.bnCount(1234567), '১২,৩৪,৫৬৭');
  assert.strictEqual(bn.bnCount(999), '৯৯৯');
});

test('Bangla dates & relative time', () => {
  assert.strictEqual(bn.bnDate(new Date(2026, 9, 30)), '৩০ অক্টোবর ২০২৬');
  const now = Date.now();
  assert.strictEqual(bn.timeAgo(new Date(now - 2 * 3600000), now), '২ ঘণ্টা আগে');
  assert.strictEqual(bn.timeAgo(new Date(now - 10000), now), 'এইমাত্র');
});

test('Bangla slugs', () => {
  assert.strictEqual(bn.slugify('বাংলাদেশ পুলিশ কনস্টেবল নিয়োগ ২০২৬!'), 'বাংলাদেশ-পুলিশ-কনস্টেবল-নিয়োগ-২০২৬');
  assert.strictEqual(bn.slugify('  NTRCA   শিক্ষক  নিবন্ধন । '), 'ntrca-শিক্ষক-নিবন্ধন');
  assert.ok(bn.slugify('ক'.repeat(200)).length <= 90);
  assert.ok(bn.isBrokenSlug('%E0%A6%AC'));
  assert.ok(bn.isBrokenSlug(''));
  assert.ok(!bn.isBrokenSlug('বাংলাদেশ-পুলিশ'));
});

test('title similarity (duplicate detection)', () => {
  const a = 'বাংলাদেশ পুলিশ কনস্টেবল পদে নিয়োগ বিজ্ঞপ্তি ২০২৬';
  assert.ok(bn.similarity(a, 'বাংলাদেশ পুলিশ কনস্টেবল পদে নিয়োগ বিজ্ঞপ্তি ২০২৬ প্রকাশ') >= 0.85);
  assert.ok(bn.similarity(a, 'ঢাকা বিশ্ববিদ্যালয় ভর্তি পরীক্ষার ফলাফল') < 0.5);
});

test('date & vacancy extraction', () => {
  const d = bn.findDates('আবেদনের শেষ তারিখ: ১৫ অক্টোবর ২০২৬ এবং শুরু 01/10/2026');
  assert.strictEqual(d.length, 2);
  assert.strictEqual(d[0].getMonth(), 9);
  assert.strictEqual(d[0].getDate(), 15);
  assert.strictEqual(bn.findVacancies('পদসংখ্যা: ১,২০০ জন'), 1200);
  assert.strictEqual(bn.findVacancies('মোট ৫০ টি পদে নিয়োগ'), 50);
});

test('HTML sanitizer removes scripts and handlers', () => {
  const out = clean('<p onclick="x()">ok<script>alert(1)</script><a href="javascript:alert(1)">l</a><a href="https://x.com">e</a></p><h1>t</h1>');
  assert.ok(!/script|onclick|javascript:/i.test(out));
  assert.ok(out.includes('rel="noopener nofollow"'));
  assert.ok(out.includes('<h2>t</h2>'));
  assert.strictEqual(strip('<b>a</b>  b'), 'a b');
  assert.strictEqual(safeUrl('javascript:alert(1)'), '');
  assert.strictEqual(safeUrl('example.com/x'), 'https://example.com/x');
});

test('legacy PHP $2y$ bcrypt hashes verify', async () => {
  const h = bcrypt.hashSync('secret123', 10).replace(/^\$2a\$/, '$2y$');
  assert.ok(h.startsWith('$2y$'));
  assert.ok(await verifyPassword('secret123', h));
  assert.ok(!(await verifyPassword('wrong', h)));
});

test('image compression targets (1MB→~100KB, 5MB→~450KB)', () => {
  assert.strictEqual(Math.round(uploads.targetBytes(1024 * 1024) / 1024), 100);
  assert.strictEqual(Math.round(uploads.targetBytes(5 * 1024 * 1024) / 1024), 450);
  assert.ok(uploads.targetBytes(3 * 1024 * 1024) / 1024 > 250);
});

test('upload validation by magic bytes', () => {
  assert.strictEqual(uploads.detectImage(Buffer.from('<?php echo 1; ?>........')), null);
  assert.ok(uploads.detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])));
  assert.ok(uploads.isPdf(Buffer.from('%PDF-1.7 ...')));
  assert.ok(!uploads.isPdf(Buffer.from('<html>')));
});

test('automation errors are explained in Bangla', () => {
  assert.match(explain({ status: 401, body: 'Incorrect API key', url: 'https://api.openai.com/v1/chat/completions' }), /API কী ভুল/);
  assert.match(explain({ status: 429, body: '{"error":{"code":"insufficient_quota"}}' }), /ক্রেডিট/);
  assert.match(explain({ status: 404, url: 'https://x.com/wp-json/wp/v2/posts' }), /REST API/);
  assert.match(explain({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' }), /ডোমেইন/);
});
