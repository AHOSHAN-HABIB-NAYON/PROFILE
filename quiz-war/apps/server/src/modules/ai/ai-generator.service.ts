import { DIFFICULTIES, questionInputSchema, type Difficulty } from '@quizwar/shared';
import { z } from 'zod';
import { exec, parseJson, query, queryOne } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../lib/errors';
import type { QuestionAdminService } from '../questions/question.admin.service';
import { DEFAULT_CATEGORY_GUIDES, DEFAULT_SYSTEM_PROMPT } from './prompts';

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(80),
  webSearch: z.boolean(),
  reasoningEffort: z.enum(['default', 'low', 'medium', 'high']),
  /** Questions requested per API call (smaller batches = better quality and fewer timeouts). */
  batchSize: z.number().int().min(3).max(25),
  /** Skip the review queue and publish generated questions immediately (not recommended). */
  autoApprove: z.boolean(),
  systemPrompt: z.string().max(20000),
  /** Extra syllabus guidance per category slug. Empty = built-in default. */
  categoryGuides: z.record(z.string(), z.string().max(4000)),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  model: 'gpt-5.6-luna',
  webSearch: true,
  reasoningEffort: 'medium',
  batchSize: 10,
  autoApprove: false,
  systemPrompt: '',
  categoryGuides: {},
};

export const aiJobInputSchema = z.object({
  categoryId: z.number().int().positive(),
  topic: z.string().trim().max(300).optional().nullable(),
  difficulty: z.enum(['mixed', ...DIFFICULTIES]).default('mixed'),
  language: z.enum(['bn', 'en']).default('bn'),
  count: z.number().int().min(1).max(200),
  instructions: z.string().trim().max(2000).optional().nullable(),
  webSearch: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
});
export type AiJobInput = z.infer<typeof aiJobInputSchema>;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'options', 'correctIndex', 'explanation', 'difficulty', 'subtopic', 'sources'],
        properties: {
          text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctIndex: { type: 'integer' },
          explanation: { type: 'string' },
          difficulty: { type: 'string', enum: [...DIFFICULTIES] },
          subtopic: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: string;
  subtopic: string;
  sources: string[];
}

/** Normalises text for duplicate detection: case, spaces, punctuation and digit style. */
export function normalizeQuestion(s: string) {
  const bnDigits = '০১২৩৪৫৬৭৮৯';
  return s
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(bnDigits.indexOf(d)))
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

type Fetch = typeof fetch;

/**
 * Generates exam-style questions with the OpenAI Responses API (web search + structured
 * output). Jobs run one at a time in the background; results land in the review queue
 * (questions.review_status = 'pending') unless auto-approve is on.
 */
export class AiGeneratorService {
  private cache: AiSettings | null = null;
  private running = false;

  constructor(
    private readonly cfg: { apiKey?: string; baseUrl: string },
    private readonly questions: QuestionAdminService,
    private readonly log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  get configured() {
    return !!this.cfg.apiKey;
  }

  /* ------------------------------- Settings ------------------------------- */

  async settings(): Promise<AiSettings> {
    if (this.cache) return this.cache;
    const row = await queryOne<{ value: unknown }>(`SELECT value FROM settings WHERE setting_key = 'ai_generator'`);
    const parsed = aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, ...(parseJson<object>(row?.value) ?? {}) });
    this.cache = parsed.success ? parsed.data : { ...DEFAULT_AI_SETTINGS };
    return this.cache;
  }

  async updateSettings(patch: Partial<AiSettings>, adminId: number | null) {
    const next = aiSettingsSchema.parse({ ...(await this.settings()), ...patch });
    await exec(
      `INSERT INTO settings (setting_key, value, updated_by_admin_id) VALUES ('ai_generator', ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by_admin_id = VALUES(updated_by_admin_id)`,
      [JSON.stringify(next), adminId],
    );
    this.cache = next;
    return next;
  }

  defaults() {
    return { systemPrompt: DEFAULT_SYSTEM_PROMPT, categoryGuides: DEFAULT_CATEGORY_GUIDES, model: DEFAULT_AI_SETTINGS.model };
  }

  /* --------------------------------- Jobs --------------------------------- */

  /** Called on startup: jobs interrupted by a restart are marked failed, queued ones resume. */
  async recover() {
    await exec(`UPDATE ai_generation_jobs SET status = 'failed', error = 'Server restarted while the job was running', finished_at = UTC_TIMESTAMP() WHERE status = 'running'`);
    void this.pump();
  }

  async createJob(input: AiJobInput, adminId: number | null) {
    if (!this.configured) throw new AppError(400, 'ai_not_configured', 'OPENAI_API_KEY is not set on the server');
    const s = await this.settings();
    if (!s.enabled) throw new AppError(400, 'ai_disabled', 'The AI generator is turned off in AI settings');
    const cat = await queryOne('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL', [input.categoryId]);
    if (!cat) throw badRequest('Category not found');
    const res = await exec(
      `INSERT INTO ai_generation_jobs (admin_id, category_id, topic, difficulty, language, requested, model, web_search, auto_approve, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        input.categoryId,
        input.topic || null,
        input.difficulty,
        input.language,
        input.count,
        s.model,
        (input.webSearch ?? s.webSearch) ? 1 : 0,
        (input.autoApprove ?? s.autoApprove) ? 1 : 0,
        input.instructions || null,
      ],
    );
    void this.pump();
    return res.insertId;
  }

  async listJobs() {
    const rows = await query<any>(
      `SELECT j.id, j.category_id AS categoryId, c.name AS category, j.topic, j.difficulty, j.language, j.requested, j.created_count AS created,
              j.duplicate_count AS duplicates, j.invalid_count AS invalid, j.status, j.model, j.web_search AS webSearch, j.auto_approve AS autoApprove,
              j.error, j.input_tokens AS inputTokens, j.output_tokens AS outputTokens, j.created_at AS createdAt, j.finished_at AS finishedAt,
              (SELECT COUNT(*) FROM questions q WHERE q.ai_job_id = j.id AND q.review_status = 'pending' AND q.deleted_at IS NULL) AS pending
       FROM ai_generation_jobs j JOIN categories c ON c.id = j.category_id ORDER BY j.id DESC LIMIT 40`,
    );
    return rows.map((r) => ({ ...r, webSearch: !!r.webSearch, autoApprove: !!r.autoApprove, pending: Number(r.pending) }));
  }

  async cancelJob(id: number) {
    const res = await exec(`UPDATE ai_generation_jobs SET status = 'cancelled', finished_at = UTC_TIMESTAMP() WHERE id = ? AND status IN ('queued','running')`, [id]);
    if (!res.affectedRows) throw notFound('No running job with that id');
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = await queryOne<any>(`SELECT * FROM ai_generation_jobs WHERE status = 'queued' ORDER BY id LIMIT 1`);
        if (!job) break;
        await this.runJob(job).catch(async (err) => {
          this.log.error({ err, jobId: job.id }, 'ai generation job failed');
          await exec(`UPDATE ai_generation_jobs SET status = 'failed', error = ?, finished_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'running'`, [
            String(err?.message ?? err).slice(0, 1000),
            job.id,
          ]);
        });
      }
    } finally {
      this.running = false;
    }
  }

  private async runJob(job: any) {
    await exec(`UPDATE ai_generation_jobs SET status = 'running', started_at = UTC_TIMESTAMP() WHERE id = ?`, [job.id]);
    const s = await this.settings();
    const cat = await queryOne<any>('SELECT id, slug, name, name_bn, description FROM categories WHERE id = ?', [job.category_id]);
    const existing = await query<{ text: string }>('SELECT text FROM questions WHERE category_id = ? AND deleted_at IS NULL ORDER BY id DESC', [job.category_id]);
    const seen = new Set(existing.map((r) => normalizeQuestion(r.text)));
    // Recent questions are shown to the model so it writes new facts instead of near-duplicates.
    const avoid = existing.slice(0, 80).map((r) => r.text);

    let created = 0;
    let duplicates = 0;
    let invalid = 0;
    let emptyRounds = 0;
    while (created < job.requested && emptyRounds < 3) {
      const state = await queryOne<{ status: string }>('SELECT status FROM ai_generation_jobs WHERE id = ?', [job.id]);
      if (state?.status !== 'running') return; // cancelled
      const want = Math.min(s.batchSize, job.requested - created);
      const { questions, usage } = await this.generateBatch(s, job, cat, want, avoid);
      await exec('UPDATE ai_generation_jobs SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE id = ?', [usage.input, usage.output, job.id]);

      let added = 0;
      for (const g of questions) {
        if (created >= job.requested) break;
        const key = normalizeQuestion(g.text ?? '');
        if (!key || seen.has(key)) {
          duplicates++;
          continue;
        }
        const difficulty = (job.difficulty !== 'mixed' ? job.difficulty : DIFFICULTIES.includes(g.difficulty as Difficulty) ? g.difficulty : 'medium') as Difficulty;
        const parsed = questionInputSchema.safeParse({
          categoryId: job.category_id,
          difficulty,
          language: job.language,
          text: g.text?.trim(),
          options: (g.options ?? []).map((o) => String(o).trim()),
          correctIndex: g.correctIndex,
          explanation: g.explanation?.trim() || null,
          hint: null,
          imageUrl: null,
          tags: g.subtopic ? [g.subtopic.slice(0, 40).replace(/,/g, ' ')] : [],
          isActive: !!job.auto_approve,
        });
        const opts = parsed.success ? parsed.data.options : [];
        if (!parsed.success || opts.length !== 4 || new Set(opts.map((o) => o.toLowerCase())).size !== 4 || opts.some((o) => o.length > 300)) {
          invalid++;
          continue;
        }
        try {
          await this.questions.create(parsed.data, job.admin_id, {
            source: 'ai',
            reviewStatus: job.auto_approve ? 'approved' : 'pending',
            aiJobId: job.id,
            sourceRefs: (g.sources ?? []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 3),
          });
          seen.add(key);
          avoid.unshift(parsed.data.text);
          created++;
          added++;
        } catch {
          invalid++;
        }
      }
      emptyRounds = added === 0 ? emptyRounds + 1 : 0;
      await exec('UPDATE ai_generation_jobs SET created_count = ?, duplicate_count = ?, invalid_count = ? WHERE id = ?', [created, duplicates, invalid, job.id]);
    }
    await exec(
      `UPDATE ai_generation_jobs SET status = 'done', finished_at = UTC_TIMESTAMP(), error = ? WHERE id = ? AND status = 'running'`,
      [created < job.requested ? `Stopped after ${created}: the model kept returning duplicates or invalid questions. Try a narrower topic.` : null, job.id],
    );
    this.log.info({ jobId: job.id, created, duplicates, invalid }, 'ai generation job finished');
  }

  /* ------------------------------- OpenAI --------------------------------- */

  private buildPrompt(s: AiSettings, job: any, cat: any, count: number, avoid: string[]) {
    const guide = s.categoryGuides[cat.slug]?.trim() || DEFAULT_CATEGORY_GUIDES[cat.slug] || cat.description || '';
    const lang = job.language === 'bn' ? 'Bangla (বাংলা)' : 'English';
    const diff = job.difficulty === 'mixed' ? 'a balanced mix: about 30% easy, 40% medium, 20% hard, 10% expert' : job.difficulty;
    return [
      `Write ${count} NEW multiple-choice questions.`,
      `CATEGORY: ${cat.name}${cat.name_bn ? ` (${cat.name_bn})` : ''}`,
      guide ? `SYLLABUS FOCUS: ${guide}` : '',
      job.topic ? `TOPIC (stay inside this topic): ${job.topic}` : 'TOPIC: spread the questions across the whole syllabus above.',
      `DIFFICULTY: ${diff}`,
      `LANGUAGE: ${lang} — question, options and explanation all in this language.`,
      'Each question has exactly 4 options and correctIndex is the 0-based index of the correct option. Put the correct answer at a random position.',
      job.instructions ? `EXTRA INSTRUCTIONS FROM THE ADMIN: ${job.instructions}` : '',
      avoid.length ? `AVOID — these questions already exist, do not repeat them or ask the same fact:\n${avoid.slice(0, 120).map((t) => `- ${t.slice(0, 160)}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async generateBatch(s: AiSettings, job: any, cat: any, count: number, avoid: string[]) {
    const instructions = s.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
    const input = this.buildPrompt(s, job, cat, count, avoid);
    const body: Record<string, any> = {
      model: job.model || s.model,
      instructions,
      input,
      text: { format: { type: 'json_schema', name: 'quiz_questions', strict: true, schema: OUTPUT_SCHEMA } },
    };
    if (job.web_search) body.tools = [{ type: 'web_search' }];
    if (s.reasoningEffort !== 'default') body.reasoning = { effort: s.reasoningEffort };
    const data = await this.call(body);
    const text = outputText(data);
    let parsed: { questions?: GeneratedQuestion[] } = {};
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      throw new Error('The model did not return valid JSON');
    }
    return {
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      usage: { input: Number(data?.usage?.input_tokens ?? 0), output: Number(data?.usage?.output_tokens ?? 0) },
    };
  }

  /**
   * POST /responses with graceful degradation: if the chosen model rejects an optional feature
   * (reasoning effort, web search tool, strict JSON schema) the call is retried without it.
   */
  private async call(body: Record<string, any>, attempt = 0): Promise<any> {
    const res = await this.fetchImpl(`${this.cfg.baseUrl.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data?.status === 'incomplete' && !outputText(data)) throw new Error(`The model stopped early (${data?.incomplete_details?.reason ?? 'incomplete'})`);
      return data;
    }
    const msg: string = data?.error?.message ?? `HTTP ${res.status}`;
    if (attempt < 4) {
      const next = { ...body };
      if (res.status === 400 && next.reasoning && /reasoning/i.test(msg)) delete next.reasoning;
      else if (res.status === 400 && next.tools?.[0]?.type === 'web_search' && /web_search|tool/i.test(msg)) next.tools = [{ type: 'web_search_preview' }];
      else if (res.status === 400 && next.tools && /web_search|tool/i.test(msg)) delete next.tools;
      else if (res.status === 400 && next.text?.format?.type === 'json_schema' && /json_schema|text\.format|response_format/i.test(msg)) {
        next.text = { format: { type: 'json_object' } };
        next.input = `${next.input}\n\nReturn JSON exactly like: {"questions":[{"text":"","options":["","","",""],"correctIndex":0,"explanation":"","difficulty":"medium","subtopic":"","sources":[""]}]}`;
      } else if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      } else {
        throw new Error(`OpenAI: ${msg}`);
      }
      return this.call(next, attempt + 1);
    }
    throw new Error(`OpenAI: ${msg}`);
  }

  /** Quick connectivity check for the settings page. */
  async test(model?: string) {
    if (!this.configured) throw new AppError(400, 'ai_not_configured', 'OPENAI_API_KEY is not set on the server');
    const started = Date.now();
    const data = await this.call({ model: model || (await this.settings()).model, input: 'Reply with the single word: OK' });
    return { ok: true, model: data?.model ?? model, reply: outputText(data).slice(0, 100), ms: Date.now() - started };
  }
}

function outputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const c of item.content ?? []) if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
  }
  return parts.join('');
}
