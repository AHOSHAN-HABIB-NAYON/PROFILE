import { leagueForRating, type GameSettings } from '@quizwar/shared';
import { exec, query, queryOne, tx } from '../../db/pool';

export interface Season {
  id: number;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: 'upcoming' | 'active' | 'ended';
}

const DEFAULT_SEASON_DAYS = 30;

/** Competitive seasons: one active at a time; ending a season snapshots ranks and soft-resets ratings. */
export class SeasonService {
  private cached: Season | null = null;

  constructor(private readonly settings: () => GameSettings) {}

  currentId(): number | null {
    return this.cached?.id ?? null;
  }

  current(): Season | null {
    return this.cached;
  }

  async refresh(): Promise<Season | null> {
    const row = await queryOne<any>(`SELECT id, name, starts_at, ends_at, status FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1`);
    this.cached = row ? { id: row.id, name: row.name, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status } : null;
    return this.cached;
  }

  /** Called periodically: activates upcoming seasons, closes ended ones and makes sure one is active. */
  async tick(log?: (m: string) => void) {
    await exec(`UPDATE seasons SET status = 'active' WHERE status = 'upcoming' AND starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()`);
    const ended = await query<{ id: number }>(`SELECT id FROM seasons WHERE status = 'active' AND ends_at <= UTC_TIMESTAMP()`);
    for (const s of ended) {
      await this.closeSeason(s.id);
      log?.(`season ${s.id} closed`);
    }
    let active = await this.refresh();
    if (!active) {
      const n = await queryOne<{ n: number }>('SELECT COUNT(*) n FROM seasons');
      await exec(
        `INSERT INTO seasons (name, starts_at, ends_at, status) VALUES (?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), 'active')`,
        [`Season ${Number(n?.n ?? 0) + 1}`, DEFAULT_SEASON_DAYS],
      );
      active = await this.refresh();
      log?.(`season ${active?.id} started`);
    }
    return active;
  }

  async closeSeason(seasonId: number) {
    const s = this.settings();
    await tx(async (conn) => {
      const season = await queryOne<{ soft_reset_factor: string; status: string }>('SELECT soft_reset_factor, status FROM seasons WHERE id = ? FOR UPDATE', [seasonId], conn);
      if (!season || season.status === 'ended') return;
      // Final ranks (ties share order by peak rating).
      await exec(
        `UPDATE season_ratings sr JOIN (
           SELECT user_id, ROW_NUMBER() OVER (ORDER BY rating DESC, peak_rating DESC, user_id) AS rnk FROM season_ratings WHERE season_id = ?
         ) x ON x.user_id = sr.user_id SET sr.final_rank = x.rnk WHERE sr.season_id = ?`,
        [seasonId, seasonId],
        conn,
      );
      // Soft reset: pull every rating towards the start rating.
      const factor = Number(season.soft_reset_factor);
      const start = s.ranked.startRating;
      await exec(`UPDATE user_profiles SET rating = GREATEST(?, ROUND(? + (rating - ?) * ?))`, [s.ranked.minRating, start, start, factor], conn);
      for (const l of [...s.ranked.leagues].sort((a, b) => a.minRating - b.minRating)) {
        await exec('UPDATE user_profiles SET league = ? WHERE rating >= ?', [l.key, l.minRating], conn);
      }
      await exec(`UPDATE seasons SET status = 'ended' WHERE id = ?`, [seasonId], conn);
    });
    // Season rewards by final league (idempotent via user_rewards unique key).
    const rows = await query<{ user_id: number; league: string }>('SELECT user_id, league FROM season_ratings WHERE season_id = ?', [seasonId]);
    const rewardByLeague: Record<string, number> = { bronze: 100, silver: 200, gold: 400, platinum: 700, diamond: 1000, master: 1500, champion: 2500 };
    for (const r of rows) {
      const coins = rewardByLeague[r.league] ?? 100;
      await exec(
        `INSERT IGNORE INTO user_rewards (user_id, source, source_key, coins) VALUES (?, 'season', ?, ?)`,
        [r.user_id, String(seasonId), coins],
      ).then(async (res) => {
        if (res.affectedRows) {
          await exec('UPDATE user_profiles SET coins = coins + ? WHERE user_id = ?', [coins, r.user_id]);
          await exec(
            `INSERT INTO coin_transactions (user_id, amount, balance_after, reason, ref) SELECT user_id, ?, coins, 'season_reward', ? FROM user_profiles WHERE user_id = ?`,
            [coins, String(seasonId), r.user_id],
          );
        }
      });
    }
  }

  leagueFor(rating: number) {
    return leagueForRating(rating, this.settings().ranked.leagues);
  }

  async history(userId: number) {
    return query<any>(
      `SELECT s.id, s.name, s.starts_at AS startsAt, s.ends_at AS endsAt, s.status, sr.rating, sr.peak_rating AS peakRating, sr.league,
              sr.wins, sr.losses, sr.draws, sr.final_rank AS finalRank
       FROM season_ratings sr JOIN seasons s ON s.id = sr.season_id WHERE sr.user_id = ? ORDER BY s.id DESC LIMIT 20`,
      [userId],
    );
  }
}
