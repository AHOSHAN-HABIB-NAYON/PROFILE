import { build } from 'esbuild';
import fs from 'node:fs';

/**
 * Bundles the API into dist/. Third-party packages stay external (installed via npm ci);
 * the workspace package @tradeteam/shared is inlined.
 */
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@tradeteam/shared');

fs.rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/server.ts', migrate: 'src/cli/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external: [...external, 'decimal.js'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
