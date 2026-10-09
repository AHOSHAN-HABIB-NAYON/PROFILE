import { isValidUsername, type GameSettings } from '@quizwar/shared';
import { exec, query, queryOne } from '../../db/pool';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { ImageService } from '../uploads/image.service';
import { getMe, getUserByUid } from './users.repo';

export class ProfileService {
  constructor(
    private readonly images: ImageService,
    private readonly settings: () => GameSettings,
  ) {}

  private async assertUsernameAllowed(username: string, userId: number) {
    if (!isValidUsername(username)) throw badRequest('Username must be 3–20 letters, numbers, _ or .');
    const words = await query<{ word: string }>('SELECT word FROM blocked_words');
    const lower = username.toLowerCase();
    if (words.some((w) => lower.includes(w.word.toLowerCase()))) throw badRequest('Please choose a different username');
    const taken = await queryOne('SELECT user_id FROM user_profiles WHERE username = ? AND user_id <> ?', [username, userId]);
    if (taken) throw conflict('This username is taken', 'username_taken');
  }

  async completeOnboarding(userId: number, username: string) {
    await this.assertUsernameAllowed(username, userId);
    try {
      await exec('UPDATE user_profiles SET username = ?, onboarded_at = COALESCE(onboarded_at, UTC_TIMESTAMP()) WHERE user_id = ?', [username, userId]);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw conflict('This username is taken', 'username_taken');
      throw err;
    }
    return getMe(userId);
  }

  async update(userId: number, patch: { username?: string; bio?: string | null; theme?: string }) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.username !== undefined) {
      await this.assertUsernameAllowed(patch.username, userId);
      sets.push('username = ?');
      params.push(patch.username);
    }
    if (patch.bio !== undefined) {
      sets.push('bio = ?');
      params.push(patch.bio?.replace(/[<>]/g, '') || null);
    }
    if (patch.theme !== undefined) {
      sets.push('theme = ?');
      params.push(patch.theme);
    }
    if (sets.length) {
      try {
        await exec(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...params, userId]);
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') throw conflict('This username is taken', 'username_taken');
        throw err;
      }
    }
    return getMe(userId);
  }

  async setPreferences(userId: number, p: { availableForBattle?: boolean; dnd?: boolean; tutorialDone?: boolean; lang?: 'bn' | 'en'; emailActivity?: boolean }) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (p.availableForBattle !== undefined) (sets.push('available_for_battle = ?'), params.push(p.availableForBattle ? 1 : 0));
    if (p.dnd !== undefined) (sets.push('dnd = ?'), params.push(p.dnd ? 1 : 0));
    if (p.tutorialDone !== undefined) (sets.push('tutorial_done = ?'), params.push(p.tutorialDone ? 1 : 0));
    if (p.lang !== undefined) (sets.push('lang = ?'), params.push(p.lang));
    if (p.emailActivity !== undefined) (sets.push('email_activity = ?'), params.push(p.emailActivity ? 1 : 0));
    if (sets.length) await exec(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...params, userId]);
  }

  async setAvatar(userId: number, buf: Buffer) {
    const old = await queryOne<{ avatar_url: string | null; avatar_thumb_url: string | null }>('SELECT avatar_url, avatar_thumb_url FROM user_profiles WHERE user_id = ?', [userId]);
    const img = await this.images.avatar(userId, buf);
    await exec('UPDATE user_profiles SET avatar_url = ?, avatar_thumb_url = ? WHERE user_id = ?', [img.main.url, img.thumb.url, userId]);
    await this.images.remove(old?.avatar_url);
    await this.images.remove(old?.avatar_thumb_url);
    return { avatarUrl: img.main.url, avatarThumbUrl: img.thumb.url };
  }

  async removeAvatar(userId: number) {
    const old = await queryOne<{ avatar_url: string | null; avatar_thumb_url: string | null }>('SELECT avatar_url, avatar_thumb_url FROM user_profiles WHERE user_id = ?', [userId]);
    await exec('UPDATE user_profiles SET avatar_url = NULL, avatar_thumb_url = NULL WHERE user_id = ?', [userId]);
    await this.images.remove(old?.avatar_url);
    await this.images.remove(old?.avatar_thumb_url);
  }

  /** Public profile — no email or other private data. */
  async publicProfile(uid: string) {
    const u = await getUserByUid(uid);
    if (!u) throw notFound('Player not found');
    const p = await queryOne<any>(
      `SELECT bio, xp, wins, losses, draws, total_games, total_correct, total_answered, best_score, current_win_streak, best_win_streak,
              streak_days, best_streak_days, peak_rating, best_survival, best_speed, badge, u.created_at
       FROM user_profiles JOIN users u ON u.id = user_profiles.user_id WHERE user_id = ?`,
      [u.id],
    );
    const achievements = await query<any>(
      `SELECT a.ach_key AS \`key\`, a.name, a.icon, a.description, ua.unlocked_at AS unlockedAt FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`,
      [u.id],
    );
    const squad = await queryOne<any>(
      `SELECT s.id, s.name, s.tag, s.logo_url AS logoUrl, sm.role FROM squad_members sm JOIN squads s ON s.id = sm.squad_id WHERE sm.user_id = ? AND s.deleted_at IS NULL`,
      [u.id],
    );
    const decided = p.wins + p.losses + p.draws;
    return {
      user: u,
      bio: p.bio,
      xp: Number(p.xp),
      stats: {
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        totalGames: p.total_games,
        winRate: decided ? Math.round((p.wins / decided) * 1000) / 10 : 0,
        accuracy: p.total_answered ? Math.round((p.total_correct / p.total_answered) * 1000) / 10 : 0,
        totalCorrect: p.total_correct,
        bestScore: p.best_score,
        currentWinStreak: p.current_win_streak,
        bestWinStreak: p.best_win_streak,
        streakDays: p.streak_days,
        bestStreakDays: p.best_streak_days,
        peakRating: p.peak_rating,
        bestSurvival: p.best_survival,
        bestSpeed: p.best_speed,
      },
      achievements,
      squad,
      memberSince: p.created_at,
    };
  }

  async detailedStats(userId: number) {
    const perCategory = await query<any>(
      `SELECT c.id, c.name, c.icon, COUNT(*) AS answered, SUM(a.is_correct) AS correct, ROUND(AVG(a.response_ms)) AS avgMs
       FROM match_answers a JOIN questions q ON q.id = a.question_id JOIN categories c ON c.id = q.category_id
       WHERE a.user_id = ? AND a.created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
       GROUP BY c.id, c.name, c.icon ORDER BY answered DESC`,
      [userId],
    );
    const categories = perCategory.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      answered: Number(r.answered),
      correct: Number(r.correct),
      accuracy: Number(r.answered) ? Math.round((Number(r.correct) / Number(r.answered)) * 1000) / 10 : 0,
      avgMs: r.avgMs ? Number(r.avgMs) : null,
    }));
    const weak = categories.filter((c) => c.answered >= 5).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
    const byMode = await query<any>(
      `SELECT m.mode, COUNT(*) AS games, MAX(mp.score) AS best, SUM(mp.correct_count) AS correct, SUM(mp.answered_count) AS answered
       FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = ? AND m.status = 'finished' GROUP BY m.mode`,
      [userId],
    );
    const mistakes = await queryOne<{ n: number }>(
      `SELECT COUNT(DISTINCT question_id) n FROM match_answers WHERE user_id = ? AND is_correct = 0 AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)`,
      [userId],
    );
    return {
      categories,
      weakCategories: weak,
      modes: byMode.map((r) => ({ mode: r.mode, games: Number(r.games), best: Number(r.best ?? 0), correct: Number(r.correct ?? 0), answered: Number(r.answered ?? 0) })),
      mistakesAvailable: Number(mistakes?.n ?? 0),
    };
  }

  async matchHistory(userId: number, page: number, pageSize: number) {
    const rows = await query<any>(
      `SELECT m.id, m.mode, m.match_type AS type, m.ranked, m.status, m.winner_team AS winnerTeam, m.created_at AS createdAt, m.ended_at AS endedAt,
              c.name AS category, mp.team, mp.score, mp.correct_count AS correct, mp.answered_count AS answered, mp.result, mp.xp_gained AS xp,
              mp.coins_gained AS coins, mp.rating_before AS ratingBefore, mp.rating_after AS ratingAfter
       FROM match_players mp JOIN matches m ON m.id = mp.match_id LEFT JOIN categories c ON c.id = m.category_id
       WHERE mp.user_id = ? AND m.status IN ('finished','aborted') ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, (page - 1) * pageSize],
    );
    if (!rows.length) return [];
    const opps = await query<any>(
      `SELECT mp.match_id, mp.team, mp.user_id, mp.bot_name, mp.bot_level, mp.score, p.username, u.uid
       FROM match_players mp LEFT JOIN users u ON u.id = mp.user_id LEFT JOIN user_profiles p ON p.user_id = mp.user_id
       WHERE mp.match_id IN (?)`,
      [rows.map((r) => r.id)],
    );
    return rows.map((r) => ({
      ...r,
      ranked: !!r.ranked,
      players: opps
        .filter((o) => o.match_id === r.id)
        .map((o) => ({ team: o.team, isBot: !o.user_id, name: o.user_id ? (o.username ?? 'Deleted player') : o.bot_name, uid: o.uid, botLevel: o.bot_level, score: o.score })),
    }));
  }

  /** Post-match review: question, correct answer, your answer, explanation. Only for your own matches. */
  async review(userId: number, matchId: string) {
    const me = await queryOne<{ id: number }>('SELECT id FROM match_players WHERE match_id = ? AND user_id = ?', [matchId, userId]);
    if (!me) throw notFound('Match not found');
    const status = await queryOne<{ status: string }>('SELECT status FROM matches WHERE id = ?', [matchId]);
    if (!status || (status.status !== 'finished' && status.status !== 'aborted')) throw badRequest('Review is available after the match');
    const rows = await query<any>(
      `SELECT mq.question_index, mq.option_order, q.id, q.text, q.explanation, q.image_url, a.option_index, a.is_correct, a.points, a.response_ms
       FROM match_questions mq JOIN questions q ON q.id = mq.question_id
       LEFT JOIN match_answers a ON a.match_id = mq.match_id AND a.question_index = mq.question_index AND a.match_player_id = ?
       WHERE mq.match_id = ? ORDER BY mq.question_index`,
      [me.id, matchId],
    );
    if (!rows.length) return [];
    const opts = await query<any>('SELECT question_id, option_index, text, is_correct FROM question_options WHERE question_id IN (?) ORDER BY option_index', [
      [...new Set(rows.map((r) => r.id))],
    ]);
    return rows
      .map((r) => {
        const raw = opts.filter((o) => Number(o.question_id) === Number(r.id));
        const order = String(r.option_order).split(',').map(Number);
        const options = order.map((i) => raw[i]?.text ?? '');
        const correctIndex = order.findIndex((i) => raw[i]?.is_correct);
        return {
          index: r.question_index,
          questionId: Number(r.id),
          text: r.text,
          imageUrl: r.image_url,
          options,
          correctIndex,
          yourIndex: r.option_index,
          correct: !!r.is_correct,
          points: r.points ?? 0,
          responseMs: r.response_ms,
          explanation: r.explanation,
          answered: r.is_correct !== null,
        };
      })
      .filter((r) => r.answered);
  }

  async myAchievements(userId: number) {
    return query<any>(
      `SELECT a.ach_key AS \`key\`, a.name, a.description, a.icon, a.metric, a.threshold, a.reward_coins AS rewardCoins, a.reward_xp AS rewardXp,
              ua.unlocked_at AS unlockedAt
       FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
       WHERE a.is_active = 1 ORDER BY ua.unlocked_at IS NULL, a.sort_order`,
      [userId],
    );
  }

}
