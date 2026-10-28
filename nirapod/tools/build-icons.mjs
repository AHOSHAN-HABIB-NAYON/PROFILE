// SVG icon pipeline: validate the house style, optimize with SVGO, copy to the app and web,
// and generate the Dart registry plus the icon sheet for the UI board.
// Brand pipeline (shared/icons/brand): logo system + illustrations -> app/assets/brand, shared/web/brand,
// Android launcher/splash vector drawables (res/drawable, res/mipmap-anydpi-v26), Dart path data for the
// welcome draw-on (lib/core/widgets/brand/logo_paths.g.dart) and the brand sheet for the UI board.
import fs from 'node:fs';
import path from 'node:path';
import { optimize } from 'svgo';
import { ROOT, emit, prune, done } from './lib.mjs';

const SRC = path.join(ROOT, 'shared/icons');
const svgoConfig = {
  multipass: true,
  plugins: [
    { name: 'preset-default', params: { overrides: { convertColors: { currentColor: false } } } },
    'removeDimensions',
    { name: 'removeAttrs', params: { attrs: ['id', 'class', 'data-name'] } },
  ],
};
// Brand artwork keeps its (namespaced) ids: gradients are referenced by id and the logo paths are
// addressed by name (pin, family, adult-left, ...) by the welcome animation and the Android generator.
const svgoBrand = { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { cleanupIds: false } } }, 'removeDimensions'] };

export function checkIconRules(name, svg) {
  const errs = [];
  if (!/viewBox="0 0 24 24"/.test(svg)) errs.push('viewBox must be 0 0 24 24');
  if (!/stroke-width="1\.75"/.test(svg)) errs.push('stroke-width must be 1.75');
  if (!/stroke-linecap="round"/.test(svg)) errs.push('stroke-linecap must be round');
  if (!/stroke-linejoin="round"/.test(svg)) errs.push('stroke-linejoin must be round');
  if (/<image|data:image|\.png|\.jpe?g/i.test(svg)) errs.push('raster content is not allowed');
  if (/#[0-9a-f]{3,6}/i.test(svg)) errs.push('use currentColor, no hard-coded colors');
  if (/[-_]filled$/.test(name) === false && /fill="currentColor"/.test(svg) && !/fill-opacity/.test(svg) && !/h\.01|h0\.01/.test(svg))
    errs.push('solid fill only allowed in -filled variants');
  return errs;
}

/** Brand artwork rules: vector only, no font dependency, a viewBox, a title for assistive tech. */
export function checkBrandRules(name, svg) {
  const errs = [];
  if (/<image|data:|\.png|\.jpe?g|\.gif|\.webp/i.test(svg)) errs.push('raster content is not allowed');
  if (/<text|<tspan|font-family|@font-face/i.test(svg)) errs.push('text must be converted to paths (no font dependency)');
  if (/<script|<foreignObject/i.test(svg)) errs.push('scripts / foreignObject are not allowed');
  if (!/viewBox="/.test(svg)) errs.push('viewBox is required');
  if (name !== 'google-g' && !/<title>[^<]+<\/title>/.test(svg)) errs.push('a <title> is required');
  return errs;
}

// Logo files that must exist (the launcher, splash, animation and themed icon depend on them).
const REQUIRED_BRAND = ['logo-mark', 'logo-mark-line', 'logo-app', 'logo-app-small', 'logo-mono', 'logo-wordmark', 'logo-wordmark-dark', 'logo-lockup', 'logo-lockup-dark'];

const icons = fs.readdirSync(SRC).filter((f) => f.endsWith('.svg')).sort();
const brand = fs.readdirSync(path.join(SRC, 'brand')).filter((f) => f.endsWith('.svg')).sort();
let failures = 0;
const keep = new Set();
const names = [];

for (const f of icons) {
  const name = f.replace(/\.svg$/, '');
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
  const errs = checkIconRules(name, raw);
  if (errs.length) { console.error(`${f}: ${errs.join('; ')}`); failures++; }
  const out = optimize(raw, svgoConfig).data;
  emit(`app/assets/icons/${f}`, out + '\n');
  emit(`shared/web/icons/${f}`, out + '\n');
  keep.add(f);
  names.push(name);
}

const brandRaw = {};
for (const req of REQUIRED_BRAND) if (!brand.includes(`${req}.svg`)) { console.error(`brand/${req}.svg is missing`); failures++; }
for (const f of brand) {
  const name = f.replace(/\.svg$/, '');
  const raw = fs.readFileSync(path.join(SRC, 'brand', f), 'utf8');
  brandRaw[name] = raw;
  const errs = checkBrandRules(name, raw);
  if (errs.length) { console.error(`brand/${f}: ${errs.join('; ')}`); failures++; }
  const out = optimize(raw, svgoBrand).data;
  emit(`app/assets/brand/${f}`, out + '\n');
  emit(`shared/web/brand/${f}`, out + '\n');
}
prune('app/assets/icons', keep);
prune('app/assets/brand', new Set(brand));
prune('shared/web/brand', new Set(brand));

// ---------------------------------------------------------------------------------------------
// Path data helpers (used for Android vector drawables and the Dart painter).
const pathById = (name, id) => {
  const m = brandRaw[name]?.match(new RegExp(`<path[^>]*\\bid="${id}"[^>]*\\bd="([^"]+)"`)) ||
    brandRaw[name]?.match(new RegExp(`<path[^>]*\\bd="([^"]+)"[^>]*\\bid="${id}"`));
  if (!m) { console.error(`brand/${name}.svg: path #${id} not found`); failures++; return 'M0 0'; }
  return m[1];
};

/** Parses SVG path data into absolute commands: M, L, C, Q, Z (H/V/S/T expanded; arcs rejected). */
export function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out.push(['Z']); x = sx; y = sy; lc = lq = null; continue; }
    if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
    if (C === 'L') { x = ox + num(); y = oy + num(); out.push(['L', x, y]); lc = lq = null; continue; }
    if (C === 'H') { x = ox + num(); out.push(['L', x, y]); lc = lq = null; continue; }
    if (C === 'V') { y = oy + num(); out.push(['L', x, y]); lc = lq = null; continue; }
    if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = ox + num(); y1 = oy + num(); } else { x1 = lc ? 2 * x - lc[0] : x; y1 = lc ? 2 * y - lc[1] : y; }
      const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
      out.push(['C', x1, y1, x2, y2, ex, ey]); lc = [x2, y2]; lq = null; x = ex; y = ey; continue;
    }
    if (C === 'Q' || C === 'T') {
      let x1, y1;
      if (C === 'Q') { x1 = ox + num(); y1 = oy + num(); } else { x1 = lq ? 2 * x - lq[0] : x; y1 = lq ? 2 * y - lq[1] : y; }
      const ex = ox + num(), ey = oy + num();
      out.push(['Q', x1, y1, ex, ey]); lq = [x1, y1]; lc = null; x = ex; y = ey; continue;
    }
    throw new Error(`unsupported path command ${cmd} (convert arcs to curves)`);
  }
  return out;
}
const f2 = (n) => String(Math.round(n * 100) / 100);
const absD = (d) => parsePath(d).map(([c, ...a]) => c + a.map(f2).join(' ')).join('');

// ---------------------------------------------------------------------------------------------
// Android: adaptive launcher icon (vector foreground in the 66dp safe zone of the 108dp canvas,
// gradient background, monochrome for Android 13 themed icons) and the splash icon.
const RES = 'app/android/app/src/main/res';
const EMERALD = '#FF059669', TEAL = '#FF0D9488';
const mono = absD(pathById('logo-mono', 'mono'));
// Pin bbox centre in the 48 grid is (24, 24.7). Scale 1.35 -> 56dp tall, all points within r=28dp.
const LAUNCHER_SCALE = 1.35;
const vec = (size, body) => `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by tools/build-icons.mjs from shared/icons/brand. Do not edit. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="${size}dp"
    android:height="${size}dp"
    android:viewportWidth="${size}"
    android:viewportHeight="${size}">
${body}
</vector>
`;
const pinGroup = (cx, cy, s, color) => `    <group
        android:translateX="${f2(cx - 24 * s)}"
        android:translateY="${f2(cy - 24.7 * s)}"
        android:scaleX="${s}"
        android:scaleY="${s}">
        <path
            android:fillColor="${color}"
            android:fillType="evenOdd"
            android:pathData="${mono}" />
    </group>`;
const gradient = (x0, y0, x1, y1) => `        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="${x0}" android:startY="${y0}"
                android:endX="${x1}" android:endY="${y1}">
                <item android:offset="0" android:color="${EMERALD}" />
                <item android:offset="1" android:color="${TEAL}" />
            </gradient>
        </aapt:attr>`;
emit(`${RES}/drawable/ic_launcher_foreground.xml`, vec(108, pinGroup(54, 54, LAUNCHER_SCALE, '#FFFFFFFF')));
emit(`${RES}/drawable/ic_launcher_monochrome.xml`, vec(108, pinGroup(54, 54, LAUNCHER_SCALE, '#FFFFFFFF')));
emit(`${RES}/drawable/ic_launcher_background.xml`, vec(108, `    <path android:pathData="M0,0h108v108h-108z">
${gradient(0, 0, 108, 108)}
    </path>`));
// Splash icon: the app tile (128dp, rx 29.33) centred on the 288dp splash canvas; Android 12+ masks the
// icon to a 192dp circle, and the tile's corners stay inside it (max radius ~78dp).
const T0 = 80, T = 128, k = T / 48, R = T * 11 / 48; // same corner ratio as logo-app.svg (rx 11 of 48)
emit(`${RES}/drawable/splash_icon.xml`, vec(288, `    <path android:pathData="M${f2(T0 + R)},${T0}h${f2(T - 2 * R)}a${f2(R)},${f2(R)} 0 0 1 ${f2(R)},${f2(R)}v${f2(T - 2 * R)}a${f2(R)},${f2(R)} 0 0 1 -${f2(R)},${f2(R)}h-${f2(T - 2 * R)}a${f2(R)},${f2(R)} 0 0 1 -${f2(R)},-${f2(R)}v-${f2(T - 2 * R)}a${f2(R)},${f2(R)} 0 0 1 ${f2(R)},-${f2(R)}z">
${gradient(T0, T0, T0 + T, T0 + T)}
    </path>
${pinGroup(144, 144, Math.round(0.8 * k * 1000) / 1000, '#FFFFFFFF')}`));
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by tools/build-icons.mjs. Do not edit. minSdk 26: this covers every device. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`;
emit(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
emit(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);

// ---------------------------------------------------------------------------------------------
// Dart path data for the welcome draw-on (AnimatedLogo). Paths are built once, lazily.
const dartPath = (name, d) => {
  const ops = parsePath(d).map(([c, ...a]) => {
    const v = a.map((n) => `${f2(n).includes('.') ? f2(n) : f2(n) + '.0'}`).join(', ');
    return c === 'M' ? `..moveTo(${v})` : c === 'L' ? `..lineTo(${v})` : c === 'C' ? `..cubicTo(${v})` : c === 'Q' ? `..quadraticBezierTo(${v})` : '..close()';
  });
  return `  /// From \`${name.replace('-fill', '')}\`.\n  static final ${camel(name.split('#')[1])} = Path()\n${chunk(ops)};\n`;
};
const chunk = (ops) => {
  const lines = []; let cur = '    ';
  for (const o of ops) { if ((cur + o).length > 110) { lines.push(cur); cur = '    '; } cur += o; }
  lines.push(cur);
  return lines.join('\n');
};
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const logoDart = `// GENERATED by tools/build-icons.mjs from shared/icons/brand/logo-mark*.svg. Do not edit.
// 48x48 design grid. Fill paths = logo-mark.svg, stroke paths = logo-mark-line.svg.
import 'dart:ui';

abstract final class LogoPaths {
  static const double grid = 48;

${[
  ['logo-mark#pin', pathById('logo-mark', 'pin')],
  ['logo-mark#family-fill', pathById('logo-mark', 'family')],
  ['logo-mark-line#adult-left', pathById('logo-mark-line', 'adult-left')],
  ['logo-mark-line#adult-right', pathById('logo-mark-line', 'adult-right')],
  ['logo-mark-line#child', pathById('logo-mark-line', 'child')],
].map(([n, d]) => dartPath(n, d)).join('\n')}}
`;
emit('app/lib/core/widgets/brand/logo_paths.g.dart', logoDart);

// ---------------------------------------------------------------------------------------------
const doc = {
  logoMark: 'Map-pin badge with the family (two adults + child). Use on light or dark surfaces.',
  logoMarkLine: 'Single-colour stroke version (currentColor); paths are named for the draw-on.',
  logoApp: 'App tile: emerald rounded square with the white pin. 40dp in the Home header.',
  logoAppSmall: 'Simplified app tile for 16-32px (wider gaps, bigger heads).',
  logoMono: 'Single-colour knockout mark (currentColor): themed icons, print, watermarks.',
  logoMonoSmall: 'Single-colour knockout mark simplified for small sizes.',
  logoWordmark: '"Nirapod" wordmark for light surfaces (Noto Sans outlines).',
  logoWordmarkDark: '"Nirapod" wordmark for dark surfaces.',
  logoLockup: 'Horizontal lockup: mark + Nirapod + Live Family Locator (light surfaces).',
  logoLockupDark: 'Horizontal lockup for dark surfaces.',
  logoLockupStacked: 'Stacked lockup with the slogan (light surfaces).',
  logoLockupStackedDark: 'Stacked lockup with the slogan (dark surfaces).',
  illustrationParent: '"Who are you?" card: parent / guardian at home.',
  illustrationChild: '"Who are you?" card: child with a family code.',
  illustrationProbashi: '"Who are you?" card: probashi living abroad (plane).',
  illustrationMember: '"Who are you?" card: other family member (invitation).',
  illustrationWelcome: 'Welcome background: family walking in a soft green landscape (360x200).',
  googleG: 'Google "G" for Continue with Google (brand guidelines: do not recolor).',
};
const dart = `// GENERATED by tools/build-icons.mjs. Do not edit.
// All icons are SVG on a 24dp grid, 1.75dp stroke, rounded caps and joins.
abstract final class AppIcons {
${names.map((n) => `  static const ${camel(n)} = 'assets/icons/${n}.svg';`).join('\n')}

  static const all = <String>[
${names.map((n) => `    ${camel(n)},`).join('\n')}
  ];
}

/// Brand artwork (logo system and illustrations). Vector only; see docs/ui-board/brand-sheet.html.
abstract final class BrandAssets {
${brand.map((f) => { const c = camel(f.replace(/\.svg$/, '')); return `${doc[c] ? `  /// ${doc[c]}\n` : ''}  static const ${c} = 'assets/brand/${f}';`; }).join('\n')}

  static const all = <String>[
${brand.map((f) => `    ${camel(f.replace(/\.svg$/, ''))},`).join('\n')}
  ];
}
`;
emit('app/lib/core/icons/app_icons.g.dart', dart);

const sheet = `<!doctype html><meta charset="utf-8"><title>Nirapod icon sheet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px/1.4 system-ui,sans-serif;margin:20px;background:#F6F8F7;color:#0F2A24}
h1{font-size:22px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
.c{background:#fff;border:1px solid #E5EAE8;border-radius:16px;padding:12px;text-align:center}
.c img{width:24px;height:24px}.c .lg img{width:48px;height:48px}.n{font-size:12px;color:#5B6C67;word-break:break-all}
.dark{background:#0B1512;color:#E8F1EE}.dark .c{background:#121F1B;border-color:#20322D}.dark img{filter:invert(1)}</style>
<h1>Nirapod icons (${names.length})</h1>
<p>24dp grid, 1.75dp stroke, round caps and joins, currentColor. Filled variants are used for selected states. Brand artwork: <a href="brand-sheet.html">brand sheet</a>.</p>
${['', 'dark'].map((cls) => `<section class="${cls}" style="padding:12px;border-radius:16px"><h2>${cls ? 'Dark' : 'Light'}</h2><div class="g">
${names.map((n) => `<div class="c"><img src="../../shared/web/icons/${n}.svg" alt=""><span class="lg"><img src="../../shared/web/icons/${n}.svg" alt=""></span><div class="n">${n}</div></div>`).join('\n')}
</div></section>`).join('\n')}
`;
emit('docs/ui-board/icon-sheet.html', sheet);
emit('docs/ui-board/brand-sheet.html', brandSheet());

function brandSheet() {
  const b = (f) => `../../shared/web/brand/${f}.svg`;
  const card = (title, inner, dark) => `<figure class="card${dark ? ' dk' : ''}"><div class="art">${inner}</div><figcaption>${title}</figcaption></figure>`;
  const img = (f, h, alt = '') => `<img src="${b(f)}" style="height:${h}px" alt="${alt}">`;
  // currentColor artwork cannot inherit colour inside <img>: tint it with a CSS mask instead.
  const tint = (f, size, color, cls = '') => `<span class="${cls}" style="display:inline-block;width:${size}px;height:${size}px;background:${color};-webkit-mask:url(${b(f)}) center/contain no-repeat;mask:url(${b(f)}) center/contain no-repeat"></span>`;
  const launcher = (shape, color = '#fff') => `<div class="li ${shape}">${tint('logo-mono', f2(96 * 48 * LAUNCHER_SCALE / 108), color, 'fg')}</div>`;
  const phone = (dark, stage) => `<div class="phone${dark ? ' pd' : ''}"><div class="sb"></div>${stage === 'native'
    ? `<img src="${b('logo-app')}" class="tile" alt="">`
    : `<img src="${b('logo-app')}" class="tile up" alt=""><img src="${b(dark ? 'logo-wordmark-dark' : 'logo-wordmark')}" class="wm" alt=""><div class="tg">Live Family Locator</div>`}</div>`;
  const illus = ['parent', 'child', 'probashi', 'member'];
  return `<!doctype html><meta charset="utf-8"><title>Nirapod brand sheet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- GENERATED by tools/build-icons.mjs. Do not edit. PNG renders live next to this file. -->
<style>
:root{--bg:#F6F8F7;--sf:#fff;--bd:#E5EAE8;--tx:#0F2A24;--mu:#5B6C67}
body{font:14px/1.45 system-ui,'Noto Sans',sans-serif;margin:0;padding:24px;background:var(--bg);color:var(--tx);max-width:1180px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}p{color:var(--mu);margin:0 0 8px;max-width:70ch}
.row{display:flex;flex-wrap:wrap;gap:12px}
.card{margin:0;background:var(--sf);border:1px solid var(--bd);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:150px}
.card.dk{background:#0B1512;border-color:#20322D;color:#E8F1EE}.card.dk figcaption{color:#8FA39D}
.art{display:flex;align-items:flex-end;gap:14px;min-height:60px}figcaption{font-size:12px;color:var(--mu)}
.mono{color:#0F2A24}.dk .mono{color:#E8F1EE}
.li{width:96px;height:96px;background:linear-gradient(135deg,#059669,#0D9488);position:relative;overflow:hidden}
.li .fg{position:absolute;left:50%;top:50%;transform:translate(-50%,-${f2(50 + (0.7 / 48) * 100)}%)}
.li.circle{border-radius:50%}.li.squircle{border-radius:30%}.li.rounded{border-radius:16px}.li.teardrop{border-radius:50% 50% 50% 16%}
.li.themed{background:#DCEFE7}.li.themed-d{background:#1E2B27}
.phone{width:180px;height:360px;border-radius:26px;background:#F6F8F7;border:6px solid #0F2A24;position:relative;overflow:hidden}
.phone.pd{background:#0B1512;border-color:#33463F}.phone .sb{height:14px}
.tile{position:absolute;width:${f2(180 * 128 / 412)}px;left:50%;top:50%;transform:translate(-50%,-50%)}
.tile.up{transform:translate(-50%,-90%)}
.wm{position:absolute;height:22px;left:50%;top:56%;transform:translateX(-50%)}
.tg{position:absolute;width:100%;top:66%;text-align:center;font-size:11px;font-weight:600;color:#047857}.pd .tg{color:#34D399}
.il{background:var(--sf);border:1px solid var(--bd);border-radius:20px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:6px}
.il img{width:200px}.sw{width:120px;border-radius:12px;padding:10px;color:#fff;font-size:12px}
</style>
<h1>Nirapod brand</h1>
<p>Your family, our priority. A map pin that holds a family: two adults and a child, in emerald with a subtle emerald to teal gradient. Calm, trustworthy, vector only (SVG and Android vector drawables).</p>
<h2>Logo system</h2>
<div class="row">
${card('logo-mark: 160 / 48 / 24', img('logo-mark', 160) + img('logo-mark', 48) + img('logo-mark', 24))}
${card('logo-mark on dark', img('logo-mark', 160) + img('logo-mark', 48) + img('logo-mark', 24), true)}
${card('logo-mark-line (draw-on paths, currentColor)', tint('logo-mark-line', 160, '#059669'))}
${card('logo-mono / logo-mono-small (one colour)', tint('logo-mono', 96, '#0F2A24') + tint('logo-mono-small', 32, '#0F2A24'))}
${card('logo-app: 180 / 96 / 48 / 40 header', img('logo-app', 180) + img('logo-app', 96) + img('logo-app', 48) + img('logo-app', 40))}
${card('logo-app-small: 32 / 24 / 16', img('logo-app-small', 32) + img('logo-app-small', 24) + img('logo-app-small', 16), true)}
</div>
<h2>Wordmark and lockups</h2>
<div class="row">
${card('logo-lockup', img('logo-lockup', 72))}
${card('logo-lockup-dark', img('logo-lockup-dark', 72), true)}
${card('logo-lockup-stacked', img('logo-lockup-stacked', 228))}
${card('logo-lockup-stacked-dark', img('logo-lockup-stacked-dark', 228), true)}
${card('logo-wordmark / -dark (header uses Text in Noto Sans 20sp bold)', img('logo-wordmark', 40) + '</div><div class="art" style="background:#0B1512;border-radius:10px;padding:8px">' + img('logo-wordmark-dark', 40))}
</div>
<h2>Android launcher icon (adaptive, vector)</h2>
<p>Foreground: white pin, 56dp tall, inside the 66dp safe zone of the 108dp canvas. Background: emerald to teal gradient. Monochrome layer for Android 13 themed icons.</p>
<div class="row">
${card('circle', launcher('circle'))}${card('squircle', launcher('squircle'))}${card('rounded square', launcher('rounded'))}${card('teardrop', launcher('teardrop'))}
${card('themed (light)', launcher('circle themed', '#0F5132'))}${card('themed (dark)', launcher('circle themed-d', '#A7E8CF'), true)}
</div>
<h2>Splash (native, then Flutter)</h2>
<p>Native splash (Android 12+ SplashScreen API and pre-12 launch theme): the 128dp app tile centred on the app background, light #F6F8F7 / dark #0B1512. The Flutter SplashBrand starts on exactly that frame, then lifts the tile and reveals the wordmark and tagline with a soft pulse ring.</p>
<div class="row">
${card('light: native frame', phone(false, 'native'))}${card('light: Flutter reveal', phone(false, 'reveal'))}
${card('dark: native frame', phone(true, 'native'), true)}${card('dark: Flutter reveal', phone(true, 'reveal'), true)}
</div>
<h2>Illustrations</h2>
<p>"Who are you?" cards and the Welcome background. Faceless flat figures, brand palette, few colours.</p>
<div class="row">
${illus.map((n) => `<div class="il"><img src="${b('illustration-' + n)}" alt=""><figcaption>illustration-${n}</figcaption></div>`).join('')}
<div class="il" style="flex-basis:100%"><img src="${b('illustration-welcome')}" style="width:min(720px,100%)" alt=""><figcaption>illustration-welcome</figcaption></div>
</div>
<h2>Palette</h2>
<div class="row">
<div class="sw" style="background:#059669">Emerald #059669</div><div class="sw" style="background:#047857">Pressed #047857</div>
<div class="sw" style="background:#0D9488">Teal 600 #0D9488</div><div class="sw" style="background:#14B8A6;color:#0F2A24">Accent #14B8A6</div>
<div class="sw" style="background:#0F2A24">Ink #0F2A24</div><div class="sw" style="background:#0B1512">Dark bg #0B1512</div>
</div>
`;
}

if (failures) { console.error(`${failures} icon(s) break the house style`); process.exit(1); }
done(`icons (${names.length} + ${brand.length} brand)`);
