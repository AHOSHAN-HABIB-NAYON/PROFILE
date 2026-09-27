import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Walk up until we find apps/api/package.json (works from src/ and from bundled dist/). */
function findApiRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const name = JSON.parse(fs.readFileSync(pkg, 'utf8')).name;
        if (name === '@tradeteam/api') return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const API_ROOT = findApiRoot(here);
export const REPO_ROOT = path.resolve(API_ROOT, '../..');
export const WEB_ROOT = path.resolve(REPO_ROOT, 'apps/web');
/** Private runtime storage. Must never be inside a publicly served directory. */
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(REPO_ROOT, 'storage');
export const RUNTIME_ENV_FILE = path.join(STORAGE_DIR, 'runtime.env');
export const INSTALL_LOCK_FILE = path.join(STORAGE_DIR, 'install.lock');
export const INSTALL_TOKEN_FILE = path.join(STORAGE_DIR, 'install-token.txt');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');

export function ensureStorage(): void {
  fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o700 });
}

export const APP_VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(API_ROOT, 'package.json'), 'utf8')).version as string;
  } catch {
    return '0.0.0';
  }
})();
