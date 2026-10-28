// Copies shared data the Flutter app bundles (it cannot read outside its package directory).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, emit, prune, done } from './lib.mjs';

const i18n = fs.readdirSync(path.join(ROOT, 'shared/i18n')).filter((f) => f.endsWith('.json'));
for (const f of i18n) emit(`app/assets/i18n/${f}`, fs.readFileSync(path.join(ROOT, 'shared/i18n', f)));
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/CONTRACTS/i18n-keys.json'), 'utf8'));
emit('app/assets/i18n/_screens.json', JSON.stringify(contract.screens, null, 2) + '\n');
prune('app/assets/i18n', new Set([...i18n, '_screens.json']));
for (const f of ['zone.tab', 'iso3166.tab', 'VERSION']) emit(`app/assets/tz/${f}`, fs.readFileSync(path.join(ROOT, 'shared/tz', f)));
done('shared assets');
