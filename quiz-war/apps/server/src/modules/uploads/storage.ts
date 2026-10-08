import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  remove(urlOrKey: string): Promise<void>;
}

/**
 * Local disk storage served under /media. Replace with an S3/R2/GCS provider implementing the
 * same interface for multi-node production (see docs/deployment.md).
 */
export class LocalStorage implements StorageProvider {
  constructor(
    private readonly dir: string,
    private readonly publicUrl: string,
  ) {}

  async put(key: string, data: Buffer): Promise<string> {
    const safe = key.replace(/[^a-zA-Z0-9/_.-]/g, '');
    const full = path.resolve(this.dir, safe);
    if (!full.startsWith(path.resolve(this.dir))) throw new Error('invalid key');
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return `${this.publicUrl.replace(/\/$/, '')}/${safe}`;
  }

  async remove(urlOrKey: string) {
    const base = this.publicUrl.replace(/\/$/, '') + '/';
    const key = urlOrKey.startsWith(base) ? urlOrKey.slice(base.length) : urlOrKey;
    if (!key || key.includes('..')) return;
    await unlink(path.resolve(this.dir, key)).catch(() => undefined);
  }
}
