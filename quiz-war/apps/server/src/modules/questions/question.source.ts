import type { Difficulty } from '@quizwar/shared';
import { exec, query } from '../../db/pool';
import type { EngineQuestion, PickOptions, QuestionSource } from '../../game/types';

const ACTIVE = `q.is_active = 1 AND q.review_status = 'approved' AND q.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL`;

/** A question counts as "seen" only inside the player's current rotation of its category. */
const SEEN_IN_CYCLE = `SELECT 1 FROM user_seen_questions s
  LEFT JOIN user_question_cycles uc ON uc.user_id = s.user_id AND uc.category_id = s.category_id
  WHERE s.question_id = q.id AND s.user_id IN (?) AND s.seen_at >= COALESCE(uc.cycle_start, '1970-01-01')`;

function shuffle<T>(arr: T[], rnd = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * MySQL question picker with per-player rotation: a player never gets a question again until
 * they have been through every question of that category. Once a category is exhausted their
 * next rotation starts, beginning with the questions they saw longest ago. Within a rotation
 * the order is random, and option order is shuffled per match so answer positions can't be
 * memorised or shared.
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
      params.push(o.excludeIds);
    }
    const from = 'FROM questions q JOIN categories c ON c.id = q.category_id';
    const cond = where.join(' AND ');
    const humans = [...new Set(o.userIds.filter((id) => id > 0))];

    if (!humans.length) {
      const rows = await query<{ id: number }>(`SELECT q.id ${from} WHERE ${cond} ORDER BY RAND() LIMIT ?`, [...params, o.count]);
      ids = rows.map((r) => Number(r.id));
    } else {
      // 1) Questions none of the players has seen in their current rotation, in random order.
      const fresh = await query<{ id: number }>(`SELECT q.id ${from} WHERE ${cond} AND NOT EXISTS (${SEEN_IN_CYCLE}) ORDER BY RAND() LIMIT ?`, [
        ...params,
        humans,
        o.count,
      ]);
      ids = fresh.map((r) => Number(r.id));
      if (ids.length < o.count) {
        // 2) Someone has played the whole bank: start their next rotation and repeat the
        //    questions they saw longest ago first.
        await this.startNextRotation(humans, o, from, cond, params);
        const old = await query<{ id: number }>(
          `SELECT q.id ${from} LEFT JOIN user_seen_questions s ON s.question_id = q.id AND s.user_id IN (?)
           WHERE ${cond} ${ids.length ? 'AND q.id NOT IN (?)' : ''}
           GROUP BY q.id ORDER BY MAX(s.seen_at) IS NOT NULL, MAX(s.seen_at), RAND() LIMIT ?`,
          [humans, ...params, ...(ids.length ? [ids] : []), o.count - ids.length],
        );
        ids = ids.concat(shuffle(old.map((r) => Number(r.id))));
      }
    }
    return this.byIds(ids, true);
  }

  /** Players who can no longer fill a match from unseen questions begin a new rotation. */
  private async startNextRotation(humans: number[], o: PickOptions, from: string, cond: string, params: unknown[]) {
    for (const userId of humans) {
      const left = await query<{ n: number }>(`SELECT COUNT(*) n FROM (SELECT q.id ${from} WHERE ${cond} AND NOT EXISTS (${SEEN_IN_CYCLE}) LIMIT ?) t`, [
        ...params,
        [userId],
        o.count,
      ]);
      if (Number(left[0]?.n ?? 0) >= o.count) continue;
      await exec(
        `INSERT INTO user_question_cycles (user_id, category_id, cycle, cycle_start)
         SELECT ?, c.id, 2, UTC_TIMESTAMP() FROM categories c WHERE c.deleted_at IS NULL ${o.categoryId ? 'AND c.id = ?' : ''}
         ON DUPLICATE KEY UPDATE cycle = cycle + 1, cycle_start = UTC_TIMESTAMP()`,
        o.categoryId ? [userId, o.categoryId] : [userId],
      );
    }
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
