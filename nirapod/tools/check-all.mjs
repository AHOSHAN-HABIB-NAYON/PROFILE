// CI entry point for contract checks: generated files up to date + i18n rules + icon rules.
import { execFileSync } from 'node:child_process';
const run = (f, ...a) => execFileSync(process.execPath, [f, ...a], { stdio: 'inherit', cwd: new URL('.', import.meta.url) });
run('gen-tokens.mjs', '--check');
run('gen-nav.mjs', '--check');
run('build-icons.mjs', '--check');
run('build-flags.mjs', '--check');
run('sync-shared.mjs', '--check');
run('check-i18n.mjs');
run('check-permissions.mjs');
