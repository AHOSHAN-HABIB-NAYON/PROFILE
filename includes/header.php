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
$radius = max(0, min(32, (int)setting('theme.radius', 18)));
$css = fn(string $k, string $d) => preg_match('~^#[0-9a-fA-F]{3,8}$~', (string)setting($k)) ? setting($k) : $d;
?><!doctype html>
<html lang="<?= e(lang()) ?>" data-theme="light" class="<?= setting_bool('theme.animations') ? '' : 'no-anim' ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="<?= e($css('pwa.theme_color', '#3045d8')) ?>">
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
<script nonce="<?= csp_nonce() ?>">
(function(){try{var d=document.documentElement,s=localStorage.getItem('theme')||<?= json_encode($themeDefault) ?>;
if(!<?= $darkAllowed ? 'true' : 'false' ?>)s='light';
if(s==='system')s=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.setAttribute('data-theme',s);}catch(e){}})();
</script>
<script id="app-config" type="application/json"><?= json_encode($appCfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<style>
:root{
  --brand:<?= e($css('theme.primary', '#3045d8')) ?>;
  --primary:var(--brand);
  --primary-dark:<?= e($css('theme.primary_dark', '#2335b5')) ?>;
  --secondary:<?= e($css('theme.secondary', '#7b61ff')) ?>;
  --accent:<?= e($css('theme.accent', '#00a7c4')) ?>;
  --bg:<?= e($css('theme.bg', '#f5f7fc')) ?>;
  --card:<?= e($css('theme.card', '#ffffff')) ?>;
  --text:<?= e($css('theme.text', '#13203a')) ?>;
  --muted:#69758b;--border:#e5e9f2;--soft:#eef1fa;
  --success:#20b67a;--danger:#ef5350;--warning:#f5a623;--info:#2f8cff;
  --primary-soft:color-mix(in srgb,var(--primary) 11%,transparent);
  --radius:<?= $radius ?>px;--radius-sm:<?= max(6, $radius - 6) ?>px;--radius-xs:<?= max(4, $radius - 10) ?>px;
  --shadow-sm:0 1px 2px rgba(19,32,58,.05);
  --shadow:0 1px 2px rgba(19,32,58,.04),0 8px 24px -12px rgba(19,32,58,.14);
  --shadow-lg:0 24px 60px -20px rgba(19,32,58,.35);
  --header-h:60px;--bottom-h:66px;--sidebar-w:264px;
  --safe-b:env(safe-area-inset-bottom,0px);
  --font:"Noto Sans","Noto Sans Bengali",system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --ease:cubic-bezier(.2,.8,.2,1);
  color-scheme:light;
}
html[data-theme="dark"]{
  --primary:color-mix(in srgb,var(--brand) 78%,#fff);
  --bg:#0b1120;--card:#121a2d;--text:#e7ecf7;--muted:#93a0b8;--border:#212b43;--soft:#18213a;
  --primary-soft:color-mix(in srgb,var(--primary) 16%,transparent);
  --shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);
  --shadow-lg:0 24px 60px -20px rgba(0,0,0,.8);
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{font-size:clamp(15px,1rem,18px);-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;-webkit-tap-highlight-color:transparent}
body{margin:0;font-family:var(--font);font-size:.95rem;line-height:1.6;color:var(--text);background:var(--bg);
  min-height:100vh;min-height:100dvh;overflow-x:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
:lang(bn) body,body:lang(bn){line-height:1.7}
img,svg,video{max-width:100%;height:auto;display:block}
a{color:var(--primary);text-decoration:none}
h1,h2,h3,h4{line-height:1.3;margin:0 0 .5em;font-weight:700;letter-spacing:-.01em}
h1{font-size:clamp(1.45rem,1.1rem + 1.6vw,2.1rem)}h2{font-size:clamp(1.15rem,1rem + .7vw,1.45rem)}h3{font-size:1.05rem}
p{margin:0 0 1em}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:6px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.skip-link{position:fixed;left:12px;top:-60px;z-index:1000;background:var(--primary);color:#fff;padding:8px 14px;border-radius:10px}
.skip-link:focus{top:10px}
.muted{color:var(--muted)}.small{font-size:.82rem}.tiny{font-size:.74rem}.center{text-align:center}.nowrap{white-space:nowrap}
.mt-0{margin-top:0}.mt-1{margin-top:.5rem}.mt-2{margin-top:1rem}.mt-3{margin-top:1.5rem}.mb-0{margin-bottom:0}.mb-1{margin-bottom:.5rem}.mb-2{margin-bottom:1rem}
.row{display:flex;align-items:center;gap:.6rem}.row-between{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.wrap{flex-wrap:wrap}.grow{flex:1;min-width:0}
.stack>*+*{margin-top:.75rem}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* ---------- layout ---------- */
.app-main{padding:calc(var(--header-h) + 14px) 16px 28px;max-width:1120px;margin:0 auto;outline:none;min-height:70vh}
body.is-bare .app-main{padding:24px 16px;max-width:none}
@media (min-width:1024px){
  body:not(.is-bare) .app-main{margin-left:var(--sidebar-w);padding:calc(var(--header-h) + 24px) 32px 48px;max-width:calc(1120px + var(--sidebar-w))}
}
.page{animation:pageIn .26s var(--ease) both}
@keyframes pageIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.page.leaving{opacity:.55;transition:opacity .12s}
.section{margin:0 0 28px}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}
.section-head h2{margin:0;font-size:1.08rem}
.section-head a{font-size:.85rem;font-weight:600}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(var(--min,150px),1fr))}
.grid-2{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:720px){.grid-2{grid-template-columns:1fr 1fr}}

.crumbs{display:flex;gap:6px;align-items:center;font-size:.8rem;color:var(--muted);margin-bottom:12px;flex-wrap:wrap}.crumbs a{color:var(--muted)}.crumbs a:hover{color:var(--primary)}
.page-head{margin:4px 0 16px}.page-head p{color:var(--muted);margin:0}

/* ---------- app shell (header / sidebar / bottom nav) ---------- */
/* navbar.php */
.app-header{position:fixed;inset:0 0 auto 0;height:calc(var(--header-h) + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);z-index:100;
  background:color-mix(in srgb,var(--card) 82%,transparent);backdrop-filter:saturate(180%) blur(16px);-webkit-backdrop-filter:saturate(180%) blur(16px);border-bottom:1px solid var(--border)}
.app-header .bar{height:var(--header-h);display:flex;align-items:center;gap:6px;padding:0 10px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:700;font-size:1.02rem;min-width:0;margin-right:auto}
.brand-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;font-size:.95rem;flex:0 0 34px;overflow:hidden}
.brand-logo img{width:100%;height:100%;object-fit:contain;background:var(--card)}
.brand-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}
.hdr-actions{display:flex;align-items:center;gap:2px}
.notif-badge{position:absolute;top:4px;right:3px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--danger);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--card);transform:scale(1);transition:transform .2s var(--ease)}
.notif-badge[hidden]{display:none}
.notif-badge.bump{animation:popIn .45s var(--ease)}
.lang-btn{font-size:.78rem;font-weight:700;letter-spacing:.02em}
.hdr-search{display:none}
.hdr-user{display:none}
@media (min-width:1024px){
  .app-header .bar{padding:0 20px 0 16px}
  .brand{width:calc(var(--sidebar-w) - 16px);margin-right:0}
  .hdr-search{display:flex;align-items:center;gap:10px;flex:1;max-width:460px;height:42px;padding:0 14px;border-radius:12px;background:var(--soft);border:1px solid transparent;color:var(--muted);cursor:pointer;margin-right:auto;font-size:.88rem}
  .hdr-search:hover{border-color:var(--border)}
  .hdr-search kbd{margin-left:auto;font-size:.7rem;border:1px solid var(--border);border-radius:6px;padding:1px 6px;background:var(--card)}
  .hdr-actions .search-mobile,.menu-btn{display:none}
  .hdr-user{display:inline-flex;margin-left:6px}
}
/* sidebar.php */
.app-sidebar{position:fixed;top:0;bottom:0;left:0;width:min(84vw,var(--sidebar-w));z-index:300;background:var(--card);border-right:1px solid var(--border);
  transform:translateX(-102%);transition:transform .3s var(--ease);display:flex;flex-direction:column;overflow:hidden}
.app-sidebar.open{transform:none;box-shadow:var(--shadow-lg)}
.drawer-scrim{position:fixed;inset:0;z-index:290;background:rgba(10,16,32,.38);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .25s}
.drawer-scrim.open{opacity:1;pointer-events:auto}
.sb-scroll{overflow-y:auto;padding:14px 12px 24px;flex:1;overscroll-behavior:contain}
.sb-user{display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:var(--soft);color:inherit;margin-bottom:12px}
.sb-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:16px 10px 6px}
.sb-link{display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border-radius:12px;color:var(--text);font-weight:500;font-size:.92rem;transition:background .15s,color .15s}
.sb-link i{width:20px;text-align:center;color:var(--muted);transition:color .15s}
.sb-link:hover{background:var(--soft)}
.sb-link.active{background:var(--primary-soft);color:var(--primary);font-weight:600}.sb-link.active i{color:var(--primary)}
.sb-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;font-size:.9rem}
.sb-head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 0}
@media (min-width:1024px){
  .app-sidebar{top:var(--header-h);transform:none;width:var(--sidebar-w);z-index:90;background:transparent;border-right:1px solid var(--border)}
  .sb-head,.drawer-scrim{display:none}
}
/* bottom-nav.php */
.bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:100;height:calc(var(--bottom-h) + var(--safe-b));padding:6px 8px var(--safe-b);display:flex;justify-content:space-around;align-items:stretch;
  background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:saturate(180%) blur(16px);-webkit-backdrop-filter:saturate(180%) blur(16px);border-top:1px solid var(--border)}
.bn-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--muted);font-size:.68rem;font-weight:600;position:relative;border-radius:14px;transition:color .15s}
.bn-item i{font-size:1.12rem;width:52px;height:30px;display:grid;place-items:center;border-radius:15px;transition:background .25s var(--ease),transform .2s var(--ease)}
.bn-item.active{color:var(--primary)}
.bn-item.active i{background:var(--primary-soft);transform:translateY(-1px)}
.bn-item:active i{transform:scale(.9)}
.bn-item span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (min-width:1024px){.bottom-nav{display:none}}

/* ---------- cards ---------- */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow-sm)}
.card-pad-lg{padding:20px}
.card-link{display:block;color:inherit;transition:transform .18s var(--ease),box-shadow .18s,border-color .18s}
.card-link:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:color-mix(in srgb,var(--primary) 25%,var(--border))}
.card-link:active{transform:scale(.985)}
.icon-box{width:44px;height:44px;flex:0 0 44px;border-radius:14px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);font-size:1.1rem}
.icon-box img{width:26px;height:26px;object-fit:contain}
.icon-box.sm{width:36px;height:36px;flex-basis:36px;border-radius:11px;font-size:.95rem}
.icon-box.lg{width:56px;height:56px;flex-basis:56px;border-radius:18px;font-size:1.4rem}
.icon-box.success{background:color-mix(in srgb,var(--success) 13%,transparent);color:var(--success)}
.icon-box.danger{background:color-mix(in srgb,var(--danger) 13%,transparent);color:var(--danger)}
.icon-box.warning{background:color-mix(in srgb,var(--warning) 15%,transparent);color:#c98200}
.icon-box.accent{background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent)}
.icon-box.secondary{background:color-mix(in srgb,var(--secondary) 13%,transparent);color:var(--secondary)}
.list{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.list-row{display:flex;align-items:center;gap:12px;padding:12px 14px;color:inherit;border-bottom:1px solid var(--border);transition:background .15s}
.list-row:last-child{border-bottom:0}
a.list-row:hover{background:var(--soft)}
.list-row .chev{color:var(--muted);font-size:.8rem}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.9rem}.kv dt{color:var(--muted)}.kv dd{margin:0;text-align:right;word-break:break-word}

/* ---------- buttons ---------- */
.btn{--b:var(--primary);display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:0 18px;border-radius:12px;border:1px solid transparent;
  background:var(--b);color:#fff;font-weight:600;font-size:.92rem;cursor:pointer;white-space:nowrap;transition:transform .12s var(--ease),background .15s,box-shadow .15s,opacity .15s;user-select:none;text-decoration:none}
.btn:hover{background:color-mix(in srgb,var(--b) 88%,#000)}
.btn:active{transform:scale(.97)}
.btn[disabled],.btn.loading{opacity:.6;pointer-events:none}
.btn.loading::after{content:"";width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
.btn-soft{background:var(--primary-soft);color:var(--primary)}.btn-soft:hover{background:color-mix(in srgb,var(--primary) 18%,transparent)}
.btn-ghost{background:transparent;color:var(--text);border-color:var(--border)}.btn-ghost:hover{background:var(--soft)}
.btn-danger{--b:var(--danger)}.btn-success{--b:var(--success)}
.btn-sm{min-height:36px;padding:0 12px;font-size:.84rem;border-radius:10px}
.btn-lg{min-height:52px;padding:0 24px;font-size:1rem;border-radius:14px}
.btn-block{display:flex;width:100%}
.icon-btn{width:40px;height:40px;border-radius:12px;display:inline-grid;place-items:center;border:0;background:transparent;color:var(--text);cursor:pointer;position:relative;transition:background .15s,transform .12s;font-size:1.05rem}
.icon-btn:hover{background:var(--soft)}.icon-btn:active{transform:scale(.92)}
@keyframes spin{to{transform:rotate(360deg)}}

/* ---------- chips / badges ---------- */
.chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;-webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:.85rem;font-weight:500;white-space:nowrap;cursor:pointer;transition:all .15s}
.chip.active,.chip[aria-pressed="true"]{background:var(--primary);color:#fff;border-color:var(--primary)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:.72rem;font-weight:600;background:var(--primary-soft);color:var(--primary);line-height:1.6;white-space:nowrap}
.badge.success{background:color-mix(in srgb,var(--success) 14%,transparent);color:var(--success)}
.badge.danger{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
.badge.warning{background:color-mix(in srgb,var(--warning) 18%,transparent);color:#b77400}
.badge.muted{background:var(--soft);color:var(--muted)}
.badge.vip{background:linear-gradient(135deg,#f7c948,#f59e0b);color:#3b2600;position:relative;overflow:hidden}
.badge.vip::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.65) 50%,transparent 70%);transform:translateX(-100%);animation:shine 2.8s ease-in-out infinite}
@keyframes shine{60%,100%{transform:translateX(100%)}}
.dot{width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block}
.status{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:600;padding:3px 10px;border-radius:999px}
.status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.status-pending,.status-pending_payment,.status-payment_submitted,.status-under_review{background:color-mix(in srgb,var(--warning) 16%,transparent);color:#b77400}
.status-pending::before,.status-under_review::before,.status-payment_submitted::before{animation:pulse 1.6s infinite}
.status-approved,.status-completed{background:color-mix(in srgb,var(--success) 14%,transparent);color:var(--success)}
.status-rejected,.status-cancelled{background:color-mix(in srgb,var(--danger) 13%,transparent);color:var(--danger)}
@keyframes pulse{50%{opacity:.35}}

/* ---------- forms ---------- */
.form-group{margin-bottom:14px}
.label{display:block;font-size:.84rem;font-weight:600;margin-bottom:6px}
.input,.select,.textarea{width:100%;min-height:46px;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);transition:border-color .15s,box-shadow .15s;font-size:.95rem}
.textarea{min-height:110px;resize:vertical;line-height:1.55}
.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-soft)}
.input.invalid,.textarea.invalid,.select.invalid{border-color:var(--danger)}
.field-error{color:var(--danger);font-size:.78rem;margin-top:4px}
.input-icon{position:relative}.input-icon>i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.input-icon .input{padding-left:40px}
.input-icon .toggle-pw{position:absolute;right:4px;top:50%;transform:translateY(-50%)}
.hint{font-size:.78rem;color:var(--muted);margin-top:4px}
.check{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.9rem}
.switch{position:relative;width:46px;height:28px;flex:0 0 46px}
.switch input{opacity:0;width:0;height:0;position:absolute}
.switch span{position:absolute;inset:0;border-radius:99px;background:var(--border);transition:background .2s;cursor:pointer}
.switch span::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s var(--ease)}
.switch input:checked+span{background:var(--primary)}.switch input:checked+span::after{transform:translateX(18px)}
.switch input:focus-visible+span{outline:2px solid var(--primary);outline-offset:2px}
.hp-field{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}
.file-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:18px;border:1.5px dashed var(--border);border-radius:14px;background:var(--soft);cursor:pointer;text-align:center;color:var(--muted);font-size:.86rem;transition:border-color .15s}
.file-drop:hover{border-color:var(--primary)}.file-drop input{display:none}.file-drop img{max-height:140px;border-radius:10px;margin-top:6px}
.upload-progress{height:4px;border-radius:4px;background:var(--soft);overflow:hidden;margin-top:8px;display:none}.upload-progress>i{display:block;height:100%;width:0;background:var(--primary);transition:width .2s}

.seg{display:inline-flex;background:var(--soft);border-radius:10px;padding:3px;gap:2px}
.seg button{border:0;background:transparent;padding:5px 10px;border-radius:8px;font-size:.78rem;font-weight:600;color:var(--muted);cursor:pointer}
.seg button.active{background:var(--card);color:var(--primary);box-shadow:var(--shadow-sm)}

/* ---------- tabs ---------- */
.tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:4px;background:var(--soft);border-radius:14px;margin-bottom:16px}
.tabs::-webkit-scrollbar{display:none}
.tab{flex:1 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:11px;color:var(--muted);font-weight:600;font-size:.85rem;white-space:nowrap;border:0;background:transparent;cursor:pointer;transition:all .15s}
.tab.active{background:var(--card);color:var(--primary);box-shadow:var(--shadow-sm)}

/* ---------- alerts / empty / skeleton ---------- */
.alert{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:.9rem;background:var(--primary-soft);color:var(--text);border:1px solid color-mix(in srgb,var(--primary) 20%,transparent)}
.alert>i{color:var(--primary);margin-top:3px}
.alert.success{background:color-mix(in srgb,var(--success) 10%,transparent);border-color:color-mix(in srgb,var(--success) 25%,transparent)}.alert.success>i{color:var(--success)}
.alert.danger{background:color-mix(in srgb,var(--danger) 9%,transparent);border-color:color-mix(in srgb,var(--danger) 25%,transparent)}.alert.danger>i{color:var(--danger)}
.alert.warning{background:color-mix(in srgb,var(--warning) 12%,transparent);border-color:color-mix(in srgb,var(--warning) 30%,transparent)}.alert.warning>i{color:#c98200}
.empty{text-align:center;padding:36px 16px;color:var(--muted)}
.empty .icon-box{margin:0 auto 12px;width:64px;height:64px;border-radius:20px;font-size:1.5rem}
.skeleton{background:linear-gradient(90deg,var(--soft) 25%,color-mix(in srgb,var(--soft) 50%,var(--card)) 50%,var(--soft) 75%);background-size:200% 100%;animation:sk 1.2s infinite;border-radius:10px}
@keyframes sk{to{background-position:-200% 0}}

/* ---------- auth screens ---------- */
.auth-wrap{max-width:430px;margin:8px auto 24px}
.auth-card{padding:24px 20px}
@media (min-width:640px){.auth-card{padding:32px 30px}}
.auth-head{text-align:center;margin-bottom:20px}
.auth-head .icon-box{margin:0 auto 12px}
.auth-head h1{font-size:1.4rem;margin-bottom:4px}
.auth-head p{color:var(--muted);font-size:.9rem;margin:0}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:.78rem;margin:18px 0}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--border)}
.btn-google{background:var(--card);color:var(--text);border:1px solid var(--border)}.btn-google:hover{background:var(--soft)}
.code-input{text-align:center;font-size:1.5rem;letter-spacing:.5em;font-weight:700;padding-left:.5em}
.auth-foot{text-align:center;font-size:.88rem;margin-top:16px;color:var(--muted)}

/* ---------- notification list ---------- */
.notif-item{align-items:flex-start}
.notif-item.unread{background:color-mix(in srgb,var(--primary) 4%,var(--card))}
.notif-body{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.notif-body strong{font-size:.9rem;font-weight:600}
.notif-item:not(.unread) .notif-body strong{font-weight:500;color:color-mix(in srgb,var(--text) 80%,var(--muted))}
.notif-body .nb{font-size:.84rem;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.notif-body .nt{font-size:.72rem;color:var(--muted)}
.unread-dot{width:9px;height:9px;border-radius:50%;background:var(--primary);margin-top:8px;flex:0 0 9px;box-shadow:0 0 0 4px var(--primary-soft)}

/* ---------- avatar ---------- */
.avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));flex:0 0 auto;overflow:hidden;font-size:1rem}
.avatar img{width:100%;height:100%;object-fit:cover}
.avatar.sm{width:32px;height:32px;font-size:.8rem}.avatar.lg{width:72px;height:72px;font-size:1.6rem}

/* ---------- top progress ---------- */
#top-progress{position:fixed;left:0;top:0;height:3px;width:100%;z-index:999;pointer-events:none;transform-origin:left;transform:scaleX(0);opacity:0;
  background:linear-gradient(90deg,var(--primary),var(--accent));box-shadow:0 0 10px var(--primary)}
#top-progress.run{opacity:1;transition:transform 8s cubic-bezier(.1,.7,.1,1)}
#top-progress.done{opacity:0;transform:scaleX(1)!important;transition:transform .2s ease,opacity .35s .15s}

/* ---------- toasts ---------- */
.toast-stack{position:fixed;left:50%;top:calc(var(--header-h) + 10px);transform:translateX(-50%);z-index:900;display:flex;flex-direction:column;gap:8px;width:min(92vw,420px);pointer-events:none}
.toast{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--card);color:var(--text);border:1px solid var(--border);box-shadow:var(--shadow-lg);
  font-size:.9rem;pointer-events:auto;animation:toastIn .3s var(--ease) both}
.toast.out{animation:toastOut .25s ease forwards}
.toast .t-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;flex:0 0 28px;color:#fff;background:var(--primary);font-size:.8rem}
.toast.success .t-icon{background:var(--success)}.toast.error .t-icon{background:var(--danger)}.toast.warning .t-icon{background:var(--warning)}
.toast .t-icon i{animation:popIn .4s var(--ease) both .08s}
@keyframes toastIn{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes toastOut{to{opacity:0;transform:translateY(-10px) scale(.97)}}
@keyframes popIn{from{transform:scale(0)}70%{transform:scale(1.2)}to{transform:scale(1)}}
.shake{animation:shake .4s}@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}

/* ---------- modal ---------- */
.modal-backdrop{position:fixed;inset:0;z-index:950;background:rgba(10,16,32,.42);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;
  opacity:0;transition:opacity .22s}
.modal-backdrop.open{opacity:1}
.modal{width:100%;max-width:480px;max-height:88vh;overflow:auto;background:var(--card);border-radius:24px 24px 0 0;padding:8px 18px calc(18px + var(--safe-b));box-shadow:var(--shadow-lg);
  transform:translateY(40px);transition:transform .28s var(--ease)}
.modal-backdrop.open .modal{transform:none}
.modal .grabber{width:40px;height:5px;border-radius:5px;background:var(--border);margin:6px auto 12px}
.modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.modal-head h3{margin:0;font-size:1.05rem}
.modal-actions{display:flex;gap:10px;margin-top:16px}.modal-actions .btn{flex:1}
@media (min-width:640px){.modal-backdrop{align-items:center}.modal{border-radius:24px;padding:18px 22px 22px}.modal .grabber{display:none}.modal{transform:translateY(16px) scale(.98)}}

/* ---------- rich text (news / descriptions) ---------- */
.rt{font-size:1rem;line-height:1.8;overflow-wrap:anywhere}
.rt h2{font-size:1.25rem;margin:1.4em 0 .5em}.rt h3{font-size:1.1rem;margin:1.2em 0 .4em}
.rt img{border-radius:14px;margin:1em auto;height:auto}.rt ul,.rt ol{padding-left:1.3em}.rt li{margin:.25em 0}
.rt blockquote{margin:1em 0;padding:.6em 1em;border-left:4px solid var(--primary);background:var(--soft);border-radius:0 12px 12px 0}
.rt a{text-decoration:underline;text-underline-offset:3px}
.rt mark,.rt .rt-highlight{background:color-mix(in srgb,var(--warning) 35%,transparent);color:inherit;padding:0 .2em;border-radius:4px}
.rt pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:12px;overflow:auto;font-size:.85rem}
.rt iframe{width:100%;aspect-ratio:16/9;height:auto;border:0;border-radius:14px}
.rt table{width:100%;border-collapse:collapse;font-size:.9rem;display:block;overflow-x:auto}.rt td,.rt th{border:1px solid var(--border);padding:8px}
.rt-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 10px;border-radius:999px;font-size:.78em;font-weight:700;background:var(--primary-soft);color:var(--primary);vertical-align:middle}
.rt-badge-green{background:color-mix(in srgb,var(--success) 15%,transparent);color:var(--success)}
.rt-badge-red{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
.rt-badge-orange{background:color-mix(in srgb,var(--warning) 20%,transparent);color:#b77400}
.rt-badge-purple{background:color-mix(in srgb,var(--secondary) 15%,transparent);color:var(--secondary)}
.rt-badge-gold{background:linear-gradient(135deg,#f7c948,#f59e0b);color:#3b2600}
.rt-badge-dark{background:#13203a;color:#fff}
.rt-alert{display:block;padding:12px 14px;border-radius:14px;margin:1em 0;background:var(--primary-soft);border:1px solid color-mix(in srgb,var(--primary) 22%,transparent)}
.rt-alert-success{background:color-mix(in srgb,var(--success) 10%,transparent);border-color:color-mix(in srgb,var(--success) 28%,transparent)}
.rt-alert-warning{background:color-mix(in srgb,var(--warning) 13%,transparent);border-color:color-mix(in srgb,var(--warning) 32%,transparent)}
.rt-alert-danger{background:color-mix(in srgb,var(--danger) 9%,transparent);border-color:color-mix(in srgb,var(--danger) 28%,transparent)}
.rt-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:12px;background:var(--primary);color:#fff!important;text-decoration:none!important;font-weight:600}
.rt-btn-outline{background:transparent;color:var(--primary)!important;border:1.5px solid var(--primary)}
.rt-up{color:var(--success)}.rt-down{color:var(--danger)}
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
