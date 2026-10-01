<?php
/* ===== হেডার + সাইটের বেস ডিজাইন (এই ফাইলের CSS এই ফাইলেই) =====
   ডিজাইন ৩.০ — সবুজ অ্যাপ-বার, কার্ড-ভিত্তিক লেআউট, লাইট ও ডার্ক মোড */

css_once('base', <<<CSS
:root{
  --brand:#0f766e; --brand-d:#0b544e; --brand-2:#16a08a; --brand-l:#e6f4f1; --brand-ll:#f0f8f6;
  --ink:#13211f; --ink-2:#2c4540; --muted:#64757a; --line:#e4eae8; --line-2:#edf2f1;
  --bg:#f3f7f6; --card:#ffffff; --soft:#f6faf9; --chip:#eef4f2;
  --gold:#b45309; --danger:#e03b2f; --ok:#12804a; --blue:#2563eb; --blue-l:#e8f0fe;
  --hd-grad:linear-gradient(135deg,#083d39 0%,#0b544e 48%,#0f766e 100%);
  --hero-grad:linear-gradient(160deg,#083d39 0%,#0d6b63 52%,#13897c 100%);
  --r:18px; --r-sm:12px;
  --sh:0 1px 2px rgba(16,40,36,.05),0 8px 24px rgba(16,40,36,.06);
  --sh-lg:0 18px 44px rgba(16,40,36,.14);
  --head-h:64px; --bar-h:0px;
  --wrap:1080px;
  color-scheme:light;
}
html[data-theme="dark"]{
  --brand:#2bb3a0; --brand-d:#5fd6c3; --brand-2:#34c4b0; --brand-l:#12332f; --brand-ll:#0e2725;
  --ink:#e6efed; --ink-2:#c6d4d0; --muted:#8fa39e; --line:#22332f; --line-2:#1c2a28;
  --bg:#0a1312; --card:#111c1b; --soft:#152321; --chip:#182927;
  --blue-l:#16233d;
  --hd-grad:linear-gradient(135deg,#03221f 0%,#053532 60%,#074a45 100%);
  --hero-grad:linear-gradient(160deg,#03221f 0%,#053a35 55%,#08524b 100%);
  --sh:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);
  --sh-lg:0 18px 44px rgba(0,0,0,.45);
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{
  margin:0;background:var(--bg);color:var(--ink);
  font-family:"Hind Siliguri","Noto Sans Bengali",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:16px;line-height:1.7;overflow-x:hidden;
  padding-top:calc(var(--head-h) + var(--bar-h) + env(safe-area-inset-top));
  -webkit-tap-highlight-color:transparent;transition:background-color .25s,color .25s;
}
img{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
button{font-family:inherit;cursor:pointer;color:inherit}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:6px}
.container{max-width:var(--wrap);margin:0 auto;padding:16px;min-height:52vh}
.card{background:var(--card);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:var(--sh)}
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* রঙিন আইকন টাইল (ক্যাটাগরি গ্রিড, সাইডবার, সেকশন) */
.tone-1{--t1:#16a34a;--t2:#0b7a3b;--tl:#e5f7ec}
.tone-2{--t1:#3b82f6;--t2:#1d5fd6;--tl:#e8f0fe}
.tone-3{--t1:#8b5cf6;--t2:#6d3fe0;--tl:#f1ebfe}
.tone-4{--t1:#f59e0b;--t2:#e07b06;--tl:#fef4e2}
.tone-5{--t1:#ef4444;--t2:#d22c2c;--tl:#fdeaea}
.tone-6{--t1:#14b8a6;--t2:#0b8f81;--tl:#e3f8f5}
html[data-theme="dark"] .tone-1,html[data-theme="dark"] .tone-2,html[data-theme="dark"] .tone-3,
html[data-theme="dark"] .tone-4,html[data-theme="dark"] .tone-5,html[data-theme="dark"] .tone-6{--tl:rgba(255,255,255,.06)}
.tile-ic{width:46px;height:46px;flex:none;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:1.05rem;
  background:linear-gradient(145deg,var(--t1),var(--t2));box-shadow:0 6px 14px color-mix(in srgb,var(--t1) 35%,transparent)}

/* সেকশন হেডিং */
.sec-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 0 12px}
.sec-l{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.sec-ic{width:38px;height:38px;flex:none;border-radius:12px;display:grid;place-items:center;font-size:.98rem;
  color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 6px 14px rgba(15,118,110,.25)}
.sec-ic.fire{background:linear-gradient(135deg,#f97316,#ef4444);box-shadow:0 6px 14px rgba(239,68,68,.28)}
.sec-title h2{font-size:1.12rem;margin:0;font-weight:700;letter-spacing:-.3px;line-height:1.35;min-width:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec-title h2 small{display:block;font-size:.74rem;font-weight:500;color:var(--muted);letter-spacing:0;line-height:1.45;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cnt-pill{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 4px 6px 10px;border-radius:999px;
  font-size:.84rem;font-weight:700;color:var(--brand);transition:.18s}
.cnt-pill i{font-size:.74rem;transition:transform .2s}
.cnt-pill:hover{color:var(--brand-d)}
.cnt-pill:hover i{transform:translateX(3px)}

/* আরও দেখুন */
.more-wrap{display:grid;place-items:center;margin:20px 0 6px}
.more-btn{display:inline-flex;align-items:center;gap:9px;padding:12px 24px;border-radius:999px;border:1px solid var(--line);
  background:var(--card);color:var(--ink-2);font-weight:600;font-size:.92rem;box-shadow:var(--sh);transition:.18s}
.more-btn:hover{border-color:var(--brand);color:var(--brand)}
.more-btn:active{transform:scale(.97)}
.more-btn i{color:var(--brand);font-size:.84rem}
.more-spin{color:var(--muted);font-size:.88rem;padding:10px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,var(--brand),var(--brand-2));
  color:#fff;border:0;padding:12px 22px;border-radius:14px;font-weight:700;font-size:.95rem;
  box-shadow:0 8px 18px rgba(15,118,110,.24);transition:filter .18s,transform .18s}
.btn:hover{filter:brightness(1.06)}
.btn:active{transform:scale(.97)}
.btn-ghost{background:var(--card);color:var(--brand);border:1.5px solid var(--brand);box-shadow:none}
.btn-blue{background:linear-gradient(135deg,#2563eb,#3b82f6);box-shadow:0 8px 18px rgba(37,99,235,.25)}
.empty{padding:48px 18px;text-align:center;color:var(--muted)}
.empty i{font-size:2.2rem;color:var(--line);display:block;margin-bottom:12px}

/* পেজ হিরো (ক্যাটাগরি/সার্চ/নোটিশ পেজের মাথা) */
.hero{position:relative;overflow:hidden;border-radius:22px;padding:18px;margin-bottom:14px;
  background:var(--hero-grad);color:#fff;box-shadow:0 14px 32px rgba(10,70,64,.22);isolation:isolate}
.hero::after{content:"";position:absolute;width:220px;height:220px;border-radius:50%;z-index:-1;
  background:radial-gradient(circle,rgba(255,255,255,.14),transparent 70%);top:-90px;right:-60px}
.hero::before{content:"";position:absolute;inset:auto -20px -40px auto;width:160px;height:90px;z-index:-1;
  background:radial-gradient(ellipse at center,rgba(120,220,200,.22),transparent 70%)}
.hero-in{position:relative;display:flex;align-items:center;gap:13px}
.hero-ic{width:52px;height:52px;flex:none;border-radius:16px;background:rgba(255,255,255,.15);
  border:1px solid rgba(255,255,255,.18);display:grid;place-items:center;font-size:1.3rem;backdrop-filter:blur(4px)}
.hero h1{font-size:1.32rem;margin:0;font-weight:700;letter-spacing:-.4px;line-height:1.35}
.hero p{margin:3px 0 0;font-size:.88rem;opacity:.88}
.hero-chips{position:relative;display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}
.hero-chips span,.hero-chips a{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.14);border-radius:999px;
  padding:3px 11px;font-size:.73rem;font-weight:600;line-height:1.7;display:inline-flex;align-items:center;gap:6px}
.hero-chips i{font-size:.68rem;opacity:.9}
.hero-chips a:hover{background:rgba(255,255,255,.28)}
@media(max-width:700px){
  .hero{padding:15px;border-radius:18px}
  .hero h1{font-size:1.1rem}
  .hero p{font-size:.81rem}
  .hero-ic{width:44px;height:44px;border-radius:13px;font-size:1.12rem}
  .hero-chips span,.hero-chips a{font-size:.69rem;padding:3px 10px}
}

/* পেজের সাধারণ টাইটেল বার (← শিরোনাম) */
.pg-head{display:flex;align-items:center;gap:10px;margin:2px 0 14px}
.pg-head h1{font-size:1.2rem;margin:0;font-weight:700;letter-spacing:-.3px}
.pg-head p{margin:0;font-size:.82rem;color:var(--muted)}

/* SPA পেজ ট্রানজিশন */
#app{animation:pgIn .26s ease both}
#app.is-leaving{opacity:0;transform:translateY(6px);transition:opacity .13s ease,transform .13s ease}
@keyframes pgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* টপ প্রোগ্রেস বার */
#spa-progress{position:fixed;inset:calc(var(--head-h) + var(--bar-h) + env(safe-area-inset-top)) 0 auto 0;height:3px;z-index:120;pointer-events:none;opacity:0;transition:opacity .25s}
#spa-progress.on{opacity:1}
#spa-progress span{display:block;height:100%;width:0;border-radius:0 3px 3px 0;
  background:linear-gradient(90deg,var(--brand),#22c1a4);box-shadow:0 0 10px rgba(15,118,110,.5);transition:width .2s ease}

/* স্কেলিটন লোডার */
.skel{background:linear-gradient(90deg,var(--chip) 25%,var(--soft) 37%,var(--chip) 63%);background-size:400% 100%;
  animation:shimmer 1.2s infinite;border-radius:var(--r-sm)}
@keyframes shimmer{0%{background-position:100% 0}100%{background-position:0 0}}

/* পেজিনেশন */
.pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;margin:22px 0 10px}
.pg{min-width:38px;height:38px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  background:var(--card);border:1px solid var(--line);border-radius:12px;font-weight:600;font-size:.9rem;
  color:var(--ink);transition:.16s}
.pg:hover{border-color:var(--brand);color:var(--brand)}
.pg.active{background:linear-gradient(135deg,var(--brand),var(--brand-2));border-color:transparent;color:#fff;box-shadow:0 6px 14px rgba(15,118,110,.25)}
.pg.dots{border:0;background:none;min-width:22px;color:var(--muted)}
.pg.disabled{opacity:.42;pointer-events:none}
.pg-nav span{font-size:.86rem}

@media(max-width:700px){
  body{font-size:15.5px;padding-bottom:calc(64px + env(safe-area-inset-bottom))}
  .container{padding:12px 12px 8px}
  .sec-title{margin:18px 0 10px;gap:8px}
  .sec-title h2{font-size:1rem}
  .sec-title h2 small{font-size:.7rem}
  .sec-ic{width:34px;height:34px;border-radius:11px;font-size:.88rem}
  .sec-l{gap:9px}
  .cnt-pill{font-size:.78rem}
  .pager{gap:5px;margin:18px 0 8px}
  .pg{min-width:34px;height:34px;padding:0 9px;font-size:.84rem;border-radius:10px}
  .pg-nav span{font-size:.8rem}
}
@media (prefers-reduced-motion: reduce){
  *{animation-duration:.01ms !important;transition-duration:.01ms !important}
  html{scroll-behavior:auto}
}
CSS);

css_once('header', <<<CSS
.hd{position:fixed;top:0;left:0;right:0;z-index:100;background:color-mix(in srgb,var(--card) 95%,transparent);color:var(--ink);
  backdrop-filter:saturate(1.6) blur(12px);-webkit-backdrop-filter:saturate(1.6) blur(12px);
  padding-top:env(safe-area-inset-top);border-bottom:1px solid var(--line);box-shadow:0 2px 14px rgba(16,40,36,.05)}
.hd-in{position:relative;z-index:1;max-width:var(--wrap);margin:0 auto;height:var(--head-h);display:flex;align-items:center;gap:10px;padding:0 12px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand .lg{width:44px;height:44px;flex:none;border-radius:13px;overflow:hidden;box-shadow:0 3px 10px rgba(16,40,36,.12)}
.brand .lg img{width:100%;height:100%;object-fit:cover}
.brand b{font-size:1.16rem;font-weight:700;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;line-height:1.22;color:var(--ink)}
.brand small{display:block;font-size:.72rem;font-weight:500;color:var(--muted);line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd-sp{flex:1}
.ico-btn{position:relative;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--card);
  display:grid;place-items:center;color:var(--ink);font-size:1rem;transition:.18s;flex:none}
.ico-btn:hover{background:var(--brand-l);border-color:color-mix(in srgb,var(--brand) 25%,var(--line));color:var(--brand)}
.ico-btn:active{transform:scale(.92)}
.ico-btn .nb{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;
  background:#e53935;color:#fff;font-size:.6rem;font-weight:700;display:none;align-items:center;justify-content:center;
  box-shadow:0 0 0 2px var(--card)}
.ico-btn .nb.on{display:flex;animation:pop .3s ease}
.ico-btn.bell.on{color:var(--brand)}
.ico-btn.bell.on i{animation:ring 2.4s ease-in-out infinite;transform-origin:50% 0}
@keyframes ring{0%,70%,100%{transform:rotate(0)}75%{transform:rotate(14deg)}80%{transform:rotate(-12deg)}85%{transform:rotate(8deg)}90%{transform:rotate(-4deg)}}
@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
.th-btn .fa-sun{display:none}
html[data-theme="dark"] .th-btn .fa-sun{display:inline-block}
html[data-theme="dark"] .th-btn .fa-moon{display:none}

/* কম্পিউটারের মেনু */
.hd-nav{display:none;align-items:center;gap:2px;margin-left:18px}
.hd-nav a{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;font-size:.9rem;font-weight:600;
  color:var(--ink-2);transition:.16s}
.hd-nav a i{font-size:.82rem;color:var(--brand);opacity:.9}
.hd-nav a:hover{background:var(--brand-l);color:var(--brand)}
.hd-nav a.active{background:var(--brand);color:#fff}
.hd-nav a.active i{color:#fff}
.hd .th-btn{display:none}

/* ---------- সার্চ শিট ---------- */
.hs{position:fixed;inset:0;z-index:150;display:none}
.hs.open{display:block}
.hs-mask{position:absolute;inset:0;background:rgba(9,25,22,.5);backdrop-filter:blur(2px);animation:fadeIn .18s ease both}
.hs-panel{position:absolute;top:0;left:0;right:0;background:var(--card);border-radius:0 0 26px 26px;
  padding:calc(14px + env(safe-area-inset-top)) 14px 20px;box-shadow:0 18px 50px rgba(9,25,22,.25);
  animation:hsDown .28s cubic-bezier(.2,.9,.3,1.1) both;max-height:100vh;overflow-y:auto}
@keyframes hsDown{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}
.hs-wrap{max-width:var(--wrap);margin:0 auto}
.hs-row{display:flex;align-items:center;gap:9px}
.hs-field{flex:1;position:relative;display:flex;align-items:center}
.hs-field>i.mg{position:absolute;left:16px;color:var(--brand);font-size:.95rem;pointer-events:none}
.hs-field input{width:100%;height:52px;border:1.5px solid var(--line);border-radius:16px;background:var(--soft);color:var(--ink);
  padding:0 46px 0 44px;font:inherit;font-size:.96rem;transition:.18s}
.hs-field input:focus{outline:none;border-color:var(--brand);background:var(--card);box-shadow:0 0 0 4px rgba(15,118,110,.12)}
.hs-field input::-webkit-search-cancel-button{display:none}
.hs-clear{position:absolute;right:9px;width:32px;height:32px;border-radius:50%;border:0;background:var(--chip);
  color:var(--muted);display:grid;place-items:center;font-size:.78rem;transition:.16s}
.hs-clear:hover{background:var(--danger);color:#fff}
.hs-go{width:52px;height:52px;border-radius:16px;border:0;background:linear-gradient(135deg,var(--brand),var(--brand-2));
  color:#fff;font-size:1rem;flex:none;transition:.18s;box-shadow:0 6px 14px rgba(15,118,110,.28)}
.hs-go:active{transform:scale(.94)}
.hs-lbl{font-size:.82rem;font-weight:700;color:var(--ink-2);margin:18px 0 9px;display:flex;align-items:center;gap:8px}
.hs-lbl i{color:var(--brand);font-size:.78rem}
.hs-chips{display:flex;gap:7px;flex-wrap:wrap}
.hs-chips.scroll{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:3px}
.hs-chips.scroll::-webkit-scrollbar{display:none}
.hs-chip{flex:none;display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;
  background:var(--soft);border:1px solid var(--line);font-size:.84rem;font-weight:600;color:var(--ink-2);transition:.16s;white-space:nowrap}
.hs-chip:hover{background:var(--brand);border-color:var(--brand);color:#fff}
.hs-chip i{font-size:.72rem;opacity:.7}
.hs-chip:hover i{color:#fff;opacity:1}
.hs-list{display:grid;gap:2px}
.hs-li{display:flex;align-items:center;gap:12px;padding:9px 6px;border-radius:12px;font-size:.92rem;font-weight:500;color:var(--ink-2)}
.hs-li:hover{background:var(--soft)}
.hs-li .n{width:24px;height:24px;flex:none;border-radius:8px;background:var(--brand-l);color:var(--brand);
  display:grid;place-items:center;font-size:.74rem;font-weight:700}
.hs-li .ar{margin-left:auto;color:var(--muted);font-size:.74rem}

@media(min-width:1024px){
  .hd-nav{display:flex}
  .hd .th-btn{display:grid}
}
@media(max-width:700px){
  :root{--head-h:60px}
  .brand .lg{width:40px;height:40px;border-radius:12px}
  .brand b{font-size:1.04rem}
  .brand small{font-size:.66rem}
  .hd-in{gap:6px;padding:0 8px}
  .ico-btn{width:38px;height:38px}
}
CSS);

/* =========================================================
   বড় স্ক্রিনের (কম্পিউটার) লেআউট — পুরোটাই min-width মিডিয়া কোয়েরির
   ভেতরে, তাই মোবাইলে এক পিক্সেলও বদলাবে না।
   ========================================================= */
css_once('desktop_wide', <<<CSS
@media(min-width:1024px){
  :root{ --wrap:min(1380px, 94vw); --head-h:70px; }
  .container{padding:22px 26px 26px}

  .plist{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .pitem{padding:14px;gap:14px;border-radius:20px}
  .pitem-thumb{width:96px;height:96px;border-radius:18px}
  .pthumb{width:96px}
  .pitem-title{font-size:1rem}

  .bnr-slide{aspect-ratio:auto;height:300px}
  .bnr{margin:16px 0 6px}

  .hero{padding:24px 28px;border-radius:24px}
  .hero h1{font-size:1.5rem}
  .sec-title{margin:28px 0 15px}
  .sec-title h2{font-size:1.26rem}

  .pd{padding:30px 34px;border-radius:24px}
  .pd h1{font-size:1.7rem}
  .pd-body{font-size:1.04rem;max-width:1000px}
  .lnk-box{max-width:1000px}

  .srch-box{padding:22px 24px}
  .filters{grid-template-columns:repeat(4,1fr);gap:11px}

  .nt-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .rp-grid{grid-template-columns:1fr 360px;gap:20px}

  .ft-in{padding:10px 26px 6px;gap:34px}
  .ft-bot{padding:16px 26px}
}
@media(min-width:1600px){
  .plist{grid-template-columns:repeat(3,minmax(0,1fr))}
  .nt-list{grid-template-columns:repeat(3,minmax(0,1fr))}
  .bnr-slide{height:340px}
}
CSS);

$cats = categories();
$navKey0 = $P['nav'] ?? '';
$divisions = ['ঢাকা','চট্টগ্রাম','রাজশাহী','খুলনা','বরিশাল','সিলেট','রংপুর','ময়মনসিংহ'];
$topSearch = [];
try { $topSearch = all("SELECT term FROM searches ORDER BY hits DESC, last_at DESC LIMIT 6"); } catch (Throwable $e) {}
$siteName = setting('site_name', 'চাকরি সার্কুলার');
$domain   = preg_replace('~^https?://~i', '', rtrim(url(), '/'));
?>
<header class="hd">
  <div class="hd-in">
    <button class="ico-btn" id="sideBtn" aria-label="মেনু খুলুন"><i class="fa fa-bars"></i></button>
    <a class="brand" href="<?= e(url()) ?>" data-nav-key="home">
      <span class="lg"><img src="<?= e(site_logo()) ?>" alt="<?= e($siteName) ?>" width="42" height="42"></span>
      <span style="min-width:0">
        <b><?= e($siteName) ?></b>
        <small><?= e(setting('header_sub', $domain)) ?></small>
      </span>
    </a>
    <nav class="hd-nav" aria-label="প্রধান মেনু">
      <a href="<?= e(url()) ?>" data-key="home" class="<?= $navKey0 === 'home' ? 'active' : '' ?>"><i class="fa fa-house"></i>হোম</a>
      <a href="<?= e(url('categories')) ?>" data-key="categories" class="<?= $navKey0 === 'categories' ? 'active' : '' ?>"><i class="fa fa-table-cells-large"></i>ক্যাটাগরি</a>
      <a href="<?= e(url('trending')) ?>" data-key="trending" class="<?= $navKey0 === 'trending' ? 'active' : '' ?>"><i class="fa fa-fire"></i>ট্রেন্ডিং</a>
      <a href="<?= e(url('notices')) ?>" data-key="notices" class="<?= $navKey0 === 'notices' ? 'active' : '' ?>"><i class="fa fa-bullhorn"></i>নোটিশ</a>
      <a href="<?= e(url('saved')) ?>" data-key="saved" class="<?= $navKey0 === 'saved' ? 'active' : '' ?>"><i class="fa fa-bookmark"></i>সেভড জব</a>
    </nav>
    <span class="hd-sp"></span>
    <button class="ico-btn th-btn" type="button" data-theme-toggle aria-label="ডার্ক মোড"><i class="fa fa-moon"></i><i class="fa fa-sun"></i></button>
    <button class="ico-btn" id="hdSearchBtn" aria-label="খুঁজুন" aria-expanded="false"><i class="fa fa-magnifying-glass"></i></button>
    <a class="ico-btn bell" href="<?= e(url('notices')) ?>" aria-label="নোটিশ"><i class="fa fa-bell"></i><span class="nb" data-nbadge>০</span></a>
  </div>
</header>

<div class="hs" id="hdSearch" aria-hidden="true">
  <div class="hs-mask" data-hs-close></div>
  <div class="hs-panel" role="dialog" aria-label="খুঁজুন">
    <div class="hs-wrap">
      <form action="<?= e(url('search')) ?>" method="get" data-spa-form id="hsForm">
        <div class="hs-row">
          <div class="hs-field">
            <i class="fa fa-magnifying-glass mg"></i>
            <input type="search" name="q" id="hsInput" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখুন…" autocomplete="off" aria-label="সার্চ">
            <button type="button" class="hs-clear" id="hsClear" aria-label="বন্ধ করুন"><i class="fa fa-xmark"></i></button>
          </div>
          <button class="hs-go" type="submit" aria-label="খুঁজুন"><i class="fa fa-magnifying-glass"></i></button>
        </div>
      </form>

      <div class="hs-lbl"><i class="fa fa-filter"></i>দ্রুত ফিল্টার</div>
      <div class="hs-chips scroll">
        <?php foreach (array_slice($cats, 0, 8) as $c): ?>
          <a class="hs-chip" href="<?= e(cat_url($c['slug'])) ?>"><i class="fa <?= e($c['icon'] ?: 'fa-folder') ?>"></i><?= e($c['name']) ?></a>
        <?php endforeach; ?>
      </div>

      <div id="hsRecentBox" hidden>
        <div class="hs-lbl"><i class="fa fa-clock-rotate-left"></i>সাম্প্রতিক অনুসন্ধান</div>
        <div class="hs-chips" id="hsRecent"></div>
      </div>

      <?php if ($topSearch): ?>
      <div class="hs-lbl"><i class="fa fa-arrow-trend-up"></i>সবাই যা খুঁজছে</div>
      <div class="hs-list">
        <?php foreach ($topSearch as $i => $t): ?>
          <a class="hs-li" href="<?= e(url('search') . '?q=' . rawurlencode($t['term'])) ?>"><span class="n"><?= bn($i + 1) ?></span><?= e($t['term']) ?><i class="fa fa-angle-right ar"></i></a>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>

      <div class="hs-lbl"><i class="fa fa-location-dot"></i>বিভাগ অনুযায়ী</div>
      <div class="hs-chips">
        <?php foreach ($divisions as $d): ?>
          <a class="hs-chip" href="<?= e(url('search') . '?div=' . rawurlencode($d)) ?>"><i class="fa fa-map-pin"></i><?= e($d) ?></a>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</div>
