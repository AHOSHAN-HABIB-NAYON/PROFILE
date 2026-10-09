import type { LeaderboardScope } from '@quizwar/shared';
import { query, queryOne } from '../../db/pool';
import { bdDateKey, bdMonthKey, bdWeekKey } from '../../lib/time';
import { PUBLIC_USER_COLUMNS, toPublicUser } from '../users/users.repo';
import type { SeasonService } from './season.service';

interface Opts {
  page: number;
  pageSize: number;
  categoryId?: number | null;
  viewerId?: number | null;
}

const VISIBLE = `u.status = 'active' AND p.username IS NOT NULL`;

/**
 * Paginated leaderboards (never loads everything). Results are cached briefly in memory per
 * (scope, page) key; viewer-specific parts (friends, "my rank") are not cached.
 */
export class LeaderboardService {
  private cache = new Map<string, { at: number; data: unknown }>();
  constructor(
    private readonly seasons: SeasonService,
    private readonly ttlMs = 10_000,
  ) {}

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data as T;
    const data = await fn();
    this.cache.set(key, { at: Date.now(), data });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  async get(scope: LeaderboardScope | 'daily', o: Opts) {
    const limit = o.pageSize;
    const offset = (o.page - 1) * o.pageSize;
    switch (scope) {
      case 'global': {
        const items = await this.cached(`global:${o.page}:${limit}`, () =>
          query<any>(`SELECT ${PUBLIC_USER_COLUMNS}, p.rating AS score, p.wins FROM users u JOIN user_profiles p ON p.user_id = u.id
                      WHERE ${VISIBLE} AND p.total_games > 0 ORDER BY p.rating DESC, p.wins DESC, p.xp DESC, u.id LIMIT ? OFFSET ?`, [limit, offset]),
        );
        // "Your rank" uses exactly the same order (and the same visible players) as the list.
        const me = o.viewerId
          ? await queryOne<any>(
              `SELECT p.rating AS score, (SELECT COUNT(*) + 1 FROM user_profiles p2 JOIN users u2 ON u2.id = p2.user_id
                 WHERE u2.status = 'active' AND p2.username IS NOT NULL AND p2.total_games > 0
                   AND (p2.rating > p.rating OR (p2.rating = p.rating AND (p2.wins > p.wins OR (p2.wins = p.wins AND (p2.xp > p.xp OR (p2.xp = p.xp AND u2.id < p.user_id))))))) AS rnk
               FROM user_profiles p WHERE p.user_id = ? AND p.total_games > 0 AND p.username IS NOT NULL`,
              [o.viewerId],
            )
          : null;
        return this.shape(items, offset, me);
      }
      case 'weekly':
      case 'monthly':
      case 'category':
      case 'daily': {
        const board =
          scope === 'weekly' ? `weekly:${bdWeekKey()}` : scope === 'monthly' ? `monthly:${bdMonthKey()}` : scope === 'daily' ? `daily:${bdDateKey()}` : `category:${o.categoryId ?? 0}`;
        const items = await this.cached(`${board}:${o.page}:${limit}`, () =>
          query<any>(`SELECT ${PUBLIC_USER_COLUMNS}, l.score, l.wins FROM leaderboards l JOIN users u ON u.id = l.user_id JOIN user_profiles p ON p.user_id = u.id
                      WHERE l.board = ? AND ${VISIBLE} ORDER BY l.score DESC, l.wins DESC, l.updated_at ASC, l.user_id LIMIT ? OFFSET ?`, [board, limit, offset]),
        );
        const me = o.viewerId
          ? await queryOne<any>(
              `SELECT l.score, (SELECT COUNT(*) + 1 FROM leaderboards l2 JOIN users u2 ON u2.id = l2.user_id JOIN user_profiles p2 ON p2.user_id = u2.id
                 WHERE l2.board = l.board AND u2.status = 'active' AND p2.username IS NOT NULL
                   AND (l2.score > l.score OR (l2.score = l.score AND (l2.wins > l.wins OR (l2.wins = l.wins AND (l2.updated_at < l.updated_at OR (l2.updated_at = l.updated_at AND l2.user_id < l.user_id))))))) AS rnk
               FROM leaderboards l WHERE l.board = ? AND l.user_id = ?`,
              [board, o.viewerId],
            )
          : null;
        return { ...this.shape(items, offset, me), board };
      }
      case 'season': {
        const season = this.seasons.current();
        if (!season) return { items: [], me: null, season: null };
        const items = await this.cached(`season:${season.id}:${o.page}:${limit}`, () =>
          query<any>(`SELECT ${PUBLIC_USER_COLUMNS}, sr.rating AS score, sr.wins FROM season_ratings sr JOIN users u ON u.id = sr.user_id
                      JOIN user_profiles p ON p.user_id = u.id WHERE sr.season_id = ? AND ${VISIBLE}
                      ORDER BY sr.rating DESC, sr.wins DESC, sr.peak_rating DESC, sr.user_id LIMIT ? OFFSET ?`, [season.id, limit, offset]),
        );
        const me = o.viewerId
          ? await queryOne<any>(
              `SELECT sr.rating AS score, (SELECT COUNT(*) + 1 FROM season_ratings s2 JOIN users u2 ON u2.id = s2.user_id JOIN user_profiles p2 ON p2.user_id = u2.id
                 WHERE s2.season_id = sr.season_id AND u2.status = 'active' AND p2.username IS NOT NULL
                   AND (s2.rating > sr.rating OR (s2.rating = sr.rating AND (s2.wins > sr.wins OR (s2.wins = sr.wins AND (s2.peak_rating > sr.peak_rating OR (s2.peak_rating = sr.peak_rating AND s2.user_id < sr.user_id))))))) AS rnk
               FROM season_ratings sr WHERE sr.season_id = ? AND sr.user_id = ?`,
              [season.id, o.viewerId],
            )
          : null;
        return { ...this.shape(items, offset, me), season: { id: season.id, name: season.name, endsAt: season.endsAt } };
      }
      case 'friends': {
        if (!o.viewerId) return { items: [], me: null };
        const rows = await query<any>(
          `SELECT ${PUBLIC_USER_COLUMNS}, p.rating AS score, p.wins FROM users u JOIN user_profiles p ON p.user_id = u.id
           WHERE (u.id = ? OR u.id IN (SELECT friend_id FROM friends WHERE user_id = ?)) AND ${VISIBLE}
           ORDER BY p.rating DESC, p.wins DESC, p.xp DESC, u.id LIMIT ? OFFSET ?`,
          [o.viewerId, o.viewerId, limit, offset],
        );
        return this.shape(rows, offset, null);
      }
      case 'squad': {
        const rows = await this.cached(`squad:${o.page}:${limit}`, () =>
          query<any>(
            `SELECT s.id, s.name, s.tag, s.logo_url AS logoUrl, s.xp AS score, (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.id) AS members
             FROM squads s WHERE s.deleted_at IS NULL ORDER BY s.xp DESC, s.id LIMIT ? OFFSET ?`,
            [limit, offset],
          ),
        );
        return { items: rows.map((r, i) => ({ rank: offset + i + 1, squad: { ...r, score: Number(r.score), members: Number(r.members) } })), me: null };
      }
    }
  }

  private shape(rows: any[], offset: number, me: any) {
    return {
      items: rows.map((r, i) => ({ rank: offset + i + 1, user: toPublicUser(r), score: Number(r.score), wins: Number(r.wins ?? 0) })),
      me: me ? { rank: Number(me.rnk), score: Number(me.score) } : null,
    };
  }
}
