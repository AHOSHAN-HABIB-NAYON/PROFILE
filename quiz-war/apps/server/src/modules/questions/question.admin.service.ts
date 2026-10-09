import { questionInputSchema, type QuestionInput } from '@quizwar/shared';
import type { PoolConnection } from 'mysql2/promise';
import { exec, query, queryOne, tx } from '../../db/pool';
import { badRequest, notFound } from '../../lib/errors';
import { parseCsv, toCsv } from './csv';

export const CSV_HEADER = ['category', 'difficulty', 'language', 'text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation', 'hint', 'image_url'];

export interface QuestionFilter {
  q?: string;
  categoryId?: number;
  difficulty?: string;
  active?: boolean;
  review?: 'approved' | 'pending' | 'rejected';
  aiJobId?: number;
  page: number;
  pageSize: number;
}

export interface QuestionOrigin {
  source?: 'manual' | 'import' | 'ai';
  reviewStatus?: 'approved' | 'pending';
  aiJobId?: number;
  sourceRefs?: string[];
}

function parseRefs(v: unknown): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(String(v));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

export class QuestionAdminService {
  async list(f: QuestionFilter) {
    const where = ['q.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (f.q) (where.push('q.text LIKE ?'), params.push(`%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    if (f.categoryId) (where.push('q.category_id = ?'), params.push(f.categoryId));
    if (f.difficulty) (where.push('q.difficulty = ?'), params.push(f.difficulty));
    if (f.active !== undefined) (where.push('q.is_active = ?'), params.push(f.active ? 1 : 0));
    where.push('q.review_status = ?');
    params.push(f.review ?? 'approved');
    if (f.aiJobId) (where.push('q.ai_job_id = ?'), params.push(f.aiJobId));
    const total = await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM questions q WHERE ${where.join(' AND ')}`, params);
    const rows = await query<any>(
      `SELECT q.id, q.category_id AS categoryId, c.name AS category, q.difficulty, q.language, q.text, q.is_active AS isActive, q.image_url AS imageUrl,
              q.review_status AS reviewStatus, q.source, q.source_refs AS sourceRefs, q.explanation, q.ai_job_id AS aiJobId, q.updated_at AS updatedAt, s.times_shown AS shown, s.correct_count AS correctCount, s.wrong_count AS wrongCount,
              s.timeout_count AS timeoutCount, s.total_response_ms AS totalMs
       FROM questions q JOIN categories c ON c.id = q.category_id LEFT JOIN question_stats s ON s.question_id = q.id
       WHERE ${where.join(' AND ')} ORDER BY q.id DESC LIMIT ? OFFSET ?`,
      [...params, f.pageSize, (f.page - 1) * f.pageSize],
    );
    const opts = rows.length
      ? await query<any>('SELECT question_id, option_index, text, is_correct FROM question_options WHERE question_id IN (?) ORDER BY question_id, option_index', [rows.map((r) => r.id)])
      : [];
    for (const r of rows) {
      const own = opts.filter((o) => Number(o.question_id) === Number(r.id));
      r.options = own.map((o) => o.text);
      r.correctIndex = own.findIndex((o) => o.is_correct);
    }
    return {
      total: Number(total?.n ?? 0),
      items: rows.map((r) => {
        const answered = Number(r.correctCount ?? 0) + Number(r.wrongCount ?? 0) + Number(r.timeoutCount ?? 0);
        return {
          ...r,
          isActive: !!r.isActive,
          sourceRefs: parseRefs(r.sourceRefs),
          stats: {
            shown: Number(r.shown ?? 0),
            correct: Number(r.correctCount ?? 0),
            wrong: Number(r.wrongCount ?? 0),
            accuracy: answered ? Math.round((Number(r.correctCount) / answered) * 1000) / 10 : null,
            avgResponseMs: answered ? Math.round(Number(r.totalMs) / answered) : null,
          },
        };
      }),
    };
  }

  async get(id: number) {
    const q = await queryOne<any>(
      `SELECT id, category_id AS categoryId, difficulty, language, text, explanation, hint, image_url AS imageUrl, is_active AS isActive, tags
       FROM questions WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!q) throw notFound('Question not found');
    const opts = await query<any>('SELECT option_index, text, is_correct FROM question_options WHERE question_id = ? ORDER BY option_index', [id]);
    return {
      ...q,
      isActive: !!q.isActive,
      tags: q.tags ? String(q.tags).split(',') : [],
      options: opts.map((o) => o.text),
      correctIndex: opts.findIndex((o) => o.is_correct),
    };
  }

  private async write(conn: PoolConnection, input: QuestionInput, adminId: number | null, id?: number, origin: QuestionOrigin = {}) {
    const cat = await queryOne('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL', [input.categoryId], conn);
    if (!cat) throw badRequest('Category not found');
    const unique = new Set(input.options.map((o) => o.trim().toLowerCase()));
    if (unique.size !== input.options.length) throw badRequest('Options must be different from each other');
    const values = [input.categoryId, input.difficulty, input.language, input.text, input.explanation ?? null, input.hint ?? null, input.imageUrl ?? null, input.tags?.join(',') ?? null, input.isActive ? 1 : 0];
    if (id) {
      await exec(
        `UPDATE questions SET category_id = ?, difficulty = ?, language = ?, text = ?, explanation = ?, hint = ?, image_url = ?, tags = ?, is_active = ?, updated_by_admin_id = ? WHERE id = ?`,
        [...values, adminId, id],
        conn,
      );
      await exec('DELETE FROM question_options WHERE question_id = ?', [id], conn);
    } else {
      const res = await exec(
        `INSERT INTO questions (category_id, difficulty, language, text, explanation, hint, image_url, tags, is_active, created_by_admin_id, source, review_status, ai_job_id, source_refs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, adminId, origin.source ?? 'manual', origin.reviewStatus ?? 'approved', origin.aiJobId ?? null, origin.sourceRefs?.length ? JSON.stringify(origin.sourceRefs) : null],
        conn,
      );
      id = res.insertId;
    }
    await exec(
      'INSERT INTO question_options (question_id, option_index, text, is_correct) VALUES ?',
      [input.options.map((t, i) => [id, i, t, i === input.correctIndex ? 1 : 0])],
      conn,
    );
    return id!;
  }

  async create(input: QuestionInput, adminId: number | null, origin: QuestionOrigin = {}) {
    return tx((conn) => this.write(conn, input, adminId, undefined, origin));
  }

  /** Review queue: approve (goes live) or reject AI-generated questions. */
  async review(ids: number[], action: 'approve' | 'reject', adminId: number | null) {
    if (!ids.length) return 0;
    const res = await exec(
      `UPDATE questions SET review_status = ?, is_active = ?, updated_by_admin_id = ? WHERE id IN (?) AND deleted_at IS NULL AND review_status = 'pending'`,
      [action === 'approve' ? 'approved' : 'rejected', action === 'approve' ? 1 : 0, adminId, ids],
    );
    return res.affectedRows;
  }

  /** Question bank size per category, so admins can see where more questions are needed. */
  async bankStats() {
    return query<any>(
      `SELECT c.id, c.name, c.name_bn AS nameBn, c.icon,
              SUM(q.review_status = 'approved' AND q.is_active = 1) AS live,
              SUM(q.review_status = 'pending') AS pending,
              SUM(q.review_status = 'approved' AND q.is_active = 1 AND q.created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS last30
       FROM categories c LEFT JOIN questions q ON q.category_id = c.id AND q.deleted_at IS NULL
       WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.sort_order, c.id`,
    ).then((rows) => rows.map((r) => ({ ...r, live: Number(r.live ?? 0), pending: Number(r.pending ?? 0), last30: Number(r.last30 ?? 0) })));
  }

  async update(id: number, input: QuestionInput, adminId: number | null) {
    await this.get(id);
    await tx((conn) => this.write(conn, input, adminId, id));
  }

  async remove(id: number) {
    await exec('UPDATE questions SET deleted_at = UTC_TIMESTAMP(), is_active = 0 WHERE id = ?', [id]);
  }

  async setActive(id: number, active: boolean) {
    await exec('UPDATE questions SET is_active = ? WHERE id = ? AND deleted_at IS NULL', [active ? 1 : 0, id]);
  }

  async duplicate(id: number, adminId: number | null) {
    const q = await this.get(id);
    return this.create({ ...q, text: `${q.text} (copy)`, isActive: false }, adminId);
  }

  /** Bulk import. Rows are validated individually; valid rows are inserted, invalid ones reported. */
  async import(format: 'csv' | 'json', payload: string, adminId: number | null) {
    const cats = await query<{ id: number; slug: string; name: string }>('SELECT id, slug, name FROM categories WHERE deleted_at IS NULL');
    const findCat = (v: unknown) => {
      const s = String(v ?? '').trim().toLowerCase();
      return cats.find((c) => String(c.id) === s || c.slug.toLowerCase() === s || c.name.toLowerCase() === s)?.id;
    };
    let records: any[];
    if (format === 'json') {
      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw badRequest('Invalid JSON');
      }
      records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    } else {
      const rows = parseCsv(payload);
      const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
      if (!CSV_HEADER.slice(0, 9).every((h) => header.includes(h))) throw badRequest(`CSV header must include: ${CSV_HEADER.join(', ')}`);
      records = rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
      records = records.map((r) => ({
        category: r.category,
        difficulty: r.difficulty?.toLowerCase(),
        language: r.language?.toLowerCase() || 'bn',
        text: r.text,
        options: [r.option_a, r.option_b, r.option_c, r.option_d],
        correct: r.correct,
        explanation: r.explanation || null,
        hint: r.hint || null,
        imageUrl: r.image_url || null,
      }));
    }
    if (records.length > 5000) throw badRequest('Import at most 5000 questions at a time');
    let created = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const correctRaw = r.correctIndex ?? r.correct;
      const correctIndex = typeof correctRaw === 'number' ? correctRaw : 'ABCD'.indexOf(String(correctRaw ?? '').trim().toUpperCase());
      const parsed = questionInputSchema.safeParse({
        categoryId: findCat(r.categoryId ?? r.category),
        difficulty: r.difficulty,
        language: r.language ?? 'bn',
        text: r.text,
        options: r.options,
        correctIndex: correctIndex >= 0 ? correctIndex : Number(correctRaw),
        explanation: r.explanation ?? null,
        hint: r.hint ?? null,
        imageUrl: r.imageUrl ?? null,
        isActive: r.isActive ?? true,
      });
      if (!parsed.success) {
        errors.push({ row: i + 1, message: parsed.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`).join('; ') });
        continue;
      }
      const dup = await queryOne('SELECT id FROM questions WHERE category_id = ? AND text = ? AND deleted_at IS NULL LIMIT 1', [parsed.data.categoryId, parsed.data.text]);
      if (dup) {
        skipped++;
        continue;
      }
      try {
        await this.create(parsed.data, adminId, { source: 'import' });
        created++;
      } catch (err: any) {
        errors.push({ row: i + 1, message: err?.message ?? 'Failed' });
      }
    }
    return { total: records.length, created, skipped, errors: errors.slice(0, 200) };
  }

  async export(format: 'csv' | 'json', categoryId?: number) {
    const rows = await query<any>(
      `SELECT q.id, c.slug AS category, q.difficulty, q.language, q.text, q.explanation, q.hint, q.image_url, q.is_active
       FROM questions q JOIN categories c ON c.id = q.category_id WHERE q.deleted_at IS NULL ${categoryId ? 'AND q.category_id = ?' : ''} ORDER BY q.id LIMIT 50000`,
      categoryId ? [categoryId] : [],
    );
    const opts = rows.length
      ? await query<any>('SELECT question_id, option_index, text, is_correct FROM question_options WHERE question_id IN (?) ORDER BY question_id, option_index', [rows.map((r) => r.id)])
      : [];
    const byQ = new Map<number, any[]>();
    for (const o of opts) byQ.set(Number(o.question_id), [...(byQ.get(Number(o.question_id)) ?? []), o]);
    const data = rows.map((r) => {
      const os = byQ.get(Number(r.id)) ?? [];
      return {
        category: r.category,
        difficulty: r.difficulty,
        language: r.language,
        text: r.text,
        options: os.map((o) => o.text),
        correctIndex: os.findIndex((o) => o.is_correct),
        explanation: r.explanation,
        hint: r.hint,
        imageUrl: r.image_url,
        isActive: !!r.is_active,
      };
    });
    if (format === 'json') return JSON.stringify({ questions: data }, null, 2);
    return toCsv([
      CSV_HEADER,
      ...data.map((d) => [d.category, d.difficulty, d.language, d.text, ...[0, 1, 2, 3].map((i) => d.options[i] ?? ''), 'ABCD'[d.correctIndex] ?? '', d.explanation, d.hint, d.imageUrl]),
    ]);
  }
}
