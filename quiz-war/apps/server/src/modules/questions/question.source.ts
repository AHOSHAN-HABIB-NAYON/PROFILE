import type { Difficulty } from '@quizwar/shared';
import { query } from '../../db/pool';
import type { EngineQuestion, PickOptions, QuestionSource } from '../../game/types';

const ACTIVE = `q.is_active = 1 AND q.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL`;

function shuffle<T>(arr: T[], rnd = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * MySQL question picker. Avoids ORDER BY RAND() over the whole table: it samples a window of
 * ids starting at a random pivot (using the (category, active, difficulty) index), removes
 * questions the players saw recently, and shuffles. Option order is shuffled per match so
 * answer positions can't be memorised or shared.
 */
export class MysqlQuestionSource implements QuestionSource {
  async pick(o: PickOptions): Promise<EngineQuestion[]> {
    let ids: number[];
    if (o.mistakesOfUserId) {
      const rows = await query<{ question_id: number }>(
        `SELECT a.question_id FROM match_answers a
         JOIN questions q ON q.id = a.question_id JOIN categories c ON c.id = q.category_id
         WHERE a.user_id = ? AND a.is_correct = 0 AND a.created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY) AND ${ACTIVE}
         ${o.categoryId ? 'AND q.category_id = ?' : ''}
         GROUP BY a.question_id ORDER BY MAX(a.id) DESC LIMIT 300`,
        o.categoryId ? [o.mistakesOfUserId, o.categoryId] : [o.mistakesOfUserId],
      );
      ids = shuffle(rows.map((r) => Number(r.question_id))).slice(0, o.count);
      return this.byIds(ids, true);
    }

    const where: string[] = [ACTIVE];
    const params: unknown[] = [];
    if (o.categoryId) {
      where.push('q.category_id = ?');
      params.push(o.categoryId);
    }
    if (o.difficulties?.length) {
      where.push('q.difficulty IN (?)');
      params.push(o.difficulties);
    }
    if (o.excludeIds?.length) {
      where.push('q.id NOT IN (?)');
      params.push(o.excludeIds.slice(-500));
    }
    const base = `FROM questions q JOIN categories c ON c.id = q.category_id WHERE ${where.join(' AND ')}`;
    const range = await query<{ lo: number | null; hi: number | null }>(`SELECT MIN(q.id) lo, MAX(q.id) hi ${base}`, params);
    const lo = Number(range[0]?.lo ?? 0);
    const hi = Number(range[0]?.hi ?? 0);
    if (!hi) return [];
    const window = Math.max(o.count * 8, 120);
    const pivot = lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1));
    const a = await query<{ id: number }>(`SELECT q.id ${base} AND q.id >= ? ORDER BY q.id LIMIT ?`, [...params, pivot, window]);
    let pool = a.map((r) => Number(r.id));
    if (pool.length < window) {
      const b = await query<{ id: number }>(`SELECT q.id ${base} AND q.id < ? ORDER BY q.id LIMIT ?`, [...params, pivot, window - pool.length]);
      pool = pool.concat(b.map((r) => Number(r.id)));
    }

    let recent = new Set<number>();
    if (o.userIds.length && pool.length > o.count) {
      const rows = await query<{ question_id: number }>(
        `SELECT DISTINCT question_id FROM match_answers WHERE user_id IN (?) AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 DAY) AND question_id IN (?)`,
        [o.userIds, pool],
      );
      recent = new Set(rows.map((r) => Number(r.question_id)));
    }
    const fresh = shuffle(pool.filter((id) => !recent.has(id)));
    const seen = shuffle(pool.filter((id) => recent.has(id)));
    ids = [...fresh, ...seen].slice(0, o.count);
    const qs = await this.byIds(ids, true);
    // keep the random order we picked
    const order = new Map(ids.map((id, i) => [id, i]));
    return qs.sort((x, y) => order.get(x.id)! - order.get(y.id)!);
  }

  async byIds(ids: number[], shuffleOptions = true): Promise<EngineQuestion[]> {
    if (!ids.length) return [];
    const rows = await query<any>(
      `SELECT q.id, q.text, q.explanation, q.hint, q.image_url, q.difficulty, c.name AS category
       FROM questions q JOIN categories c ON c.id = q.category_id WHERE q.id IN (?)`,
      [ids],
    );
    const opts = await query<{ question_id: number; option_index: number; text: string; is_correct: number }>(
      'SELECT question_id, option_index, text, is_correct FROM question_options WHERE question_id IN (?) ORDER BY question_id, option_index',
      [ids],
    );
    const byQ = new Map<number, { text: string; correct: boolean }[]>();
    for (const o of opts) {
      const list = byQ.get(Number(o.question_id)) ?? [];
      list.push({ text: o.text, correct: !!o.is_correct });
      byQ.set(Number(o.question_id), list);
    }
    const out: EngineQuestion[] = [];
    for (const r of rows) {
      const raw = byQ.get(Number(r.id));
      if (!raw || raw.length < 2 || raw.filter((x) => x.correct).length !== 1) continue;
      const order = shuffleOptions ? shuffle(raw.map((_, i) => i)) : raw.map((_, i) => i);
      const options = order.map((i) => raw[i].text);
      const correctIndex = order.findIndex((i) => raw[i].correct);
      const q: EngineQuestion & { optionOrder: number[] } = {
        id: Number(r.id),
        text: r.text,
        options,
        correctIndex,
        explanation: r.explanation,
        hint: r.hint,
        imageUrl: r.image_url,
        category: r.category,
        difficulty: r.difficulty as Difficulty,
        optionOrder: order,
      };
      out.push(q);
    }
    const pos = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  }
}
