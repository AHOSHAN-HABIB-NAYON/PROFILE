// Builds Google Play phone screenshots (1080 x 1920) from real app screenshots.
// Usage: node make-store-images.js <screenshotsDir> <outDir> [prefix]
//   prefix: "play-" to use the Play-edition screenshots (default), "" for Full edition.
// Requires Playwright (npm i -g playwright) and a Chromium browser.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , shotsDir, outDir, prefixArg] = process.argv;
const prefix = prefixArg === undefined ? 'play-' : prefixArg;
if (!shotsDir || !outDir) {
  console.error('Usage: node make-store-images.js <screenshotsDir> <outDir> [prefix]');
  process.exit(1);
}

// One slide per feature: headline, sub-headline, colours, screenshot.
const slides = [
  { file: '01-home', title: 'Your phone,<br>at a glance', sub: 'RAM, storage, battery, temperature and a health score', from: '#2A7BFF', to: '#0B1B3F' },
  { file: '03-boost', title: 'Boost in<br>one tap', sub: 'Close background apps and see the real RAM freed', from: '#1E6BFF', to: '#12B5E5' },
  { file: '04-cool-down', title: 'Cool your<br>phone down', sub: 'Less load, lower brightness, live temperature', from: '#0891B2', to: '#14B8A6' },
  { file: '05-cleaner', title: 'Clean cache<br>& big files', sub: 'See what every app stores and remove only what you choose', from: '#0F766E', to: '#16A34A' },
  { file: '06-battery', title: 'Battery health<br>& cycles', sub: 'Health, charge cycles, capacity and charging power', from: '#15803D', to: '#0B1B3F' },
  { file: '07-temperature', title: 'Live<br>temperature', sub: 'Battery temperature and Android thermal status', from: '#EA580C', to: '#9A3412' },
  { file: '08-apps', title: 'Manage<br>your apps', sub: 'Search, review and uninstall apps safely', from: '#7C3AED', to: '#312E81' },
  { file: '11-settings', title: 'Private<br>by design', sub: 'No account · No ads · No tracking · Dark mode', from: '#0B1B3F', to: '#1E6BFF' },
];

function html(s, img) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; overflow: hidden; position: relative;
         font-family: "Inter", "Roboto", system-ui, sans-serif; color: #fff;
         background: linear-gradient(160deg, ${s.from} 0%, ${s.to} 100%); }
  .c1 { position: absolute; width: 760px; height: 760px; border-radius: 50%; right: -260px; top: -220px; background: rgba(255,255,255,.08); }
  .c2 { position: absolute; width: 520px; height: 520px; border-radius: 50%; left: -220px; top: 760px; background: rgba(255,255,255,.06); }
  .head { position: absolute; left: 0; right: 0; top: 110px; text-align: center; padding: 0 70px; }
  h1 { font-size: 96px; line-height: 1.05; font-weight: 800; letter-spacing: -1.5px; text-shadow: 0 6px 24px rgba(0,0,0,.18); }
  p { font-size: 40px; line-height: 1.3; margin: 26px auto 0; max-width: 820px; opacity: .92; font-weight: 500; }
  .phone { position: absolute; left: 50%; transform: translateX(-50%); top: 560px; width: 760px; height: 1560px;
           border-radius: 84px; background: #0B1B3F; padding: 22px; box-shadow: 0 40px 90px rgba(0,0,0,.42); }
  .phone::before { content: ""; position: absolute; top: 40px; left: 50%; transform: translateX(-50%); width: 26px; height: 26px; border-radius: 50%; background: #1f2d4f; z-index: 2; }
  .screen { width: 100%; height: 100%; border-radius: 64px; overflow: hidden; background: #f5f8ff; }
  .screen img { width: 100%; display: block; }
  </style></head><body><div class="c1"></div><div class="c2"></div>
  <div class="head"><h1>${s.title}</h1><p>${s.sub}</p></div>
  <div class="phone"><div class="screen"><img src="${img}"></div></div>
  </body></html>`;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  let n = 0;
  for (const s of slides) {
    const shot = path.resolve(shotsDir, `${prefix}${s.file}.png`);
    if (!fs.existsSync(shot)) { console.warn('missing', shot); continue; }
    n++;
    // Embed the screenshot as a data URI (local files are blocked on a blank page).
    const dataUri = 'data:image/png;base64,' + fs.readFileSync(shot).toString('base64');
    await page.setContent(html(s, dataUri), { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const out = path.join(outDir, `${String(n).padStart(2, '0')}-${s.file.replace(/^\d+-/, '')}.png`);
    await page.screenshot({ path: out });
    console.log('wrote', out);
  }
  await browser.close();
})();
