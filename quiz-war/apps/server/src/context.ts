import type { ServerToClientEvents } from '@quizwar/shared';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import type { Env } from './config/env';
import { GameEngine } from './game/engine';
import { MysqlMatchPersistence } from './game/persistence.mysql';
import type { Emitter, PlayerIdentity } from './game/types';
import { queryOne } from './db/pool';
import { AdminAuthService } from './modules/admin/admin.auth';
import { AiGeneratorService } from './modules/ai/ai-generator.service';
import { EmailService } from './modules/emails/email.service';
import { MissionService } from './modules/missions/mission.service';
import { AuthService } from './modules/auth/auth.service';
import { GoogleIdTokenVerifier, type GoogleVerifier } from './modules/auth/google';
import { LogMailer, SmtpMailer, smtpConfigFromEnv, type Mailer } from './modules/auth/mailer';
import { AppReleaseFeed } from './modules/app-release';
import { apkKeyHashOrigin, expandAndroidOrigins, PasskeyService } from './modules/auth/passkey.service';
import { DailyChallengeService } from './modules/daily/daily.service';
import { LeaderboardService } from './modules/leaderboard/leaderboard.service';
import { SeasonService } from './modules/leaderboard/season.service';
import { MatchmakingService } from './modules/matchmaking/matchmaking.service';
import { NotificationService } from './modules/notifications/notification.service';
import { PushService } from './modules/notifications/push';
import { PresenceService } from './modules/presence/presence.service';
import { ProgressionService } from './modules/progression/progression.service';
import { CategoryService } from './modules/questions/category.service';
import { PromoService } from './modules/promos/promo.service';
import { OurAppsService } from './modules/our-apps/our-apps.service';
import { ChatService } from './modules/chat/chat.service';
import { QuestionAdminService } from './modules/questions/question.admin.service';
import { MysqlQuestionSource } from './modules/questions/question.source';
import { ReportService } from './modules/reports/report.service';
import { SettingsService } from './modules/settings/settings.service';
import { ShopService } from './modules/shop/shop.service';
import { BattleRequestService } from './modules/social/battle.service';
import { FriendsService } from './modules/social/friends.service';
import { SquadService } from './modules/squads/squad.service';
import { ImageService } from './modules/uploads/image.service';
import { LocalStorage, MediaBackup } from './modules/uploads/storage';
import { VerifiedService } from './modules/verified/verified.service';
import { ProfileService } from './modules/users/profile.service';

export interface Logger {
  info(o: object | string, m?: string): void;
  warn(o: object | string, m?: string): void;
  error(o: object | string, m?: string): void;
}

/** Socket.IO-backed emitter. Rooms: `user:<id>` (all of a user's sockets) and `match:<id>`. */
export class SocketEmitter implements Emitter {
  io: Server | null = null;
  toUser<E extends keyof ServerToClientEvents>(userId: number, event: E, payload: Parameters<ServerToClientEvents[E]>[0]) {
    if (userId > 0) (this.io?.to(`user:${userId}`) as any)?.emit(event, payload);
  }
  toMatch<E extends keyof ServerToClientEvents>(matchId: string, event: E, payload: Parameters<ServerToClientEvents[E]>[0]) {
    (this.io?.to(`match:${matchId}`) as any)?.emit(event, payload);
  }
  joinMatch(userId: number, matchId: string) {
    if (userId > 0) this.io?.in(`user:${userId}`).socketsJoin(`match:${matchId}`);
  }
  leaveMatch(userId: number, matchId: string) {
    if (userId > 0) this.io?.in(`user:${userId}`).socketsLeave(`match:${matchId}`);
  }
  disconnectUser(userId: number) {
    this.io?.in(`user:${userId}`).disconnectSockets(true);
  }
}

export async function loadIdentity(userId: number): Promise<PlayerIdentity & { available: boolean; dnd: boolean; totalGames: number; tutorialDone: boolean; status: string; onboarded: boolean }> {
  const r = await queryOne<any>(
    `SELECT u.uid, u.status, p.username, p.avatar_url, p.avatar_thumb_url, p.level, p.rating, p.available_for_battle, p.dnd, p.total_games, p.tutorial_done, p.onboarded_at
     FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
    [userId],
  );
  if (!r) throw new Error('user not found');
  return {
    userId,
    uid: r.uid,
    username: r.username ?? 'Player',
    avatarUrl: r.avatar_thumb_url ?? r.avatar_url,
    level: r.level,
    rating: r.rating,
    available: !!r.available_for_battle,
    dnd: !!r.dnd,
    totalGames: r.total_games,
    tutorialDone: !!r.tutorial_done,
    status: r.status,
    onboarded: !!r.username && !!r.onboarded_at,
  };
}

export function createContext(env: Env, log: Logger, overrides: { mailer?: Mailer; google?: GoogleVerifier } = {}) {
  const settings = new SettingsService();
  const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false }) : null;
  redis?.on('error', (err) => log.warn({ err: err.message }, 'redis error'));

  const emitter = new SocketEmitter();
  const smtp = smtpConfigFromEnv(env);
  const mailer: Mailer = overrides.mailer ?? (smtp ? new SmtpMailer(smtp, env.MAIL_FROM) : new LogMailer((o, m) => log.info(o, m)));
  if (!env.SMTP_URL && (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging')) log.warn('SMTP_URL is not set — emails are only logged');

  const googleAudiences = [env.GOOGLE_CLIENT_ID, ...(env.GOOGLE_EXTRA_AUDIENCES?.split(',') ?? [])].filter((x): x is string => !!x?.trim()).map((s) => s.trim());
  const google: GoogleVerifier = overrides.google ?? new GoogleIdTokenVerifier(googleAudiences);
  const push = new PushService(
    { vapidPublicKey: env.VAPID_PUBLIC_KEY, vapidPrivateKey: env.VAPID_PRIVATE_KEY, vapidSubject: env.VAPID_SUBJECT, fcmServiceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON },
    { warn: (o, m) => log.warn(o, m), error: (o, m) => log.error(o, m) },
  );

  // engine is referenced lazily by presence (in-match status)
  let engineRef: GameEngine | null = null;
  const presence = new PresenceService((uid) => engineRef?.isInMatch(uid) ?? false, redis);
  const notifications = new NotificationService(push, () => emitter, (uid) => presence.isOnline(uid), () => settings.app().notificationsEnabled);
  const emails = new EmailService(mailer, settings, env.PUBLIC_WEB_URL, { error: (o, m) => log.error(o, m) });
  notifications.onDelivered = (uid, n) => {
    const kind = n.type === 'achievement' ? 'achievement' : n.type === 'rank' && n.data?.up ? 'rank' : n.type === 'streak' && n.data?.milestone ? 'streak' : null;
    if (kind) void emails.activity(uid, kind, n.title, n.body).catch(() => undefined);
  };
  const seasons = new SeasonService(() => settings.game());
  const progression = new ProgressionService(settings, seasons, notifications, () => emitter, { error: (o, m) => log.error(o, m) });
  const verified = new VerifiedService(() => settings.game(), progression, notifications);
  const questionSource = new MysqlQuestionSource();

  const hooks: { finished: ((m: any) => void)[] } = { finished: [] };
  const engine = new GameEngine({
    settings: () => settings.game(),
    questions: questionSource,
    persistence: new MysqlMatchPersistence(() => seasons.currentId()),
    rewards: progression,
    wallet: progression,
    emitter,
    log: { error: (o, m) => log.error(o, m), warn: (o, m) => log.warn(o, m) },
    hooks: {
      onPlayerMatchState: (uid) => presence.refresh(uid),
      onMatchFinished: (m) => hooks.finished.forEach((fn) => fn(m)),
    },
  });
  engineRef = engine;

  const friends = new FriendsService(notifications, (uid) => presence.status(uid));
  const chat = new ChatService(friends, push, () => emitter, (uid) => presence.status(uid), () => ({ chat: settings.app().chatEnabled, push: settings.app().notificationsEnabled }));
  const ourApps = new OurAppsService();
  const matchmaking = new MatchmakingService(engine, () => settings.game(), emitter, { error: (o, m) => log.error(o, m) });
  const battles = new BattleRequestService(engine, () => settings.game(), presence, friends, notifications, () => emitter);
  const squads = new SquadService(notifications);
  const leaderboard = new LeaderboardService(seasons);
  const daily = new DailyChallengeService(engine, () => settings.game(), progression);
  hooks.finished.push((m) => void daily.onMatchFinished(m).catch((err) => log.error({ err }, 'daily challenge result failed')));
  const storage = new LocalStorage(env.STORAGE_LOCAL_DIR, env.STORAGE_PUBLIC_URL, new MediaBackup({ warn: (o, m) => log.warn(o, m), info: (o, m) => log.info(o, m) }));
  const images = new ImageService(storage, env.UPLOAD_MAX_BYTES);
  const profile = new ProfileService(images, () => settings.game());
  const shop = new ShopService(progression);
  const reports = new ReportService();
  const categories = new CategoryService();
  const promos = new PromoService();
  const questionsAdmin = new QuestionAdminService();
  const ai = new AiGeneratorService({ apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, questionsAdmin, {
    info: (o, m) => log.info(o, m),
    error: (o, m) => log.error(o, m),
  });
  const missions = new MissionService(progression, notifications, () => emitter);
  progression.afterPlayerResult = (m, p, outcome) => missions.recordMatch(m, p, outcome);

  const auth = new AuthService(
    { jwtSecret: env.JWT_SECRET, accessTtlSec: env.ACCESS_TOKEN_TTL_SEC, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS, webUrl: env.PUBLIC_WEB_URL },
    mailer,
    settings,
    google,
    (uid) => {
      emitter.disconnectUser(uid);
      matchmaking.leave(uid);
    },
  );
  const passkeys = new PasskeyService(
    {
      rpId: env.WEBAUTHN_RP_ID,
      rpName: env.WEBAUTHN_RP_NAME,
      // The Android app's origin is derived from its signing fingerprints, so a typo in
      // WEBAUTHN_ORIGIN can't break app passkeys.
      origins: expandAndroidOrigins([
        ...env.WEBAUTHN_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
        ...(env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '').split(',').map((f) => apkKeyHashOrigin(f)).filter((o): o is string => !!o),
      ]),
    },
    auth,
    settings,
  );
  const adminAuth = new AdminAuthService(env.ADMIN_JWT_SECRET, env.ADMIN_SESSION_TTL_HOURS);
  const appRelease = new AppReleaseFeed(env.APP_UPDATE_FEED_URL || null, env.APP_DOWNLOAD_URL);

  return {
    env,
    appRelease,
    log,
    redis,
    settings,
    emitter,
    mailer,
    google,
    push,
    presence,
    notifications,
    seasons,
    progression,
    questionSource,
    engine,
    friends,
    matchmaking,
    battles,
    squads,
    leaderboard,
    daily,
    storage,
    images,
    profile,
    shop,
    reports,
    categories,
    promos,
    ourApps,
    chat,
    questionsAdmin,
    ai,
    missions,
    emails,
    verified,
    auth,
    passkeys,
    adminAuth,
  };
}

export type AppContext = ReturnType<typeof createContext>;
