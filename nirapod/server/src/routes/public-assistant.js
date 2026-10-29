// Landing page AI-only chat widget (admin switch landing_ai_chat_enabled, default off). Anonymous, no account data:
// the AI answers only from the knowledge base, with the same hard rules and redaction. Rate-limited per IP; the
// global daily cost cap applies. Nothing is stored except usage counters.
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { getSetting } from '../settings.js';
import { HARD_RULES, redact, aiSettings, createOpenAiProvider } from '../chat/assistant.js';

export function publicAssistantRouter(ctx) {
  const { db, cfg, clock } = ctx;
  const r = Router();
  r.post('/public/assistant', limiter({ windowMs: 60_000, limit: 6 }), limiter({ windowMs: 24 * 3600_000, limit: 40 }), ah(async (req, res) => {
    if (!(await getSetting(db, 'landing_ai_chat_enabled', false))) throw new ApiError('FEATURE_DISABLED');
    const b = parse(z.object({
      message: z.string().trim().min(1).max(800),
      language: z.enum(['en', 'bn']).default('en'),
      history: z.array(z.object({ from: z.enum(['user', 'ai']), text: z.string().max(1500) })).max(8).default([]),
    }), req.body);
    const ai = await aiSettings(db, cfg);
    if (!ai.enabled) throw new ApiError('FEATURE_DISABLED');
    const now = clock.now();
    const day = now.toISOString().slice(0, 10);
    const spent = await db('ai_usage').where({ usage_date: day }).sum({ s: 'cost_usd_micros' }).first();
    if (Number(spent?.s ?? 0) >= ai.costCapUsd * 1e6) throw new ApiError('FEATURE_DISABLED');
    let kb = await db('kb_articles').where({ is_published: true, language: b.language }).select('title', 'body');
    if (b.language !== 'en') kb = kb.concat(await db('kb_articles').where({ is_published: true, language: 'en' }).select('title', 'body'));
    const kbText = kb.slice(0, 30).map((a) => `## ${a.title}\n${a.body}`).join('\n\n').slice(0, 10_000);
    const messages = [
      { role: 'system', content: `${HARD_RULES}\nThis is the public website chat: the visitor is not signed in and you know nothing about any account. For account problems, tell them to use Live chat in the app.\nReply in language code ${b.language}.\nKNOWLEDGE BASE:\n${kbText || '(empty)'}` },
      ...b.history.map((m) => (m.from === 'user' ? { role: 'user', content: `<user_message>${redact(m.text)}</user_message>` } : { role: 'assistant', content: redact(m.text) })),
      { role: 'user', content: `<user_message>${redact(b.message)}</user_message>` },
    ];
    const provider = ctx.aiProvider ?? createOpenAiProvider();
    let out;
    try {
      out = await provider.complete({ apiKey: ai.apiKey, model: ai.model, temperature: ai.temperature, maxTokens: Math.min(ai.maxTokens, 400), messages });
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
    await db('ai_usage').insert({ conversation_id: null, user_id: null, usage_date: day, model: ai.model, prompt_tokens: out.promptTokens, completion_tokens: out.completionTokens, cost_usd_micros: Math.round(out.promptTokens * 2.5 + out.completionTokens * 10), created_at: now });
    res.json({ reply: redact(String(out.text || '').replace(/^\[UNSURE\]\s*/, '')).slice(0, 2000) });
  }));
  return r;
}
