import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exec, query, queryOne } from '../../db/pool';

export interface StorageProvider {
  put(key: string, data: Buffer, contentType?: string): Promise<string>;
  remove(urlOrKey: string): Promise<void>;
}

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};
export const contentTypeFor = (key: string) => TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream';

/** Durable copy of every uploaded file in MySQL (the disk folder can be wiped by a redeploy). */
export class MediaBackup {
  constructor(private readonly log: { warn: (o: object, m: string) => void; info: (o: object, m: string) => void }) {}

  async save(key: string, data: Buffer, contentType: string) {
    try {
      await exec(
        `INSERT INTO media_files (media_key, content_type, size, data) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), size = VALUES(size), data = VALUES(data)`,
        [key, contentType, data.length, data],
      );
    } catch (err) {
      // Very large files can exceed the MySQL packet limit; the disk copy still works until the next redeploy.
      this.log.warn({ err: (err as Error).message, key, bytes: data.length }, 'media backup to database failed');
    }
  }

  async remove(key: string) {
    await exec('DELETE FROM media_files WHERE media_key = ?', [key]).catch(() => undefined);
  }

  async load(key: string) {
    return queryOne<{ data: Buffer; content_type: string }>('SELECT data, content_type FROM media_files WHERE media_key = ?', [key]);
  }

  /** Writes files that exist in the database but not on disk; backs up disk files the database lacks. */
  async sync(dir: string) {
    const root = path.resolve(dir);
    const inDb = new Set((await query<{ media_key: string }>('SELECT media_key FROM media_files')).map((r) => r.media_key));
    const onDisk = new Set<string>();
    const walk = async (rel: string): Promise<void> => {
      const entries = await readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else if (e.isFile()) onDisk.add(r);
      }
    };
    await walk('');
    let restored = 0;
    let backedUp = 0;
    for (const key of inDb) {
      if (onDisk.has(key)) continue;
      const row = await this.load(key);
      if (!row) continue;
      const full = path.resolve(root, key);
      if (!full.startsWith(root)) continue;
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, row.data);
      restored++;
    }
    for (const key of onDisk) {
      if (inDb.has(key) || key.startsWith('.')) continue;
      const full = path.join(root, key);
      if ((await stat(full)).size > 32 * 1024 * 1024) continue;
      await this.save(key, await readFile(full), contentTypeFor(key));
      backedUp++;
    }
    if (restored || backedUp) this.log.info({ restored, backedUp }, 'media folder synced with database');
    return { restored, backedUp };
  }
}

/**
 * Local disk storage served under /media, mirrored to MySQL by MediaBackup so uploads survive
 * redeploys. Replace with an S3/R2/GCS provider implementing the same interface for multi-node
 * production (see docs/deployment.md).
 */
export class LocalStorage implements StorageProvider {
  constructor(
    private readonly dir: string,
    private readonly publicUrl: string,
    private readonly backup: MediaBackup | null = null,
  ) {}

  private keyOf(urlOrKey: string) {
    const base = this.publicUrl.replace(/\/$/, '') + '/';
    return urlOrKey.startsWith(base) ? urlOrKey.slice(base.length) : urlOrKey;
  }

  async put(key: string, data: Buffer, contentType?: string): Promise<string> {
    const safe = key.replace(/[^a-zA-Z0-9/_.-]/g, '');
    const full = path.resolve(this.dir, safe);
    if (!full.startsWith(path.resolve(this.dir))) throw new Error('invalid key');
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    await this.backup?.save(safe, data, contentType ?? contentTypeFor(safe));
    return `${this.publicUrl.replace(/\/$/, '')}/${safe}`;
  }

  async remove(urlOrKey: string) {
    const key = this.keyOf(urlOrKey);
    if (!key || key.includes('..')) return;
    await unlink(path.resolve(this.dir, key)).catch(() => undefined);
    await this.backup?.remove(key);
  }

  /** Restores one file from the database on demand (used when the disk copy is missing). */
  async restore(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!this.backup || !key || key.includes('..')) return null;
    const row = await this.backup.load(key);
    if (!row) return null;
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(path.resolve(this.dir))) return null;
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, row.data).catch(() => undefined);
    return { data: row.data, contentType: row.content_type };
  }

  syncFromBackup() {
    return this.backup?.sync(this.dir) ?? Promise.resolve({ restored: 0, backedUp: 0 });
  }
}
