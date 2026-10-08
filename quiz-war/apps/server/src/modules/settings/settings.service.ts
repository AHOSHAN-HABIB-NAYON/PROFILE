import {
  appSettingsSchema,
  DEFAULT_APP_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  gameSettingsSchema,
  type AppSettings,
  type GameSettings,
} from '@quizwar/shared';
import { exec, parseJson, query } from '../../db/pool';

type Listener = () => void;

/**
 * Game + app settings. Each top-level section of GameSettings is a row in `settings`
 * (key `game.<section>`), app settings are stored under `app`. Values are validated on write
 * and merged over defaults on read, so adding a new setting never needs a migration.
 */
export class SettingsService {
  private gameCache: GameSettings = structuredClone(DEFAULT_GAME_SETTINGS);
  private appCache: AppSettings = structuredClone(DEFAULT_APP_SETTINGS);
  private loadedAt = 0;
  private listeners: Listener[] = [];

  constructor(private readonly ttlMs = 30_000, private readonly useDb = true) {}

  async load(force = false) {
    if (!this.useDb) return;
    if (!force && Date.now() - this.loadedAt < this.ttlMs) return;
    const rows = await query<{ setting_key: string; value: unknown }>('SELECT setting_key, value FROM settings');
    const game: any = structuredClone(DEFAULT_GAME_SETTINGS);
    let app: AppSettings = structuredClone(DEFAULT_APP_SETTINGS);
    for (const row of rows) {
      const value = parseJson<any>(row.value);
      if (value == null) continue;
      if (row.setting_key === 'app') app = { ...app, ...value };
      else if (row.setting_key.startsWith('game.')) {
        const section = row.setting_key.slice(5) as keyof GameSettings;
        if (section in game) game[section] = mergeSection(game[section], value);
      }
    }
    const parsedGame = gameSettingsSchema.safeParse(game);
    this.gameCache = parsedGame.success ? parsedGame.data : structuredClone(DEFAULT_GAME_SETTINGS);
    const parsedApp = appSettingsSchema.safeParse(app);
    this.appCache = parsedApp.success ? parsedApp.data : structuredClone(DEFAULT_APP_SETTINGS);
    this.loadedAt = Date.now();
  }

  /** Synchronous accessors used in hot paths (game engine); refreshed in the background. */
  game(): GameSettings {
    if (this.useDb && Date.now() - this.loadedAt > this.ttlMs) void this.load().catch(() => undefined);
    return this.gameCache;
  }

  app(): AppSettings {
    if (this.useDb && Date.now() - this.loadedAt > this.ttlMs) void this.load().catch(() => undefined);
    return this.appCache;
  }

  /** Test/dev helper. */
  overrideGame(patch: Partial<GameSettings>) {
    this.gameCache = { ...this.gameCache, ...patch };
  }

  async updateGameSection<K extends keyof GameSettings>(section: K, value: unknown, adminId: number | null) {
    const candidate = { ...this.gameCache, [section]: value };
    const parsed = gameSettingsSchema.parse(candidate);
    await exec(
      `INSERT INTO settings (setting_key, value, updated_by_admin_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by_admin_id = VALUES(updated_by_admin_id)`,
      [`game.${String(section)}`, JSON.stringify(parsed[section]), adminId],
    );
    this.gameCache = parsed;
    this.emit();
    return parsed[section];
  }

  async updateApp(value: Partial<AppSettings>, adminId: number | null) {
    const parsed = appSettingsSchema.parse({ ...this.appCache, ...value });
    await exec(
      `INSERT INTO settings (setting_key, value, updated_by_admin_id) VALUES ('app', ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by_admin_id = VALUES(updated_by_admin_id)`,
      [JSON.stringify(parsed), adminId],
    );
    this.appCache = parsed;
    this.emit();
    return parsed;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

function mergeSection(base: any, value: any) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return base;
  const out: any = { ...base };
  for (const [k, v] of Object.entries(value)) {
    out[k] = typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? mergeSection(base[k], v) : v;
  }
  return out;
}
