import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { encryptSecret } from '../src/crypto/secrets.js';
import { setSetting } from '../src/settings.js';
import { redact, isUrgent } from '../src/chat/assistant.js';
import { chatInactivity, chatRetention, agentJoin, handBack } from '../src/chat/service.js';

const calls = [];
let nextReply = 'You can add a child from Family > Add child.';
const aiProvider = {
  async complete({ messages }) {
    calls.push(messages);
    return { text: nextReply, promptTokens: 100, completionTokens: 20 };
  },
};

let db, t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db, {}, { aiProvider });
  const cfg = t.app.locals.ctx.cfg;
  await db('ai_settings').del();
  await db('ai_settings').insert({ enabled: true, model: 'gpt-4o-mini', api_key_enc: encryptSecret(cfg.MASTER_KEY || cfg.JWT_ACCESS_SECRET, 'sk-test-key-1234567890') });
  await setSetting(db, 'support_emails', ['support@example.com']);
  await db('kb_articles').insert({ language: 'en', slug: 'add-child', title: 'Add a child', body: 'Family > Add child, then enter the code on the child phone.', category: 'start' });
});
after(async () => db.destroy());
const api = () => request(t.app);

async function adultWithFamily() {
  const p = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201)).body;
  return { p, fam };
}

describe('assistant rules', () => {
  test('redacts emails, phones, codes, tokens and coordinates', () => {
    const r = redact('mail me a@b.com or +880 1711-223344, code NRPD-GIFT-0001, otp 123456, at 23.81234, 90.41234 key sk-abcdefghijklmnop');
    for (const bad of ['a@b.com', '1711', 'NRPD-GIFT', '123456', '23.81234', 'sk-abc']) assert.ok(!r.includes(bad), `${bad} in ${r}`);
  });
  test('urgent keywords in several languages', () => {
    for (const s of ['my son is missing', 'আমার মেয়ে নিখোঁজ', 'baccha nikhoj', 'anak saya hilang']) assert.ok(isUrgent(s), s);
    assert.ok(!isUrgent('how do I add a child'));
  });
});

describe('user chat', () => {
  test('AI answers from the KB with a safe summary; no location or secrets in the prompt', async () => {
    const { p } = await adultWithFamily();
    const before = t.mail.messages.length;
    const r = (await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'How do I add a child? my email is x@y.com' }).expect(201)).body;
    assert.equal(r.conversation.status, 'ai');
    assert.deepEqual(r.added.map((m) => m.sender), ['system', 'user', 'ai']);
    const prompt = JSON.stringify(calls.at(-1));
    assert.ok(prompt.includes('Add a child'));
    assert.ok(prompt.includes('Nobody on support states, hints at'));
    assert.ok(!prompt.includes('x@y.com'));
    assert.ok(!/"lat"|"lng"/.test(prompt));
    assert.ok(!prompt.includes('sk-test-key'));
    assert.ok(t.mail.messages.slice(before).some((m) => m.to === 'support@example.com'));
    const cur = (await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body;
    assert.equal(cur.conversation.messages.length, 3);
  });

  test('urgent: emergency message first, flagged; asking for a person -> needs_human, AI stops', async () => {
    const { p } = await adultWithFamily();
    const r = (await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'My daughter is missing!' }).expect(201)).body;
    assert.equal(r.conversation.urgent, true);
    assert.ok(r.added.some((m) => m.sender === 'system' && /emergency/i.test(m.body)));
    const n = calls.length;
    const r2 = (await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'I want to talk to a real person' }).expect(201)).body;
    assert.equal(r2.conversation.status, 'needs_human');
    await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'hello?' }).expect(201);
    assert.equal(calls.length, n); // no AI while waiting for a person
  });

  test('unsure twice -> needs a person; agent joins with name, hands back', async () => {
    const { p } = await adultWithFamily();
    nextReply = '[UNSURE] I am not sure about that.';
    await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'Does it work on a smartwatch?' }).expect(201);
    const r = (await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'And on a tablet?' }).expect(201)).body;
    assert.equal(r.conversation.status, 'needs_human');
    nextReply = 'Sure.';
    const ctx = t.app.locals.ctx;
    const admin = await db('admin_users').first() ?? (await db('admin_users').insert({ email: 'nayon@example.com', password_hash: 'x', role: 'support' }), await db('admin_users').first());
    const [aid] = await db('agents').insert({ admin_user_id: admin.id, display_name: 'Nayon', photo_url: '/media/agents/n.jpg' });
    const conv = await db('chat_conversations').where({ uuid: r.conversation.id }).first();
    await agentJoin(ctx, conv, await db('agents').where({ id: aid }).first());
    const cur = (await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body.conversation;
    assert.equal(cur.status, 'human');
    assert.equal(cur.agent.name, 'Nayon');
    assert.ok(cur.messages.some((m) => m.body === 'Connected, Agent: Nayon' && m.agent?.photo_url));
    await handBack(ctx, conv);
    const cur2 = (await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body.conversation;
    assert.ok(cur2.messages.some((m) => m.body === 'You are now chatting with Nirapod Assistant'));
  });

  test('inactivity: warning (chat + email), then auto-close; closed chat is gone for the user; rating', async () => {
    const { p } = await adultWithFamily();
    const r = (await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'Thanks, how do I add a child?' }).expect(201)).body;
    const ctx = t.app.locals.ctx;
    try {
      t.clock.advance(6 * 60_000);
      const before = t.mail.messages.length;
      await chatInactivity(ctx);
      assert.ok(t.mail.messages.slice(before).some((m) => m.to === p.email && /still there/i.test(m.subject)));
      const cur = (await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body.conversation;
      assert.ok(cur.messages.at(-1).body.includes('Are you still there'));
      t.clock.advance(6 * 60_000);
      await chatInactivity(ctx);
      assert.equal((await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body.conversation, null);
      await api().post('/api/v1/chat/rate').set(bearer(p)).send({ conversation_id: r.conversation.id, rating: 'up' }).expect(204);
      // Retention: 7 days after closing the conversation is deleted.
      t.clock.advance(8 * 24 * 3600_000);
      await chatRetention(ctx);
      assert.equal(await db('chat_conversations').where({ uuid: r.conversation.id }).first(), undefined);
    } finally {
      t.clock.set('2026-10-28T12:00:00.000Z');
    }
  });

  test('images: validated, EXIF stripped, owner-only, purged after 7 days', async () => {
    const { p } = await adultWithFamily();
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#33aa66' } })
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } }).jpeg().toBuffer();
    await api().post('/api/v1/chat/images').set(bearer(p)).attach('image', Buffer.from('not an image at all'), 'x.jpg').expect(415);
    const r = (await api().post('/api/v1/chat/images').set(bearer(p)).attach('image', png, 'a.jpg').expect(201)).body;
    const img = r.added.find((m) => m.image)?.image;
    assert.ok(img?.url);
    const got = await api().get(img.url).set(bearer(p)).buffer(true).parse((res, cb) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    const meta = await sharp(got.body).metadata();
    assert.equal(meta.exif, undefined);
    const other = await signUp(t);
    await api().get(img.url).set(bearer(other)).expect(404);
    try {
      t.clock.advance(8 * 24 * 3600_000);
      await chatRetention(t.app.locals.ctx);
      const row = await db('chat_attachments').where({ id: Number(img.id) }).first();
      assert.ok(row.purged_at);
      assert.equal(row.storage_key, '');
    } finally {
      t.clock.set('2026-10-28T12:00:00.000Z');
    }
  });

  test('children cannot use live chat', async () => {
    const { p, fam } = await adultWithFamily();
    const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(p)).send({}).expect(201)).body.code;
    const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', device: { device_id: 'p7b-child' } }).expect(200)).body;
    const r = await api().get('/api/v1/chat/current').set(bearer(child)).set('x-device-id', 'p7b-child').expect(403);
    assert.equal(r.body.error.details.reason, 'child');
  });
});
