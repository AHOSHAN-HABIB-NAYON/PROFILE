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
  page: number;
  pageSize: number;
}

export class QuestionAdminService {
  async list(f: QuestionFilter) {
    const where = ['q.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (f.q) (where.push('q.text LIKE ?'), params.push(`%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    if (f.categoryId) (where.push('q.category_id = ?'), params.push(f.categoryId));
    if (f.difficulty) (where.push('q.difficulty = ?'), params.push(f.difficulty));
    if (f.active !== undefined) (where.push('q.is_active = ?'), params.push(f.active ? 1 : 0));
    const total = await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM questions q WHERE ${where.join(' AND ')}`, params);
    const rows = await query<any>(
      `SELECT q.id, q.category_id AS categoryId, c.name AS category, q.difficulty, q.language, q.text, q.is_active AS isActive, q.image_url AS imageUrl,
              q.updated_at AS updatedAt, s.times_shown AS shown, s.correct_count AS correctCount, s.wrong_count AS wrongCount,
              s.timeout_count AS timeoutCount, s.total_response_ms AS totalMs
       FROM questions q JOIN categories c ON c.id = q.category_id LEFT JOIN question_stats s ON s.question_id = q.id
       WHERE ${where.join(' AND ')} ORDER BY q.id DESC LIMIT ? OFFSET ?`,
      [...params, f.pageSize, (f.page - 1) * f.pageSize],
    );
    return {
      total: Number(total?.n ?? 0),
      items: rows.map((r) => {
        const answered = Number(r.correctCount ?? 0) + Number(r.wrongCount ?? 0) + Number(r.timeoutCount ?? 0);
        return {
          ...r,
          isActive: !!r.isActive,
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

  private async write(conn: PoolConnection, input: QuestionInput, adminId: number | null, id?: number) {
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
        `INSERT INTO questions (category_id, difficulty, language, text, explanation, hint, image_url, tags, is_active, created_by_admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, adminId],
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

  async create(input: QuestionInput, adminId: number | null) {
    return tx((conn) => this.write(conn, input, adminId));
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
        await this.create(parsed.data, adminId);
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
