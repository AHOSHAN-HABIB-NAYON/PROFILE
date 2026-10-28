import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { CODE_ALPHABET, FAMILY_CODE_RE, newFamilyCode } from '../src/auth/join-codes.js';

const HOUR = 3_600_000;
let db;
let t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());

const api = () => request(t.app);
let devSeq = 0;
const childDevice = () => ({ device_id: `child-device-${++devSeq}`, model: 'Redmi 12', manufacturer: 'Xiaomi' });

async function parentWithFamily(name = 'Rahman family') {
  const p = await signUp(t);
  const f = await api().post('/api/v1/families').set(bearer(p)).send({ name }).expect(201);
  return { p, family: f.body };
}
const newCode = (p, familyId) => api().post(`/api/v1/families/${familyId}/child-code`).set(bearer(p)).send({});
const joinChild = (code, extra = {}) =>
  api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', device: childDevice(), ...extra });

describe('families', () => {
  test('create: caller is owner and parent; role comes from membership', async () => {
    const p = await signUp(t);
    assert.equal((await api().get('/api/v1/me').set(bearer(p)).expect(200)).body.role, null);
    const res = await api().post('/api/v1/families').set(bearer(p)).send({ name: 'Rahman family' }).expect(201);
    assert.match(res.body.id, /^[0-9a-f-]{36}$/);
    assert.equal(res.body.plan, 'free');
    assert.equal(res.body.owner_member_id, p.user.id);
    assert.equal(res.body.members.length, 1);
    assert.equal(res.body.members[0].role, 'parent');
    assert.equal(res.body.members[0].sharing_status, 'pending', 'adult consent rule');
    const me = (await api().get('/api/v1/me').set(bearer(p)).expect(200)).body;
    assert.equal(me.role, 'parent');
    assert.equal(me.family_id, res.body.id);
    // one family per owner for now
    assert.equal((await api().post('/api/v1/families').set(bearer(p)).send({}).expect(409)).body.error.code, 'CONFLICT');
  });

  test('GET is for members only, and never contains location fields', async () => {
    const { p, family } = await parentWithFamily();
    const res = await api().get(`/api/v1/families/${family.id}`).set(bearer(p)).expect(200);
    const m = res.body.members[0];
    assert.deepEqual(Object.keys(m).sort(), ['avatar_thumb_url', 'country_iso2', 'id', 'is_overseas', 'name', 'relationship', 'role', 'sharing_status', 'timezone']);
    const keys = [...Object.keys(res.body), ...res.body.members.flatMap(Object.keys)];
    for (const k of keys) assert.ok(!/^(lat|lng|location|place|route|point|accuracy)/i.test(k), k);
    const stranger = await signUp(t);
    assert.equal((await api().get(`/api/v1/families/${family.id}`).set(bearer(stranger)).expect(404)).body.error.code, 'NOT_FOUND');
    await api().get('/api/v1/families/not-a-uuid').set(bearer(p)).expect(404);
    await api().get(`/api/v1/families/${family.id}`).expect(401);
  });
});

describe('child code', () => {
  test('format, 24 h expiry, join_url; regenerating revokes the old code', async () => {
    const { p, family } = await parentWithFamily();
    const a = await newCode(p, family.id).expect(201);
    assert.match(a.body.code, FAMILY_CODE_RE);
    assert.equal(new Date(a.body.expires_at).getTime() - t.clock.now().getTime(), 24 * HOUR);
    assert.equal(a.body.join_url, `https://nirapod.example/join?code=${a.body.code}`);
    const b = await newCode(p, family.id).expect(201);
    assert.notEqual(a.body.code, b.body.code);
    assert.equal((await joinChild(a.body.code).expect(400)).body.error.code, 'CODE_INVALID');
    await joinChild(b.body.code).expect(200);
  });

  test('alphabet has no ambiguous characters', () => {
    assert.equal(CODE_ALPHABET, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    for (const c of 'ILO01') assert.ok(!CODE_ALPHABET.includes(c));
    for (let i = 0; i < 500; i++) assert.match(newFamilyCode(), FAMILY_CODE_RE);
  });

  test('only parents/guardians of that family; children and strangers cannot', async () => {
    const { p, family } = await parentWithFamily();
    const stranger = await signUp(t);
    await newCode(stranger, family.id).expect(404);
    const code = (await newCode(p, family.id).expect(201)).body.code;
    const child = (await joinChild(code).expect(200)).body;
    assert.equal((await newCode(child, family.id).expect(403)).body.error.code, 'FORBIDDEN');
  });

  test('plan limit: free plan allows 1 child -> PLAN_LIMIT_REACHED; a subscription lifts it', async () => {
    const { p, family } = await parentWithFamily();
    const code = (await newCode(p, family.id).expect(201)).body.code;
    await joinChild(code).expect(200);
    const res = await newCode(p, family.id).expect(402);
    assert.equal(res.body.error.code, 'PLAN_LIMIT_REACHED');
    assert.deepEqual(res.body.error.details, { limit: 'max_children', max: 1, current: 1, plan: 'free' });

    const fam = await db('families').where({ uuid: family.id }).first();
    const premium = await db('plans').where({ code: 'premium' }).first();
    await db('subscriptions').insert({ family_id: fam.id, plan_id: premium.id, source: 'grant', status: 'active', starts_at: t.clock.now(), expires_at: new Date(t.clock.now().getTime() + 30 * 24 * HOUR) });
    await newCode(p, family.id).expect(201);
    assert.equal((await api().get(`/api/v1/families/${family.id}`).set(bearer(p)).expect(200)).body.plan, 'premium');
  });

  test('plan limit is also checked when the child joins', async () => {
    const { p, family } = await parentWithFamily();
    const c1 = (await newCode(p, family.id).expect(201)).body.code;
    // a second code generated before the first was used
    await db('join_codes').insert({ family_id: (await db('families').where({ uuid: family.id }).first()).id, created_by_user_id: (await db('users').where({ uuid: p.user.id }).first()).id, code: 'ZZZ222', expires_at: new Date(t.clock.now().getTime() + HOUR) });
    await joinChild(c1).expect(200);
    assert.equal((await joinChild('ZZZ222').expect(402)).body.error.code, 'PLAN_LIMIT_REACHED');
  });
});

describe('child join (POST /auth/child)', () => {
  test('creates a device-bound child account, member, child_devices row and session', async () => {
    const { p, family } = await parentWithFamily();
    const code = (await newCode(p, family.id).expect(201)).body.code;
    const dev = childDevice();
    const res = await api().post('/api/v1/auth/child')
      .send({ code: ` ${code.toLowerCase().slice(0, 3)}-${code.toLowerCase().slice(3)} `, first_name: '  রাফি  ', device: dev, timezone: 'Asia/Dhaka', country_iso2: 'bd' })
      .expect(200);
    assert.equal(res.body.user.role, 'child');
    assert.equal(res.body.user.auth_provider, 'device');
    assert.equal(res.body.user.email, null);
    assert.equal(res.body.user.name, 'রাফি');
    assert.equal(res.body.user.country_iso2, 'BD');
    assert.equal(res.body.user.family_id, family.id);
    assert.equal(res.body.needs_profile_setup, false);
    const u = await db('users').where({ uuid: res.body.user.id }).first();
    assert.equal(u.password_hash, null);
    const m = await db('family_members').where({ user_id: u.id }).first();
    assert.equal(m.role, 'child');
    assert.equal(m.sharing_status, 'active');
    const s = await db('sessions').where({ uuid: res.body.session_id }).first();
    assert.equal(s.is_child_device, 1);
    assert.equal(s.device_id, dev.device_id);
    const cd = await db('child_devices').where({ user_id: u.id }).first();
    assert.equal(cd.device_id, dev.device_id);
    assert.equal(cd.session_id, s.id);
    assert.equal(cd.manufacturer, 'Xiaomi');
    const fam = (await api().get(`/api/v1/families/${family.id}`).set(bearer(p)).expect(200)).body;
    assert.equal(fam.members.length, 2);
    // the child can see who is in the family (consent screen)
    await api().get(`/api/v1/families/${family.id}`).set(bearer(res.body)).expect(200);
  });

  test('single use', async () => {
    const { p, family } = await parentWithFamily();
    const code = (await newCode(p, family.id).expect(201)).body.code;
    await joinChild(code).expect(200);
    assert.equal((await joinChild(code).expect(400)).body.error.code, 'CODE_INVALID');
  });

  test('expires after 24 hours', async () => {
    const { p, family } = await parentWithFamily();
    const code = (await newCode(p, family.id).expect(201)).body.code;
    t.clock.advance(24 * HOUR + 1000);
    assert.equal((await joinChild(code).expect(410)).body.error.code, 'CODE_EXPIRED');
  });

  test('invalid codes and inputs', async () => {
    assert.equal((await joinChild('ABCDE2').expect(400)).body.error.code, 'CODE_INVALID');
    assert.equal((await joinChild('ABCDE1').expect(400)).body.error.code, 'VALIDATION_FAILED', 'ambiguous character');
    assert.equal((await joinChild('ABC').expect(400)).body.error.code, 'VALIDATION_FAILED');
    await api().post('/api/v1/auth/child').send({ code: 'ABCDE2', first_name: 'Rafi' }).expect(400); // device required
    await joinChild('ABCDE2', { first_name: '' }).expect(400);
    await joinChild('ABCDE2', { timezone: 'Mars/Base' }).expect(400);
  });

  test('child refresh is bound to the device (x-device-id)', async () => {
    const { p, family } = await parentWithFamily();
    const code = (await newCode(p, family.id).expect(201)).body.code;
    const dev = childDevice();
    const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Mina', device: dev }).expect(200)).body;
    const none = await api().post('/api/v1/auth/refresh').send({ refresh_token: child.refresh_token }).expect(401);
    assert.equal(none.body.error.code, 'AUTH_REFRESH_INVALID');
    const wrong = await api().post('/api/v1/auth/refresh').set('x-device-id', 'other-device').send({ refresh_token: child.refresh_token }).expect(401);
    assert.equal(wrong.body.error.details.reason, 'device_mismatch');
    const ok = await api().post('/api/v1/auth/refresh').set('x-device-id', dev.device_id).send({ refresh_token: child.refresh_token }).expect(200);
    assert.ok(ok.body.access_token);
    const list = (await api().get('/api/v1/auth/sessions').set(bearer(ok.body)).expect(200)).body;
    assert.equal(list[0].is_child_device, true);
  });

  test('a child cannot create a family or accept an invite', async () => {
    const { p, family } = await parentWithFamily();
    const code = (await newCode(p, family.id).expect(201)).body.code;
    const child = (await joinChild(code).expect(200)).body;
    await api().post('/api/v1/families').set(bearer(child)).send({}).expect(403);
    await api().post('/api/v1/invites/accept').set(bearer(child)).send({ code: 'ABCDE2' }).expect(403);
  });
});

describe('invites accept', () => {
  async function invite(familyUuid, inviterUuid, over = {}) {
    const fam = await db('families').where({ uuid: familyUuid }).first();
    const by = await db('users').where({ uuid: inviterUuid }).first();
    const code = newFamilyCode();
    await db('invites').insert({ family_id: fam.id, invited_by_user_id: by.id, code, role: 'guardian', expires_at: new Date(t.clock.now().getTime() + 72 * HOUR), ...over });
    return code;
  }

  test('adult joins as the invite role with sharing pending (adult consent rule); role from membership', async () => {
    const { p, family } = await parentWithFamily();
    const code = await invite(family.id, p.user.id, { is_overseas: true });
    const g = await signUp(t);
    const res = await api().post('/api/v1/invites/accept').set(bearer(g)).send({ code: code.toLowerCase() }).expect(200);
    assert.equal(res.body.role, 'guardian');
    assert.equal(res.body.sharing_status, 'pending');
    assert.equal(res.body.family.id, family.id);
    const me = (await api().get('/api/v1/me').set(bearer(g)).expect(200)).body;
    assert.equal(me.role, 'guardian');
    assert.equal(me.is_overseas, true);
    assert.equal(me.family_id, family.id);
    // single use
    const other = await signUp(t);
    assert.equal((await api().post('/api/v1/invites/accept').set(bearer(other)).send({ code }).expect(400)).body.error.code, 'CODE_INVALID');
  });

  test('parent role invites, expiry, email-bound invites, already in a family, plan member limit', async () => {
    const { p, family } = await parentWithFamily();
    const parentCode = await invite(family.id, p.user.id, { role: 'parent' });
    const second = await signUp(t);
    await api().post('/api/v1/invites/accept').set(bearer(second)).send({ code: parentCode }).expect(200);
    assert.equal((await api().get('/api/v1/me').set(bearer(second)).expect(200)).body.role, 'parent');

    // free plan: 2 adult members -> third adult is blocked
    const third = await signUp(t);
    const full = await api().post('/api/v1/invites/accept').set(bearer(third)).send({ code: await invite(family.id, p.user.id) }).expect(402);
    assert.equal(full.body.error.details.limit, 'max_members');

    const other = await parentWithFamily();
    const expired = await invite(other.family.id, other.p.user.id, { expires_at: new Date(t.clock.now().getTime() - 1000) });
    assert.equal((await api().post('/api/v1/invites/accept').set(bearer(third)).send({ code: expired }).expect(410)).body.error.code, 'CODE_EXPIRED');
    const bound = await invite(other.family.id, other.p.user.id, { email: 'someone-else@example.com' });
    assert.equal((await api().post('/api/v1/invites/accept').set(bearer(third)).send({ code: bound }).expect(400)).body.error.code, 'CODE_INVALID');
    const mine = await invite(other.family.id, other.p.user.id, { email: third.email });
    await api().post('/api/v1/invites/accept').set(bearer(third)).send({ code: mine }).expect(200);
    const again = await invite(other.family.id, other.p.user.id);
    assert.equal((await api().post('/api/v1/invites/accept').set(bearer(third)).send({ code: again }).expect(409)).body.error.code, 'CONFLICT');
  });
});

test('role is never taken from the client', async () => {
  const p = await signUp(t);
  const res = await api().patch('/api/v1/me/profile').set(bearer(p)).send({ role: 'parent' }).expect(400);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  assert.equal((await api().get('/api/v1/me').set(bearer(p)).expect(200)).body.role, null);
});
