import { setting } from '../../core/settings.js';
import { esc } from '../../core/html.js';

export function maintenancePage() {
  const t = esc(setting('maintenance_title', 'আপডেট চলছে'));
  const m = esc(setting('maintenance_text', 'আমরা সাইটটি আরও উন্নত করছি। একটু পরেই আবার ফিরে আসছি।'));
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t}</title>
<link rel="stylesheet" href="/css/fonts.css"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:'Hind Siliguri',system-ui,sans-serif;background:linear-gradient(160deg,#0b1211,#0f2e2a);color:#e6f0ee;padding:24px;text-align:center}
.c{max-width:380px}.g{width:84px;height:84px;margin:0 auto 22px;border-radius:24px;background:linear-gradient(135deg,#0f766e,#2dd4bf);display:grid;place-items:center;box-shadow:0 20px 50px rgba(45,212,191,.3);animation:f 3s ease-in-out infinite}
.g i{width:34px;height:34px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:s 1s linear infinite}
h1{font-size:1.5rem;margin:0 0 8px}p{color:#a3b5b1;margin:0 0 24px;line-height:1.7}
.b{height:6px;border-radius:9px;background:#ffffff1f;overflow:hidden}.b span{display:block;height:100%;width:40%;border-radius:9px;background:linear-gradient(90deg,#2dd4bf,#f59e0b);animation:l 1.6s ease-in-out infinite}
@keyframes s{to{transform:rotate(360deg)}}@keyframes f{50%{transform:translateY(-8px)}}@keyframes l{0%{margin-left:-40%}100%{margin-left:100%}}
</style></head><body><div class="c"><div class="g"><i></i></div><h1>${t}</h1><p>${m}</p><div class="b"><span></span></div></div></body></html>`;
}
