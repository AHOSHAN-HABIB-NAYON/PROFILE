<?php
/**
 * Document head + global design system (CSS variables, base components).
 * Inlined on purpose: the SPA loads the shell once per session, and inline
 * critical CSS avoids a render-blocking request. Page-specific CSS lives in
 * each page file.
 * Expects: $meta (array), optional $isAdmin (bool), $bare (bool)
 */
defined('APP') || exit;

$isAdmin = $isAdmin ?? false;
$bare = $bare ?? false;
$u = user();
$themeDefault = setting('theme.default_mode', 'light');
$darkAllowed = setting_bool('theme.dark_enabled');
$favicon = setting('favicon') ? media_url(setting('favicon')) : url('/assets/icons/icon-192.png');
$appCfg = [
    'base' => BASE_PATH,
    'lang' => lang(),
    'csrf' => csrf_token(),
    'uid' => $u ? (int)$u['id'] : 0,
    'staff' => $u ? is_staff($u) : false,
    'version' => (string)setting('content_version', '1'),
    'asset' => APP_VERSION,
    'theme' => ['default' => $themeDefault, 'dark' => $darkAllowed],
    'poll' => max(10, (int)setting('notify.poll_seconds', 30)),
    'sound' => $u ? (bool)val('SELECT notify_sound FROM user_security WHERE user_id = ?', [$u['id']]) : setting_bool('notify.sound_enabled'),
    'push' => setting_bool('notify.push_enabled') && setting('pwa.vapid_public') ? (string)setting('pwa.vapid_public') : '',
    'pwa' => setting_bool('pwa.enabled'),
    'install' => setting_bool('pwa.install_prompt') ? max(1, (int)setting('pwa.install_delay', 5)) : 0,
    'ai' => setting_bool('ai.enabled'),
    'aiHint' => setting_bool('ai.hint_enabled') ? setting_l('ai.greeting') : '',
    'chat' => setting_bool('live_chat.enabled'),
    'recaptcha' => recaptcha_enabled() ? (string)setting('security.recaptcha_site_key') : '',
    'passkeys' => setting_bool('security.passkeys_enabled'),
    'admin' => $isAdmin,
    'i18n' => array_filter(lang_strings(lang()) + lang_strings('en'), fn($k) => str_starts_with($k, 'js.'), ARRAY_FILTER_USE_KEY),
];
$radius = max(0, min(32, (int)setting('theme.radius', 22)));
$css = fn(string $k, string $d) => preg_match('~^#[0-9a-fA-F]{3,8}$~', (string)setting($k)) ? setting($k) : $d;
?><!doctype html>
<html lang="<?= e(lang()) ?>" data-theme="light" class="<?= setting_bool('theme.animations') ? '' : 'no-anim' ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="<?= e($css('pwa.theme_color', '#2b44d8')) ?>">
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<meta name="format-detection" content="telephone=no">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="<?= e(setting('pwa.short_name') ?: setting('site_name')) ?>">
<?= head_meta($meta ?? []) ?>
<link rel="icon" href="<?= e($favicon) ?>">
<link rel="apple-touch-icon" href="<?= e(setting('app_icon') ? media_url(setting('app_icon')) : url('/assets/icons/icon-192.png')) ?>">
<?php if (setting_bool('pwa.enabled')): ?><link rel="manifest" href="<?= e(url('/manifest.json')) ?>"><?php endif ?>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
<script nonce="<?= csp_nonce() ?>">
(function(){try{var d=document.documentElement,s=localStorage.getItem('theme')||<?= json_encode($themeDefault) ?>;
if(!<?= $darkAllowed ? 'true' : 'false' ?>)s='light';
if(s==='system')s=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.setAttribute('data-theme',s);}catch(e){}})();
</script>
<script id="app-config" type="application/json"><?= json_encode($appCfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<style>
:root{
  --brand:<?= e($css('theme.primary', '#2b44d8')) ?>;
  --primary:var(--brand);
  --primary-dark:<?= e($css('theme.primary_dark', '#1f33b5')) ?>;
  --secondary:<?= e($css('theme.secondary', '#5b6cff')) ?>;
  --accent:<?= e($css('theme.accent', '#f59e0b')) ?>;
  --bg:<?= e($css('theme.bg', '#f3f5fb')) ?>;
  --card:<?= e($css('theme.card', '#ffffff')) ?>;
  --text:<?= e($css('theme.text', '#0f172a')) ?>;
  --text-2:#334155;--muted:#64748b;--border:#e6e9f2;--line:#eef0f6;--soft:#f1f4fb;
  --success:#16a34a;--danger:#ef4444;--warning:#f59e0b;--info:#2b44d8;
  --primary-soft:color-mix(in srgb,var(--primary) 10%,#fff);
  --primary-soft-2:color-mix(in srgb,var(--primary) 16%,#fff);
  --navy:#161b54;
  --radius:<?= $radius ?>px;--radius-sm:<?= max(8, $radius - 6) ?>px;--radius-xs:<?= max(6, $radius - 10) ?>px;
  --shadow-sm:0 1px 2px rgba(15,23,42,.04);
  --shadow:0 1px 2px rgba(15,23,42,.03),0 10px 30px -14px rgba(30,41,110,.16);
  --shadow-lg:0 30px 70px -24px rgba(15,23,42,.38);
  --shadow-btn:0 10px 22px -10px color-mix(in srgb,var(--primary) 85%,transparent);
  --header-h:62px;--bottom-h:66px;--sidebar-w:268px;
  --safe-b:env(safe-area-inset-bottom,0px);
  --font:"Plus Jakarta Sans","Hind Siliguri","Noto Sans Bengali",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  --ease:cubic-bezier(.2,.8,.2,1);
  color-scheme:light;
}
html[data-theme="dark"]{
  --primary:color-mix(in srgb,var(--brand) 75%,#fff);
  --bg:#0a0f1f;--card:#111832;--text:#eef2ff;--text-2:#cbd5e1;--muted:#94a3b8;--border:#1f2948;--line:#1a2340;--soft:#151d38;
  --primary-soft:color-mix(in srgb,var(--primary) 16%,#111832);--primary-soft-2:color-mix(in srgb,var(--primary) 24%,#111832);
  --navy:#0d1238;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px -16px rgba(0,0,0,.7);
  --shadow-lg:0 30px 70px -24px rgba(0,0,0,.85);
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{font-size:clamp(15px,1rem,18px);-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;-webkit-tap-highlight-color:transparent}
body{margin:0;font-family:var(--font);font-size:.95rem;line-height:1.6;color:var(--text);min-height:100vh;min-height:100dvh;overflow-x:hidden;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;background:var(--bg);
  background-image:radial-gradient(900px 420px at 0% -8%,color-mix(in srgb,var(--primary) 9%,transparent),transparent 70%),radial-gradient(700px 380px at 100% 0%,color-mix(in srgb,var(--secondary) 8%,transparent),transparent 70%);
  background-attachment:fixed}
:lang(bn) body,body:lang(bn){line-height:1.72}
img,svg,video{max-width:100%;height:auto;display:block}
a{color:var(--primary);text-decoration:none}
h1,h2,h3,h4{line-height:1.25;margin:0 0 .5em;font-weight:800;letter-spacing:-.02em;color:var(--text)}
h1{font-size:clamp(1.5rem,1.15rem + 1.6vw,2.15rem)}h2{font-size:clamp(1.15rem,1rem + .7vw,1.45rem)}h3{font-size:1.05rem}
p{margin:0 0 1em}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:8px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.skip-link{position:fixed;left:12px;top:-60px;z-index:1000;background:var(--primary);color:#fff;padding:8px 14px;border-radius:10px}
.skip-link:focus{top:10px}
.muted{color:var(--muted)}.small{font-size:.84rem}.tiny{font-size:.75rem}.center{text-align:center}.nowrap{white-space:nowrap}
.mt-0{margin-top:0}.mt-1{margin-top:.5rem}.mt-2{margin-top:1rem}.mt-3{margin-top:1.5rem}.mb-0{margin-bottom:0}.mb-1{margin-bottom:.5rem}.mb-2{margin-bottom:1rem}
.row{display:flex;align-items:center;gap:.6rem}.row-between{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.wrap{flex-wrap:wrap}.grow{flex:1;min-width:0}
.stack>*+*{margin-top:.75rem}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* ---------- layout ---------- */
.app-main{padding:calc(var(--header-h) + 16px) 16px 28px;max-width:1120px;margin:0 auto;outline:none;min-height:70vh}
body.is-bare .app-main{padding:24px 16px;max-width:none}
@media (min-width:1024px){
  body:not(.is-bare) .app-main{margin-left:var(--sidebar-w);padding:calc(var(--header-h) + 26px) 34px 48px;max-width:calc(1120px + var(--sidebar-w))}
}
.page{animation:pageIn .28s var(--ease) both}
@keyframes pageIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.page.leaving{opacity:.55;transition:opacity .12s}
.section{margin:0 0 26px}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}
.section-head h2{margin:0;font-size:1.15rem}
.section-head a{font-size:.86rem;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(var(--min,150px),1fr))}
.grid-2{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:720px){.grid-2{grid-template-columns:1fr 1fr}}
.crumbs{display:flex;gap:6px;align-items:center;font-size:.8rem;color:var(--muted);margin-bottom:12px;flex-wrap:wrap;font-weight:600}.crumbs a{color:var(--muted)}.crumbs a:hover{color:var(--primary)}
.page-head{margin:2px 0 16px}.page-head h1{margin-bottom:4px}.page-head p{color:var(--muted);margin:0}

/* ---------- app shell: header ---------- */
.app-header{position:fixed;inset:0 0 auto 0;height:calc(var(--header-h) + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);z-index:100;
  background:color-mix(in srgb,var(--card) 90%,transparent);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);border-bottom:1px solid var(--line)}
.app-header .bar{height:var(--header-h);display:flex;align-items:center;gap:8px;padding:0 12px}
.sq-btn{width:40px;height:40px;flex:0 0 40px;border-radius:13px;border:1px solid var(--border);background:var(--card);color:var(--text);display:inline-grid;place-items:center;cursor:pointer;position:relative;font-size:1.05rem;transition:background .15s,transform .12s,border-color .15s;box-shadow:var(--shadow-sm)}
.sq-btn:hover{background:var(--soft);border-color:color-mix(in srgb,var(--primary) 25%,var(--border))}.sq-btn:active{transform:scale(.93)}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:800;font-size:1.18rem;letter-spacing:-.02em;min-width:0;margin-right:auto}
.brand-logo{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,var(--primary),var(--primary-dark));color:#fff;font-size:.95rem;flex:0 0 36px;overflow:hidden;box-shadow:0 6px 14px -8px var(--primary)}
.brand-logo img{width:100%;height:100%;object-fit:contain}
.brand-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw}
.hdr-actions{display:flex;align-items:center;gap:7px}
.notif-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--danger);color:#fff;font-size:.64rem;font-weight:800;display:grid;place-items:center;border:2px solid var(--card)}
.notif-badge.bump{animation:popIn .45s var(--ease)}
.btn-signup{height:40px;padding:0 16px;border-radius:13px;font-size:.9rem}
.hdr-search{display:none}
.hdr-user{display:none}
@media (max-width:380px){.hdr-actions{gap:5px}.sq-btn{width:36px;height:36px;flex-basis:36px;border-radius:12px}.brand{font-size:1.05rem}}
@media (min-width:1024px){
  .app-header .bar{padding:0 20px 0 16px}
  .brand{width:calc(var(--sidebar-w) - 16px);margin-right:0}
  .hdr-search{display:flex;align-items:center;gap:10px;flex:1;max-width:460px;height:42px;padding:0 14px;border-radius:13px;background:var(--soft);border:1px solid var(--border);color:var(--muted);cursor:pointer;margin-right:auto;font-size:.88rem}
  .hdr-search kbd{margin-left:auto;font-size:.7rem;border:1px solid var(--border);border-radius:6px;padding:1px 6px;background:var(--card)}
  .hdr-actions .search-mobile,.menu-btn{display:none}
  .hdr-user{display:inline-flex;margin-left:4px}
}

/* ---------- app shell: drawer / sidebar ---------- */
.app-sidebar{position:fixed;top:0;bottom:0;left:0;width:min(86vw,var(--sidebar-w));z-index:300;background:var(--card);border-right:1px solid var(--line);
  transform:translateX(-102%);transition:transform .3s var(--ease);display:flex;flex-direction:column;overflow:hidden}
.app-sidebar.open{transform:none;box-shadow:var(--shadow-lg)}
.drawer-scrim{position:fixed;inset:0;z-index:290;background:rgba(10,15,40,.4);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .25s}
.drawer-scrim.open{opacity:1;pointer-events:auto}
.sb-scroll{overflow-y:auto;padding:12px 12px 26px;flex:1;overscroll-behavior:contain}
.sb-head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 4px}
.sb-user{display:flex;align-items:center;gap:12px;padding:12px;border-radius:18px;background:var(--soft);border:1px solid var(--line);color:inherit;margin-bottom:12px}
.sb-label{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:18px 12px 6px}
.sb-link{display:flex;align-items:center;gap:12px;height:46px;padding:0 12px;border-radius:14px;color:var(--text-2);font-weight:600;font-size:.93rem;transition:background .15s,color .15s}
.sb-link i{width:22px;text-align:center;color:var(--muted);font-size:1rem;transition:color .15s}
.sb-link:hover{background:var(--soft)}
.sb-link.active{background:var(--primary);color:#fff;box-shadow:var(--shadow-btn)}.sb-link.active i{color:#fff}
.sb-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;font-size:.9rem;font-weight:600;color:var(--text-2)}
@media (min-width:1024px){
  .app-sidebar{top:var(--header-h);transform:none;width:var(--sidebar-w);z-index:90;background:color-mix(in srgb,var(--card) 70%,transparent);border-right:1px solid var(--line)}
  .sb-head,.drawer-scrim{display:none}
}

/* ---------- app shell: bottom navigation ---------- */
.bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:100;height:calc(var(--bottom-h) + var(--safe-b));padding:0 6px var(--safe-b);display:flex;justify-content:space-around;align-items:stretch;
  background:color-mix(in srgb,var(--card) 94%,transparent);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);border-top:1px solid var(--line);box-shadow:0 -6px 24px -18px rgba(15,23,42,.25)}
.bn-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--text-2);font-size:.74rem;font-weight:700;position:relative;border:0;background:none;cursor:pointer;padding-top:4px}
.bn-item i{font-size:1.28rem;transition:transform .2s var(--ease),color .15s}
.bn-item::before{content:"";position:absolute;top:0;left:50%;width:28px;height:3px;border-radius:0 0 4px 4px;background:var(--primary);transform:translateX(-50%) scaleX(0);transition:transform .25s var(--ease)}
.bn-item.active{color:var(--primary)}.bn-item.active::before{transform:translateX(-50%) scaleX(1)}
.bn-item:active i{transform:scale(.88)}
.bn-item span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bn-item .count{position:absolute;top:6px;right:calc(50% - 22px);background:var(--danger);color:#fff;font-size:.6rem;min-width:16px;height:16px;border-radius:8px;display:grid;place-items:center;padding:0 4px}
@media (min-width:1024px){.bottom-nav{display:none}}

/* ---------- cards ---------- */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
.card-pad-lg{padding:20px}
@media (min-width:640px){.card-pad-lg{padding:24px}}
.card-link{display:block;color:inherit;transition:transform .18s var(--ease),box-shadow .18s,border-color .18s}
.card-link:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--primary) 25%,var(--line));box-shadow:0 18px 40px -22px color-mix(in srgb,var(--primary) 50%,transparent)}
.card-link:active{transform:scale(.985)}
.icon-box{width:44px;height:44px;flex:0 0 44px;border-radius:14px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);font-size:1.1rem}
.icon-box img{width:26px;height:26px;object-fit:contain}
.icon-box.sm{width:36px;height:36px;flex-basis:36px;border-radius:11px;font-size:.95rem}
.icon-box.lg{width:58px;height:58px;flex-basis:58px;border-radius:18px;font-size:1.45rem}
.icon-box.solid{background:linear-gradient(145deg,var(--primary),var(--primary-dark));color:#fff}
.icon-box.success{background:color-mix(in srgb,var(--success) 12%,var(--card));color:var(--success)}
.icon-box.danger{background:color-mix(in srgb,var(--danger) 11%,var(--card));color:var(--danger)}
.icon-box.warning{background:color-mix(in srgb,var(--warning) 15%,var(--card));color:#d97706}
.icon-box.accent{background:color-mix(in srgb,var(--accent) 15%,var(--card));color:#d97706}
.icon-box.secondary{background:color-mix(in srgb,var(--secondary) 13%,var(--card));color:var(--secondary)}
.list{display:flex;flex-direction:column;gap:10px}
.list-row{display:flex;align-items:center;gap:12px;padding:13px 14px;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);transition:transform .15s var(--ease),border-color .15s}
a.list-row:hover,button.list-row:hover{border-color:color-mix(in srgb,var(--primary) 25%,var(--line));transform:translateY(-1px)}
.list-row .chev{color:var(--muted);font-size:.8rem}
.list.flat{gap:0;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
.list.flat .list-row{border:0;border-bottom:1px solid var(--line);border-radius:0;box-shadow:none}.list.flat .list-row:last-child{border-bottom:0}
.kv{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:.9rem}.kv dt{color:var(--muted);font-weight:600}.kv dd{margin:0;text-align:right;word-break:break-word;font-weight:600}
.stat-tile{display:flex;flex-direction:column;gap:6px;padding:16px;position:relative}
.stat-tile .lbl{font-size:.72rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--text-2)}
.stat-tile .val{font-size:1.45rem;font-weight:800;letter-spacing:-.02em;line-height:1.15}
.stat-tile .ic{position:absolute;top:14px;right:14px;color:var(--primary);font-size:1.05rem}
.hero-navy{position:relative;overflow:hidden;border-radius:calc(var(--radius) + 6px);padding:24px 22px;color:#fff;
  background:radial-gradient(120% 140% at 100% 100%,color-mix(in srgb,var(--primary) 85%,#000) 0%,transparent 55%),linear-gradient(140deg,var(--navy) 0%,#202a8c 60%,var(--primary) 120%);box-shadow:0 24px 50px -28px #1b2275}
.hero-navy .wm{position:absolute;right:-18px;bottom:-26px;font-size:9rem;opacity:.09;transform:rotate(-8deg);pointer-events:none}
.hero-navy .kicker{display:inline-flex;align-items:center;gap:8px;font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
.hero-navy h1,.hero-navy h2{color:#fff}
.hero-navy p{opacity:.85}
.btn-glass{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3);backdrop-filter:blur(6px)}
.btn-glass:hover{background:rgba(255,255,255,.2)}
.btn-white{--b:#fff;color:var(--navy)!important}.btn-white:hover{background:#eef1ff}

/* ---------- buttons ---------- */
.btn{--b:var(--primary);display:inline-flex;align-items:center;justify-content:center;gap:.55em;min-height:46px;padding:0 20px;border-radius:15px;border:1px solid transparent;
  background:var(--b);color:#fff;font-weight:700;font-size:.93rem;cursor:pointer;white-space:nowrap;transition:transform .12s var(--ease),background .15s,box-shadow .15s,opacity .15s;user-select:none;text-decoration:none}
.btn:not(.btn-soft):not(.btn-ghost):not(.btn-glass):not(.btn-white):not(.btn-google){box-shadow:var(--shadow-btn)}
.btn:hover{background:color-mix(in srgb,var(--b) 88%,#000)}
.btn:active{transform:scale(.97)}
.btn[disabled],.btn.loading{opacity:.65;pointer-events:none}
.btn.loading::after{content:"";width:15px;height:15px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
.btn-soft{background:var(--primary-soft);color:var(--primary)}.btn-soft:hover{background:var(--primary-soft-2)}
.btn-ghost{background:var(--card);color:var(--text);border-color:var(--border)}.btn-ghost:hover{background:var(--soft)}
.btn-danger{--b:var(--danger)}.btn-success{--b:var(--success)}
.btn-sm{min-height:36px;padding:0 13px;font-size:.84rem;border-radius:12px}
.btn-lg{min-height:54px;padding:0 24px;font-size:1rem;border-radius:17px}
.btn-block{display:flex;width:100%}
.icon-btn{width:40px;height:40px;border-radius:12px;display:inline-grid;place-items:center;border:0;background:transparent;color:var(--text);cursor:pointer;position:relative;transition:background .15s,transform .12s;font-size:1.05rem}
.icon-btn:hover{background:var(--soft)}.icon-btn:active{transform:scale(.92)}
.pill-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:999px;border:0;background:var(--soft);color:var(--text);font-weight:700;font-size:.92rem;cursor:pointer;transition:transform .12s,background .15s}
.pill-btn:active{transform:scale(.95)}
.pill-btn.like{background:color-mix(in srgb,var(--danger) 9%,var(--card));color:var(--danger)}
.pill-btn.like.active i{font-weight:900}
.pill-btn.like.active{background:color-mix(in srgb,var(--danger) 16%,var(--card))}
@keyframes spin{to{transform:rotate(360deg)}}

/* ---------- chips / badges ---------- */
.chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px;-webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border-radius:999px;border:1px solid var(--border);background:var(--card);color:var(--text-2);font-size:.86rem;font-weight:700;white-space:nowrap;cursor:pointer;transition:all .15s}
.chip.active,.chip[aria-pressed="true"]{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:var(--shadow-btn)}
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:.73rem;font-weight:700;background:var(--primary-soft);color:var(--primary);line-height:1.5;white-space:nowrap}
.badge.solid{background:var(--primary);color:#fff}
.badge.success{background:color-mix(in srgb,var(--success) 12%,var(--card));color:var(--success)}
.badge.danger{background:color-mix(in srgb,var(--danger) 11%,var(--card));color:var(--danger)}
.badge.warning{background:color-mix(in srgb,var(--warning) 16%,var(--card));color:#b45309}
.badge.muted{background:var(--soft);color:var(--muted)}
.badge.vip{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#3b2600;position:relative;overflow:hidden}
.badge.vip::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.65) 50%,transparent 70%);transform:translateX(-100%);animation:shine 2.8s ease-in-out infinite}
@keyframes shine{60%,100%{transform:translateX(100%)}}
.dot{width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block}
.status{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:700;padding:4px 11px;border-radius:999px;white-space:nowrap}
.status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.status-pending,.status-pending_payment,.status-payment_submitted,.status-under_review{background:color-mix(in srgb,var(--warning) 16%,var(--card));color:#b45309}
.status-pending::before,.status-under_review::before,.status-payment_submitted::before{animation:pulse 1.6s infinite}
.status-approved,.status-completed{background:color-mix(in srgb,var(--success) 12%,var(--card));color:var(--success)}
.status-rejected,.status-cancelled{background:color-mix(in srgb,var(--danger) 11%,var(--card));color:var(--danger)}
@keyframes pulse{50%{opacity:.35}}

/* ---------- live coin chips ---------- */
.coin-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 11px 2px 4px;margin:2px 1px;border-radius:999px;border:1px solid var(--border);background:var(--soft);font-weight:800;font-size:.86em;line-height:1.9;white-space:nowrap;vertical-align:middle}
.coin-chip.noicon{padding-left:11px}
.coin-chip .coin-ic{width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;background:var(--primary-soft);color:var(--primary);font-size:.65rem;object-fit:cover}
.coin-chip .coin-p{font-weight:800}
.coin-chip .coin-c{font-weight:800;font-size:.92em}
.coin-chip .coin-c.up{color:var(--success)}.coin-chip .coin-c.down{color:var(--danger)}
.coin-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 10px}
.coin-row .coin-chip{font-size:.92rem;padding-right:13px}

/* ---------- forms ---------- */
.form-group{margin-bottom:15px}
.label{display:block;font-size:.88rem;font-weight:800;margin-bottom:7px;color:var(--text)}
.input,.select,.textarea{width:100%;min-height:50px;padding:11px 15px;border-radius:16px;border:1.5px solid var(--border);background:var(--card);color:var(--text);transition:border-color .15s,box-shadow .15s;font-size:.96rem}
.input::placeholder,.textarea::placeholder{color:color-mix(in srgb,var(--muted) 80%,transparent)}
.textarea{min-height:120px;resize:vertical;line-height:1.6}
.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-soft)}
.input.invalid,.textarea.invalid,.select.invalid{border-color:var(--danger)}
.field-error{color:var(--danger);font-size:.78rem;margin-top:5px;font-weight:600}
.input-icon{position:relative}.input-icon>i{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.input-icon .input{padding-left:46px}
.input-icon .toggle-pw{position:absolute;right:6px;top:50%;transform:translateY(-50%)}
.hint{font-size:.78rem;color:var(--muted);margin-top:5px}
.check{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.92rem;font-weight:600;color:var(--text-2)}
.check input[type=checkbox]{width:20px;height:20px;accent-color:var(--primary);flex:0 0 20px}
.switch{position:relative;width:48px;height:28px;flex:0 0 48px}
.switch input{opacity:0;width:0;height:0;position:absolute}
.switch span{position:absolute;inset:0;border-radius:99px;background:var(--border);transition:background .2s;cursor:pointer}
.switch span::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s var(--ease)}
.switch input:checked+span{background:var(--primary)}.switch input:checked+span::after{transform:translateX(20px)}
.switch input:focus-visible+span{outline:2px solid var(--primary);outline-offset:2px}
.hp-field{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}
.file-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;border:1.5px dashed var(--border);border-radius:18px;background:var(--soft);cursor:pointer;text-align:center;color:var(--muted);font-size:.86rem;font-weight:600;transition:border-color .15s}
.file-drop:hover{border-color:var(--primary)}.file-drop input{display:none}.file-drop img{max-height:150px;border-radius:12px;margin-top:6px}
.upload-progress{height:5px;border-radius:5px;background:var(--soft);overflow:hidden;margin-top:8px;display:none}.upload-progress>i{display:block;height:100%;width:0;background:var(--primary);transition:width .2s}
.seg{display:inline-flex;background:var(--soft);border-radius:12px;padding:3px;gap:2px;border:1px solid var(--line)}
.seg button,.seg a{border:0;background:transparent;padding:6px 11px;border-radius:9px;font-size:.78rem;font-weight:700;color:var(--muted);cursor:pointer}
.seg .active{background:var(--card);color:var(--primary);box-shadow:var(--shadow-sm)}

/* ---------- tabs (segmented pills inside a card) ---------- */
.tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:5px;background:var(--card);border:1px solid var(--line);border-radius:20px;margin-bottom:16px;box-shadow:var(--shadow)}
.tabs::-webkit-scrollbar{display:none}
.tab{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 15px;border-radius:15px;color:var(--text-2);font-weight:700;font-size:.9rem;white-space:nowrap;border:0;background:transparent;cursor:pointer;transition:all .15s}
.tab:hover{color:var(--primary)}
.tab.active{background:var(--primary);color:#fff;box-shadow:var(--shadow-btn)}

/* ---------- alerts / empty / skeleton ---------- */
.alert{display:flex;gap:10px;align-items:flex-start;padding:13px 15px;border-radius:16px;font-size:.9rem;background:var(--primary-soft);color:var(--text);border:1px solid color-mix(in srgb,var(--primary) 18%,transparent);font-weight:500}
.alert>i{color:var(--primary);margin-top:3px}
.alert.success{background:color-mix(in srgb,var(--success) 9%,var(--card));border-color:color-mix(in srgb,var(--success) 25%,transparent)}.alert.success>i{color:var(--success)}
.alert.danger{background:color-mix(in srgb,var(--danger) 8%,var(--card));border-color:color-mix(in srgb,var(--danger) 25%,transparent)}.alert.danger>i{color:var(--danger)}
.alert.warning{background:color-mix(in srgb,var(--warning) 11%,var(--card));border-color:color-mix(in srgb,var(--warning) 30%,transparent)}.alert.warning>i{color:#d97706}
.empty{text-align:center;padding:38px 16px;color:var(--muted);font-weight:600}
.empty .icon-box{margin:0 auto 12px;width:66px;height:66px;border-radius:22px;font-size:1.5rem}
.skeleton{background:linear-gradient(90deg,var(--soft) 25%,color-mix(in srgb,var(--soft) 50%,var(--card)) 50%,var(--soft) 75%);background-size:200% 100%;animation:sk 1.2s infinite;border-radius:12px}
@keyframes sk{to{background-position:-200% 0}}

/* ---------- auth screens ---------- */
.auth-wrap{max-width:440px;margin:6px auto 24px}
.auth-card{padding:28px 22px}
@media (min-width:640px){.auth-card{padding:34px 32px}}
.auth-brand{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:18px;font-weight:800;font-size:1.35rem;color:var(--text);letter-spacing:-.02em}
.auth-brand .brand-logo{width:46px;height:46px;flex-basis:46px;border-radius:14px;font-size:1.15rem}
.auth-head{text-align:center;margin-bottom:22px}
.auth-head .icon-box{margin:0 auto 12px}
.auth-head h1{font-size:1.65rem;margin-bottom:6px}
.auth-head p{color:var(--muted);font-size:.95rem;margin:0}
.or{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:.86rem;font-weight:600;margin:20px 0}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--border)}
.btn-google{background:var(--card);color:var(--text);border:1.5px solid var(--border);min-height:52px;border-radius:17px}.btn-google:hover{background:var(--soft)}
.btn-google .g-ic{width:20px;height:20px}
.code-input{text-align:center;font-size:1.5rem;letter-spacing:.5em;font-weight:800;padding-left:.5em}
.auth-foot{text-align:center;font-size:.93rem;margin-top:18px;color:var(--muted);font-weight:600}
.auth-foot a{font-weight:800}
.auth-safe{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;color:var(--muted);font-size:.86rem;font-weight:600}
.auth-safe i{color:var(--success)}

/* ---------- notification list ---------- */
.notif-item{align-items:flex-start}
.notif-item.unread{border-color:color-mix(in srgb,var(--primary) 30%,var(--line));background:color-mix(in srgb,var(--primary) 3%,var(--card))}
.notif-body{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.notif-body strong{font-size:.92rem;font-weight:700}
.notif-item:not(.unread) .notif-body strong{font-weight:600;color:var(--text-2)}
.notif-body .nb{font-size:.85rem;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.notif-body .nt{font-size:.74rem;color:var(--muted);font-weight:600}
.unread-dot{width:9px;height:9px;border-radius:50%;background:var(--primary);margin-top:8px;flex:0 0 9px;box-shadow:0 0 0 4px var(--primary-soft)}

/* ---------- avatar ---------- */
.avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(145deg,var(--primary),var(--navy));flex:0 0 auto;overflow:hidden;font-size:1rem;box-shadow:0 0 0 3px var(--card),0 0 0 4px var(--line)}
.avatar img{width:100%;height:100%;object-fit:cover}
.avatar.sm{width:32px;height:32px;font-size:.8rem}.avatar.lg{width:70px;height:70px;font-size:1.6rem}
.avatar.logo{background:linear-gradient(145deg,var(--primary),var(--primary-dark))}

/* ---------- top progress ---------- */
#top-progress{position:fixed;left:0;top:0;height:3px;width:100%;z-index:999;pointer-events:none;transform-origin:left;transform:scaleX(0);opacity:0;
  background:linear-gradient(90deg,var(--primary),var(--accent));box-shadow:0 0 10px var(--primary)}
#top-progress.run{opacity:1;transition:transform 8s cubic-bezier(.1,.7,.1,1)}
#top-progress.done{opacity:0;transform:scaleX(1)!important;transition:transform .2s ease,opacity .35s .15s}

/* ---------- toasts ---------- */
.toast-stack{position:fixed;left:50%;top:calc(var(--header-h) + 12px);transform:translateX(-50%);z-index:990;display:flex;flex-direction:column;gap:8px;width:min(92vw,420px);pointer-events:none}
.toast{display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:18px;background:var(--card);color:var(--text);border:1px solid var(--line);box-shadow:var(--shadow-lg);
  font-size:.92rem;font-weight:600;pointer-events:auto;animation:toastIn .3s var(--ease) both}
.toast.out{animation:toastOut .25s ease forwards}
.toast .t-icon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:0 0 30px;color:#fff;background:var(--primary);font-size:.82rem}
.toast.success .t-icon{background:var(--success)}.toast.error .t-icon{background:var(--danger)}.toast.warning .t-icon{background:var(--warning)}
.toast .t-icon i{animation:popIn .4s var(--ease) both .08s}
@keyframes toastIn{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes toastOut{to{opacity:0;transform:translateY(-10px) scale(.97)}}
@keyframes popIn{from{transform:scale(0)}70%{transform:scale(1.2)}to{transform:scale(1)}}
.shake{animation:shake .4s}@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}

/* ---------- modal ---------- */
.modal-backdrop{position:fixed;inset:0;z-index:950;background:rgba(10,15,40,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .22s}
.modal-backdrop.open{opacity:1}
.modal{width:100%;max-width:480px;max-height:88vh;overflow:auto;background:var(--card);border-radius:26px 26px 0 0;padding:8px 18px calc(18px + var(--safe-b));box-shadow:var(--shadow-lg);transform:translateY(40px);transition:transform .28s var(--ease)}
.modal-backdrop.open .modal{transform:none}
.modal .grabber{width:42px;height:5px;border-radius:5px;background:var(--border);margin:6px auto 12px}
.modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.modal-head h3{margin:0;font-size:1.1rem}
.modal-actions{display:flex;gap:10px;margin-top:16px}.modal-actions .btn{flex:1}
@media (min-width:640px){.modal-backdrop{align-items:center}.modal{border-radius:26px;padding:20px 24px 24px}.modal .grabber{display:none}.modal{transform:translateY(16px) scale(.98)}}

/* ---------- rich text ---------- */
.rt{font-size:1.02rem;line-height:1.85;overflow-wrap:anywhere;color:var(--text-2)}
.rt p{margin:0 0 1em}
.rt h2{font-size:1.25rem;margin:1.4em 0 .5em}.rt h3{font-size:1.1rem;margin:1.2em 0 .4em}
.rt strong,.rt b{color:var(--text)}
.rt img{border-radius:16px;margin:1em auto;height:auto}.rt ul,.rt ol{padding-left:1.3em}.rt li{margin:.25em 0}
.rt blockquote{margin:1em 0;padding:.7em 1em;border-left:4px solid var(--primary);background:var(--soft);border-radius:0 14px 14px 0}
.rt a:not(.rt-btn){text-decoration:underline;text-underline-offset:3px}
.rt mark,.rt .rt-highlight{background:color-mix(in srgb,var(--warning) 35%,transparent);color:inherit;padding:0 .2em;border-radius:4px}
.rt pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:14px;overflow:auto;font-size:.85rem}
.rt iframe{width:100%;aspect-ratio:16/9;height:auto;border:0;border-radius:16px}
.rt table{width:100%;border-collapse:collapse;font-size:.9rem;display:block;overflow-x:auto}.rt td,.rt th{border:1px solid var(--border);padding:8px}
.rt-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 10px;border-radius:999px;font-size:.78em;font-weight:800;background:var(--primary-soft);color:var(--primary);vertical-align:middle}
.rt-badge-green{background:color-mix(in srgb,var(--success) 13%,var(--card));color:var(--success)}
.rt-badge-red{background:color-mix(in srgb,var(--danger) 12%,var(--card));color:var(--danger)}
.rt-badge-orange{background:color-mix(in srgb,var(--warning) 18%,var(--card));color:#b45309}
.rt-badge-purple{background:color-mix(in srgb,var(--secondary) 15%,var(--card));color:var(--secondary)}
.rt-badge-gold{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#3b2600}
.rt-badge-dark{background:#0f172a;color:#fff}
.rt-alert{display:block;padding:13px 15px;border-radius:16px;margin:1em 0;background:var(--primary-soft);border:1px solid color-mix(in srgb,var(--primary) 20%,transparent)}
.rt-alert-success{background:color-mix(in srgb,var(--success) 9%,var(--card));border-color:color-mix(in srgb,var(--success) 26%,transparent)}
.rt-alert-warning{background:color-mix(in srgb,var(--warning) 12%,var(--card));border-color:color-mix(in srgb,var(--warning) 30%,transparent)}
.rt-alert-danger{background:color-mix(in srgb,var(--danger) 8%,var(--card));border-color:color-mix(in srgb,var(--danger) 26%,transparent)}
.rt-btn{display:inline-flex;align-items:center;gap:6px;padding:11px 20px;border-radius:14px;background:var(--primary);color:#fff!important;text-decoration:none!important;font-weight:700;box-shadow:var(--shadow-btn)}
.rt-btn-outline{background:transparent;color:var(--primary)!important;border:1.5px solid var(--primary);box-shadow:none}
.rt-up{color:var(--success)}.rt-down{color:var(--danger)}
.rt-orange{color:#f97316}.rt-blue{color:var(--primary)}.rt-gold{color:#f59e0b}.rt-red{color:var(--danger)}.rt-green{color:var(--success)}
.rt-anim-bounce{display:inline-block;animation:rtBounce 1.6s ease-in-out infinite}
.rt-anim-pulse{display:inline-block;animation:rtPulse 1.6s ease-in-out infinite}
.rt-anim-spin{display:inline-block;animation:spin 2.4s linear infinite}
.rt-anim-shake{display:inline-block;animation:rtShake 2.2s ease-in-out infinite}
.rt-anim-glow{display:inline-block;animation:rtGlow 2s ease-in-out infinite}
@keyframes rtBounce{50%{transform:translateY(-4px)}}@keyframes rtPulse{50%{transform:scale(1.15)}}
@keyframes rtShake{0%,80%,100%{transform:rotate(0)}85%{transform:rotate(-12deg)}90%{transform:rotate(12deg)}95%{transform:rotate(-6deg)}}
@keyframes rtGlow{50%{filter:drop-shadow(0 0 6px currentColor)}}

.no-anim *,.no-anim *::before,.no-anim *::after{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
</style>
</head>
<body class="<?= $isAdmin ? 'is-admin' : '' ?><?= $bare ? ' is-bare' : '' ?>">
<a class="skip-link" href="#app-main"><?= e(t('a11y.skip')) ?></a>
<div id="top-progress" aria-hidden="true"></div>
