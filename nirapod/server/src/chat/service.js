// Live chat core shared by the user API (routes/chat.js) and the admin inbox (Phase 8).
// Lifecycle: ai -> needs_human -> human -> (hand back) ai -> closed. A closed chat disappears from the user's
// side at once; the admin keeps it in Closed history for 7 days, then it is deleted (unless legal hold).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { t } from '../push/strings.js';
import { getSetting } from '../settings.js';
import { audit } from '../audit.js';
import { askAssistant, isUrgent, wantsHuman, isFrustrated, isLegal } from './assistant.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
export const chatDir = (uploadDir) => path.resolve(uploadDir, 'chat');
const MIN = 60_000;

export function presentMessage(m, agents = new Map(), atts = new Map()) {
  const a = m.agent_id ? agents.get(m.agent_id) : null;
  const att = atts.get(m.id);
  return {
    id: String(m.id),
    sender: m.sender_type,
    body: m.body,
    agent: a ? { name: a.display_name, photo_url: a.photo_url } : null,
    image: att && !att.purged_at ? { id: String(att.id), url: `/api/v1/chat/attachments/${att.id}` } : null,
    image_expired: !!(att && att.purged_at),
    created_at: iso(m.created_at),
    delivered_at: iso(m.delivered_at),
    read_at: iso(m.read_at),
  };
}

export async function loadMessages(db, convId, { internal = false } = {}) {
  const q = db('chat_messages').where({ conversation_id: convId }).orderBy('id');
  if (!internal) q.where({ is_internal_note: false });
  const msgs = await q;
  const agentIds = [...new Set(msgs.map((m) => m.agent_id).filter(Boolean))];
  const agents = new Map((agentIds.length ? await db('agents').whereIn('id', agentIds) : []).map((a) => [a.id, a]));
  const atts = new Map((await db('chat_attachments').where({ conversation_id: convId })).map((x) => [x.message_id, x]));
  return msgs.map((m) => ({ ...presentMessage(m, agents, atts), ...(internal ? { internal: !!m.is_internal_note } : {}) }));
}

export async function presentConversation(db, conv) {
  const agent = conv.assigned_agent_id ? await db('agents').where({ id: conv.assigned_agent_id }).first() : null;
  return {
    id: conv.uuid,
    status: conv.status,
    urgent: !!conv.is_urgent,
    priority: !!conv.is_priority,
    agent: agent && conv.status === 'human' ? { name: agent.display_name, photo_url: agent.photo_url } : null,
    rating: conv.rating,
    created_at: iso(conv.created_at),
    messages: await loadMessages(db, conv.id),
  };
}

export const openConversation = (db, userId) =>
  db('chat_conversations').where({ user_id: userId }).whereNot({ status: 'closed' }).orderBy('id', 'desc').first();

// One email per conversation start and one per escalation; at most one per conversation per 10 minutes.
const emailed = new Map();
async function emailSupport(ctx, conv, kind) {
  const { db, mailer, clock } = ctx;
  const key = `${conv.id}:${kind}`;
  const last = emailed.get(key) ?? 0;
  if (clock.now().getTime() - last < 10 * MIN) return;
  emailed.set(key, clock.now().getTime());
  const to = await getSetting(db, 'support_emails', []);
  const list = Array.isArray(to) ? to : String(to).split(',');
  const status = conv.is_urgent ? 'URGENT' : conv.status === 'needs_human' ? 'needs a person' : conv.is_priority ? 'premium' : 'AI handling';
  for (const email of list.map((e) => String(e).trim()).filter(Boolean).slice(0, 5)) {
    await mailer.send('support_new_chat', { email, language: 'en' }, { status, urgent: conv.is_urgent ? ' (URGENT)' : '' });
  }
}

function notifyAdmins(ctx, conv, event) {
  ctx.realtime?.emitToAdmins?.(event, { conversation_id: conv.uuid, status: conv.status, urgent: !!conv.is_urgent, priority: !!conv.is_priority }, ctx.clock.now());
}

async function emergencyLine(db, userId, lang) {
  const u = await db('users').where({ id: userId }).first('country_iso2');
  const nums = u?.country_iso2 ? await db('emergency_numbers').where({ country_iso2: u.country_iso2 }).select('service', 'number') : [];
  const list = nums.length ? nums.map((n) => n.number).filter((v, i, a) => a.indexOf(v) === i).join(', ') : '112';
  return t(lang, 'chatsys.urgent', { numbers: list });
}

/** Adds a message and tells the user's app (socket). */
export async function addMessage(ctx, conv, { sender, body = null, agentId = null, internal = false }) {
  const { db, clock } = ctx;
  const now = clock.now();
  const [id] = await db('chat_messages').insert({
    conversation_id: conv.id, sender_type: sender, agent_id: agentId, body, is_internal_note: internal, created_at: now,
    delivered_at: sender === 'user' ? now : null,
  });
  const upd = { last_message_at: now };
  if (sender === 'user') Object.assign(upd, { last_user_message_at: now, inactivity_warned_at: null });
  await db('chat_conversations').where({ id: conv.id }).update(upd);
  const m = await db('chat_messages').where({ id }).first();
  const agents = agentId ? new Map([[agentId, await db('agents').where({ id: agentId }).first()]]) : new Map();
  const out = presentMessage(m, agents);
  if (!internal) {
    const u = await db('users').where({ id: conv.user_id }).first('uuid');
    ctx.realtime?.emitToUsers?.([u.uuid], 'chat.message', { conversation_id: conv.uuid, message: out }, now);
  }
  return out;
}

async function setStatus(ctx, conv, patch) {
  await ctx.db('chat_conversations').where({ id: conv.id }).update(patch);
  Object.assign(conv, patch);
  const u = await ctx.db('users').where({ id: conv.user_id }).first('uuid');
  ctx.realtime?.emitToUsers?.([u.uuid], 'chat.updated', { conversation_id: conv.uuid, status: conv.status }, ctx.clock.now());
}

async function escalate(ctx, conv, lang, added) {
  if (conv.status === 'needs_human' || conv.status === 'human') return;
  await setStatus(ctx, conv, { status: 'needs_human' });
  added.push(await addMessage(ctx, conv, { sender: 'system', body: t(lang, 'chatsys.waiting_human') }));
  notifyAdmins(ctx, conv, 'chat.needs_human');
  await emailSupport(ctx, conv, 'escalation');
}

/**
 * The user sent a message (text and/or an image already stored). Creates the conversation when needed,
 * applies urgent/legal/human rules, then lets the AI answer while no person has joined.
 * @returns {{conversation, added: object[]}}
 */
export async function userMessage(ctx, user, { body, attachment = null, priority = false }) {
  const { db, clock } = ctx;
  const now = clock.now();
  const lang = user.language || 'en';
  const added = [];
  let conv = await openConversation(db, user.id);
  let created = false;
  if (!conv) {
    const m = await db('family_members').where({ user_id: user.id }).whereNull('left_at').first('family_id');
    const [id] = await db('chat_conversations').insert({
      uuid: crypto.randomUUID(), user_id: user.id, family_id: m?.family_id ?? null, status: 'ai', language: lang,
      is_priority: !!priority, last_message_at: now, created_at: now,
    });
    conv = await db('chat_conversations').where({ id }).first();
    created = true;
    added.push(await addMessage(ctx, conv, { sender: 'system', body: t(lang, 'chatsys.notice') }));
  }
  const msg = await addMessage(ctx, conv, { sender: 'user', body });
  if (attachment) {
    await db('chat_attachments').insert({ ...attachment, message_id: Number(msg.id), conversation_id: conv.id, created_at: now });
    msg.image = { id: null, url: null };
    const row = await db('chat_attachments').where({ message_id: Number(msg.id) }).first();
    msg.image = { id: String(row.id), url: `/api/v1/chat/attachments/${row.id}` };
  }
  added.push(msg);
  const text = body || '';

  if (isUrgent(text) && !conv.is_urgent) {
    await setStatus(ctx, conv, { is_urgent: true });
    added.push(await addMessage(ctx, conv, { sender: 'system', body: await emergencyLine(db, user.id, lang) }));
    notifyAdmins(ctx, conv, 'chat.urgent');
    await emailSupport(ctx, conv, 'urgent');
  }
  if (created) {
    notifyAdmins(ctx, conv, 'chat.new');
    await emailSupport(ctx, conv, 'new');
  }
  if (conv.status === 'human' || conv.status === 'needs_human') {
    notifyAdmins(ctx, conv, 'chat.user_replied');
    return { conversation: conv, added };
  }
  if (isLegal(text)) {
    const email = (await getSetting(db, 'legal_request_email', '')) || 'legal@webtecit.com';
    added.push(await addMessage(ctx, conv, { sender: 'ai', body: t(lang, 'chatsys.legal', { email }) }));
    await audit(db, { actorType: 'system', action: 'chat.legal_request', targetType: 'chat', targetId: conv.id, now });
    return { conversation: conv, added };
  }
  if (wantsHuman(text) || isFrustrated(text)) {
    await escalate(ctx, conv, lang, added);
    return { conversation: conv, added };
  }
  if (!text.trim()) return { conversation: conv, added }; // image only: wait for words or a person

  const u = await db('users').where({ id: user.id }).first('uuid');
  ctx.realtime?.emitToUsers?.([u.uuid], 'chat.typing', { conversation_id: conv.uuid, typing: true }, now);
  const history = await db('chat_messages').where({ conversation_id: conv.id, is_internal_note: false }).orderBy('id');
  const reply = await askAssistant(ctx, { conversation: conv, userId: user.id, history, now });
  ctx.realtime?.emitToUsers?.([u.uuid], 'chat.typing', { conversation_id: conv.uuid, typing: false }, clock.now());
  if (!reply?.text) {
    await escalate(ctx, conv, lang, added); // AI off, over its limits, or failed: a person takes it
    return { conversation: conv, added };
  }
  added.push(await addMessage(ctx, conv, { sender: 'ai', body: reply.text }));
  if (reply.unsure) {
    const n = (conv.ai_unsure_count ?? 0) + 1;
    await db('chat_conversations').where({ id: conv.id }).update({ ai_unsure_count: n });
    conv.ai_unsure_count = n;
    if (n >= 2) await escalate(ctx, conv, lang, added);
  }
  return { conversation: conv, added };
}

export async function requestHuman(ctx, conv) {
  const added = [];
  await escalate(ctx, conv, conv.language, added);
  return added;
}

/** Agent joins: the AI stops; the user sees "Connected, Agent: <name>" with the agent's photo. */
export async function agentJoin(ctx, conv, agent) {
  await setStatus(ctx, conv, { status: 'human', assigned_agent_id: agent.id });
  return addMessage(ctx, conv, { sender: 'system', agentId: agent.id, body: t(conv.language, 'chatsys.agent_joined', { name: agent.display_name }) });
}

export async function handBack(ctx, conv) {
  await setStatus(ctx, conv, { status: 'ai', assigned_agent_id: null, ai_unsure_count: 0 });
  return addMessage(ctx, conv, { sender: 'system', body: t(conv.language, 'chatsys.handed_back') });
}

export async function closeConversation(ctx, conv, by, { message = true } = {}) {
  const now = ctx.clock.now();
  if (message && by !== 'user') await addMessage(ctx, conv, { sender: 'system', body: t(conv.language, by === 'ai' ? 'chatsys.closed_inactive' : 'chatsys.closed') });
  await setStatus(ctx, conv, { status: 'closed', closed_at: now, closed_by: by });
}

/** Job: warn after N minutes without a reply from the user, close after a further M minutes. */
export async function chatInactivity(ctx) {
  const { db, clock, mailer } = ctx;
  const now = clock.now();
  const warnMin = Number(await getSetting(db, 'chat_inactivity_warn_minutes', 5));
  const closeMin = Number(await getSetting(db, 'chat_autoclose_minutes', 5));
  const open = await db('chat_conversations').whereIn('status', ['ai', 'human']);
  let n = 0;
  for (const conv of open) {
    const last = await db('chat_messages').where({ conversation_id: conv.id, is_internal_note: false }).orderBy('id', 'desc').first('sender_type', 'created_at');
    if (!last || last.sender_type === 'user') continue; // we owe the reply, not them
    if (!conv.inactivity_warned_at) {
      if (now - new Date(last.created_at) < warnMin * MIN) continue;
      await addMessage(ctx, conv, { sender: 'system', body: t(conv.language, 'chatsys.inactive_warning') });
      await db('chat_conversations').where({ id: conv.id }).update({ inactivity_warned_at: now });
      const user = await db('users').where({ id: conv.user_id }).first('id', 'email', 'language', 'notify_prefs');
      let prefs = {};
      try { prefs = typeof user?.notify_prefs === 'string' ? JSON.parse(user.notify_prefs) : (user?.notify_prefs || {}); } catch { /* default on */ }
      if (user?.email && prefs?.email?.chat !== false) await mailer.send('chat_inactivity', user, {});
      n += 1;
    } else if (now - new Date(conv.inactivity_warned_at) >= closeMin * MIN) {
      await closeConversation(ctx, conv, 'ai');
      n += 1;
    }
  }
  return n;
}

/** Job: images are deleted 7 days after upload; closed chats 7 days after closing (unless legal hold). */
export async function chatRetention(ctx) {
  const { db, cfg, clock } = ctx;
  const cutoff = new Date(clock.now().getTime() - 7 * 24 * 60 * MIN);
  let n = 0;
  const old = await db('chat_attachments as a').join('chat_conversations as c', 'c.id', 'a.conversation_id')
    .whereNull('a.purged_at').where('a.created_at', '<', cutoff).where('c.legal_hold', false).select('a.*');
  for (const a of old) {
    for (const k of [a.storage_key, a.thumb_key]) if (k && /^[0-9a-f-]{36}\.jpg$/.test(k)) await fs.rm(path.join(chatDir(cfg.UPLOAD_DIR), k), { force: true });
    await db('chat_attachments').where({ id: a.id }).update({ purged_at: clock.now(), storage_key: '', thumb_key: null });
    n += 1;
  }
  const closed = await db('chat_conversations').where({ status: 'closed', legal_hold: false }).where('closed_at', '<', cutoff).pluck('id');
  if (closed.length) {
    const files = await db('chat_attachments').whereIn('conversation_id', closed).whereNull('purged_at').pluck('storage_key');
    for (const k of files) if (/^[0-9a-f-]{36}\.jpg$/.test(k)) await fs.rm(path.join(chatDir(cfg.UPLOAD_DIR), k), { force: true });
    await db('chat_attachments').whereIn('conversation_id', closed).del();
    await db('chat_messages').whereIn('conversation_id', closed).del();
    await db('chat_conversations').whereIn('id', closed).del();
    n += closed.length;
  }
  return n;
}
