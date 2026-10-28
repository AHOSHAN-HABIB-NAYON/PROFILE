import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { freshDb, buildTestApp, signUp, bearer, UPLOADS } from './helpers.js';
import { seed } from '../src/db/seed.js';

let db;
let t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());

const api = () => request(t.app);
const patch = (s, body) => api().patch('/api/v1/me/profile').set(bearer(s)).send(body);

describe('GET /me and PATCH /me/profile', () => {
  test('Me shape', async () => {
    const s = await signUp(t);
    const me = (await api().get('/api/v1/me').set(bearer(s)).expect(200)).body;
    assert.deepEqual(Object.keys(me).sort(), ['auth_provider', 'avatar_thumb_url', 'avatar_url', 'country_iso2', 'detected_source',
      'email', 'email_verified', 'family_id', 'has_password', 'id', 'is_overseas', 'language', 'name', 'role', 'timezone', 'tz_auto'].sort());
    assert.equal(me.tz_auto, true);
    assert.equal(me.has_password, true);
  });

  test('saves name, country, zone, tz_auto, detected_source, language', async () => {
    const s = await signUp(t);
    const res = await patch(s, { name: '  Mina Rahman ', country_iso2: 'sa', timezone: 'Asia/Riyadh', tz_auto: false, detected_source: 'manual', language: 'bn' }).expect(200);
    assert.equal(res.body.name, 'Mina Rahman');
    assert.equal(res.body.country_iso2, 'SA');
    assert.equal(res.body.timezone, 'Asia/Riyadh');
    assert.equal(res.body.tz_auto, false);
    assert.equal(res.body.detected_source, 'manual');
    assert.equal(res.body.language, 'bn');
    // partial update keeps the rest
    const res2 = await patch(s, { timezone: 'Asia/Kathmandu' }).expect(200);
    assert.equal(res2.body.country_iso2, 'SA');
    assert.equal(res2.body.timezone, 'Asia/Kathmandu');
    // login now skips profile setup
    assert.equal((await api().get('/api/v1/me').set(bearer(s)).expect(200)).body.name, 'Mina Rahman');
  });

  test('names: any script, emoji, RTL, 60 characters max (counted by character)', async () => {
    const s = await signUp(t);
    for (const name of ['রাফি', 'محمد علي', 'राहुल', 'Zoë 😀', 'م'.repeat(60), '😀'.repeat(60)]) {
      assert.equal((await patch(s, { name }).expect(200)).body.name, name);
    }
    for (const name of ['', '   ', 'a'.repeat(61), '😀'.repeat(61), 'bad\u0000name']) {
      assert.equal((await patch(s, { name }).expect(400)).body.error.code, 'VALIDATION_FAILED', JSON.stringify(name));
    }
  });

  test('IANA zone and ISO-2 country are validated against server lists', async () => {
    const s = await signUp(t);
    for (const tz of ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Europe/London', 'America/New_York', 'UTC']) {
      await patch(s, { timezone: tz }).expect(200);
    }
    for (const tz of ['Asia/Dhakka', 'Mars/Olympus', 'GMT+6', '', 'asia/dhaka']) {
      const r = await patch(s, { timezone: tz }).expect(400);
      assert.ok(r.body.error.details.fields.timezone);
    }
    for (const cc of ['XX', 'B', 'BGD', '12']) await patch(s, { country_iso2: cc }).expect(400);
    await patch(s, { country_iso2: null, timezone: null }).expect(200);
  });

  test('language must be one of the 8 codes; unknown fields and empty bodies are rejected', async () => {
    const s = await signUp(t);
    for (const l of ['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms']) await patch(s, { language: l }).expect(200);
    await patch(s, { language: 'fr' }).expect(400);
    await patch(s, { email: 'x@y.z' }).expect(400);
    await patch(s, {}).expect(400);
    await patch(s, { detected_source: 'gps' }).expect(400);
  });

  test('requires auth', async () => {
    await api().get('/api/v1/me').expect(401);
    await api().patch('/api/v1/me/profile').send({ name: 'x' }).expect(401);
  });
});

describe('profile photo', () => {
  async function exifJpeg() {
    // 800x400: left half red, right half blue, EXIF orientation 6 (display rotated 90° clockwise) plus metadata.
    const left = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#ff0000' } }).png().toBuffer();
    return sharp({ create: { width: 800, height: 400, channels: 3, background: '#0000ff' } })
      .composite([{ input: left, left: 0, top: 0 }])
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'secret-owner', Artist: 'Someone' } } })
      .toBuffer();
  }
  const upload = (s, buf, filename = 'p.jpg', contentType = 'image/jpeg') =>
    api().post('/api/v1/me/photo').set(bearer(s)).attach('photo', buf, { filename, contentType });
  const fetchMedia = async (url) => {
    const res = await api().get(new URL(url).pathname).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    return res;
  };

  test('re-encodes to 512x512 + 128x128 JPEG, applies EXIF rotation, strips all metadata', async () => {
    const s = await signUp(t);
    const res = await upload(s, await exifJpeg()).expect(200);
    assert.match(res.body.avatar_url, /^https:\/\/nirapod\.example\/media\/avatars\/[0-9a-f-]{36}\.jpg$/);
    assert.match(res.body.avatar_thumb_url, /^https:\/\/nirapod\.example\/media\/avatars\/[0-9a-f-]{36}\.jpg$/);
    assert.notEqual(res.body.avatar_url, res.body.avatar_thumb_url);

    const full = await fetchMedia(res.body.avatar_url);
    assert.equal(full.headers['x-content-type-options'], 'nosniff');
    assert.match(full.headers['content-type'], /image\/jpeg/);
    const meta = await sharp(full.body).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.exif, undefined, 'no EXIF');
    assert.equal(meta.xmp, undefined);
    assert.equal(meta.iptc, undefined);
    assert.equal(meta.icc, undefined);
    assert.equal(meta.orientation, undefined);
    assert.ok(!full.body.includes(Buffer.from('secret-owner')));
    // after rotating 90° clockwise the red half is on top, blue at the bottom
    const { data, info } = await sharp(full.body).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    const [rTop, , bTop] = px(256, 20);
    const [rBot, , bBot] = px(256, 490);
    assert.ok(rTop > 200 && bTop < 60, `top should be red, got ${px(256, 20)}`);
    assert.ok(bBot > 200 && rBot < 60, `bottom should be blue, got ${px(256, 490)}`);

    const thumb = await sharp((await fetchMedia(res.body.avatar_thumb_url)).body).metadata();
    assert.equal(thumb.width, 128);
    assert.equal(thumb.height, 128);
    assert.equal(thumb.exif, undefined);

    const me = (await api().get('/api/v1/me').set(bearer(s)).expect(200)).body;
    assert.equal(me.avatar_url, res.body.avatar_url);
  });

  test('accepts PNG and WebP; checks magic bytes, not the declared type', async () => {
    const s = await signUp(t);
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 0.5 } } }).png().toBuffer();
    await upload(s, png, 'x.bin', 'application/octet-stream').expect(200);
    const webp = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#00ff00' } }).webp().toBuffer();
    const r = await upload(s, webp, 'x.webp', 'image/webp').expect(200);
    assert.equal((await sharp((await fetchMedia(r.body.avatar_url)).body).metadata()).width, 512);

    const fake = Buffer.from('<?php echo "hi"; ?> not an image at all, just text pretending');
    const bad = await upload(s, fake, 'evil.jpg', 'image/jpeg').expect(415);
    assert.equal(bad.body.error.code, 'UNSUPPORTED_MEDIA');
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    assert.equal((await upload(s, gif, 'a.gif', 'image/gif').expect(415)).body.error.code, 'UNSUPPORTED_MEDIA');
    // truncated JPEG: right magic bytes, undecodable body
    const jpeg = await exifJpeg();
    assert.equal((await upload(s, jpeg.subarray(0, 200)).expect(415)).body.error.code, 'UNSUPPORTED_MEDIA');
  });

  test('HEIC is recognised but answered with a clear UNSUPPORTED_MEDIA when this server cannot decode it', async () => {
    const s = await signUp(t);
    const box = Buffer.alloc(24);
    box.writeUInt32BE(24, 0);
    box.write('ftypheic', 4, 'latin1');
    box.write('mif1heic', 16, 'latin1');
    const heic = Buffer.concat([box, Buffer.alloc(2000)]);
    const res = await upload(s, heic, 'IMG_0001.HEIC', 'image/heic').expect(415);
    assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA');
    assert.equal(res.body.error.details.reason, 'heic_unsupported');
    assert.match(res.body.error.message, /JPEG/);
  });

  test('10 MB limit -> PAYLOAD_TOO_LARGE; missing file -> VALIDATION_FAILED', async () => {
    const s = await signUp(t);
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);
    assert.equal((await upload(s, big).expect(413)).body.error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal((await api().post('/api/v1/me/photo').set(bearer(s)).field('x', 'y').expect(400)).body.error.code, 'VALIDATION_FAILED');
    await api().post('/api/v1/me/photo').attach('photo', Buffer.from('x'), 'a.jpg').expect(401);
  });

  test('replacing or deleting the photo removes the old files', async () => {
    const s = await signUp(t);
    const file = (url) => path.join(UPLOADS, 'avatars', path.basename(new URL(url).pathname));
    const a = (await upload(s, await exifJpeg()).expect(200)).body;
    assert.ok(fs.existsSync(file(a.avatar_url)) && fs.existsSync(file(a.avatar_thumb_url)));
    const b = (await upload(s, await exifJpeg()).expect(200)).body;
    assert.ok(!fs.existsSync(file(a.avatar_url)) && !fs.existsSync(file(a.avatar_thumb_url)));
    await api().get(new URL(a.avatar_url).pathname).expect(404);
    await api().delete('/api/v1/me/photo').set(bearer(s)).expect(204);
    assert.ok(!fs.existsSync(file(b.avatar_url)) && !fs.existsSync(file(b.avatar_thumb_url)));
    const me = (await api().get('/api/v1/me').set(bearer(s)).expect(200)).body;
    assert.equal(me.avatar_url, null);
    assert.equal(me.avatar_thumb_url, null);
  });

  test('media route is read-only: no listing, no traversal', async () => {
    await api().get('/media/avatars/').expect(404);
    await api().get('/media/avatars/..%2F..%2Fpackage.json').expect((r) => assert.ok([400, 403, 404].includes(r.status)));
    await api().post('/media/avatars/x.jpg').expect((r) => assert.notEqual(r.status, 200));
  });

  test('rate limit: 10 uploads per hour per user', async () => {
    const s = await signUp(t);
    const tiny = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).png().toBuffer();
    for (let i = 0; i < 10; i++) await upload(s, tiny, 'a.png', 'image/png').expect(200);
    const res = await upload(s, tiny, 'a.png', 'image/png').expect(429);
    assert.equal(res.body.error.code, 'RATE_LIMITED');
    // another user is not affected
    await upload(await signUp(t), tiny, 'a.png', 'image/png').expect(200);
  });
});

describe('consents', () => {
  test('stores a consent record with the family', async () => {
    const s = await signUp(t);
    const f = (await api().post('/api/v1/families').set(bearer(s)).send({}).expect(201)).body;
    const res = await api().post('/api/v1/me/consents').set(bearer(s))
      .send({ type: 'adult_location_sharing', version: '2026-10', granted: true, details: { shown_member_ids: [f.members[0].id] } }).expect(201);
    assert.equal(res.body.type, 'adult_location_sharing');
    const u = await db('users').where({ uuid: s.user.id }).first();
    const row = await db('consents').where({ user_id: u.id, type: 'adult_location_sharing' }).first();
    assert.equal(row.granted, 1);
    assert.equal(row.family_id, (await db('families').where({ uuid: f.id }).first()).id);
  });

  test('rejects unknown types and location-like details', async () => {
    const s = await signUp(t);
    await api().post('/api/v1/me/consents').set(bearer(s)).send({ type: 'sell_data', version: '1', granted: true }).expect(400);
    await api().post('/api/v1/me/consents').set(bearer(s)).send({ type: 'ai_chat_notice', version: '1', granted: true, details: { lat: 23.8, lng: 90.4 } }).expect(400);
    await api().post('/api/v1/me/consents').set(bearer(s)).send({ type: 'ai_chat_notice', version: '1', granted: true, details: { x: 'a'.repeat(3000) } }).expect(400);
    await api().post('/api/v1/me/consents').set(bearer(s)).send({ type: 'ai_chat_notice', version: '1' }).expect(400);
  });
});

describe('GET /geo/hint', () => {
  test('no GeoIP database configured -> country_iso2 null', async () => {
    const res = await api().get('/api/v1/geo/hint').expect(200);
    assert.deepEqual(res.body, { country_iso2: null });
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('uses the local lookup; invalid results and lookup errors give null', async () => {
    const seen = [];
    const app = buildTestApp(db, {}, { geoLookup: async (ip) => { seen.push(ip); return 'bd'; } }).app;
    assert.deepEqual((await request(app).get('/api/v1/geo/hint').expect(200)).body, { country_iso2: 'BD' });
    assert.equal(seen.length, 1);
    const bogus = buildTestApp(db, {}, { geoLookup: async () => 'ZZ' }).app;
    assert.deepEqual((await request(bogus).get('/api/v1/geo/hint').expect(200)).body, { country_iso2: null });
    const broken = buildTestApp(db, {}, { geoLookup: async () => { throw new Error('db gone'); } }).app;
    assert.deepEqual((await request(broken).get('/api/v1/geo/hint').expect(200)).body, { country_iso2: null });
    const missingFile = buildTestApp(db, { GEOIP_DB_PATH: '/nonexistent/GeoLite2-Country.mmdb' }).app;
    assert.deepEqual((await request(missingFile).get('/api/v1/geo/hint').expect(200)).body, { country_iso2: null });
  });

  test('the IP is not stored anywhere', async () => {
    const [rows] = await db.raw("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name REGEXP '(^|_)ip(_|$)'");
    assert.deepEqual(rows, []);
  });
});
