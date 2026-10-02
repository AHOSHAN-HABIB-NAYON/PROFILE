<?php
/**
 * Admin shell: top bar, sidebar (drawer on mobile), bottom nav.
 * Expects $content, $meta, $nav (from send_page()).
 */
defined('APP') || exit;
$isAdmin = true;
$bare = false;
$meta['robots'] = 'noindex,nofollow';
$au = user();
$pendingPay = can('payments') ? (int)val("SELECT COUNT(*) FROM payments WHERE status = 'pending'") : 0;
$supportUnread = can('support') ? (int)val("SELECT COALESCE(SUM(unread_admin),0) FROM support_conversations WHERE status = 'open'") + (int)val("SELECT COUNT(*) FROM contact_messages WHERE status = 'new'") : 0;
$unread = unread_count((int)$au['id']);
$menu = [
    'Main' => [
        ['index', 'Dashboard', 'fa-gauge-high', 'dashboard'],
        ['analytics', 'Analytics', 'fa-chart-line', 'analytics'],
    ],
    'Commerce' => [
        ['payments', 'Payments', 'fa-wallet', 'payments', $pendingPay],
        ['orders', 'Orders', 'fa-bag-shopping', 'orders'],
        ['services', 'Services', 'fa-layer-group', 'services'],
        ['products', 'Products', 'fa-boxes-stacked', 'services'],
    ],
    'Content' => [
        ['news', 'News', 'fa-newspaper', 'news'],
        ['team', 'Team', 'fa-users', 'team'],
        ['media', 'Media & Compressor', 'fa-photo-film', 'media'],
    ],
    'People' => [
        ['users', 'Users', 'fa-user-group', 'users'],
        ['support', 'Support', 'fa-headset', 'support', $supportUnread],
        ['notifications', 'Notifications', 'fa-bell', 'notifications'],
    ],
    'System' => [
        ['ai', 'AI Assistant', 'fa-robot', 'ai'],
        ['settings', 'Settings', 'fa-sliders', 'settings'],
        ['security', 'Security & Audit', 'fa-shield-halved', 'security'],
    ],
];
include ROOT . '/includes/header.php';
?>
<style>
.app-header .brand small{font-size:.66rem;font-weight:700;color:var(--primary);background:var(--primary-soft);padding:2px 7px;border-radius:6px;margin-left:2px}
.adm-side .sb-link{height:42px}.bottom-nav .bn-item{border:0;background:none;cursor:pointer}
.bn-item .count{position:absolute;top:0;right:calc(50% - 26px);background:var(--danger);color:#fff;font-size:.6rem;min-width:16px;height:16px;border-radius:8px;display:grid;place-items:center;padding:0 4px}
.adm-side .sb-link .count{margin-left:auto;background:var(--danger);color:#fff;font-size:.68rem;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:grid;place-items:center;padding:0 6px}
.is-admin .to-top{bottom:calc(var(--bottom-h) + var(--safe-b) + 16px)}
@media (min-width:1024px){.is-admin .to-top{right:auto;left:calc(var(--sidebar-w) + 16px);bottom:20px}}
.adm-main{padding-bottom:calc(var(--bottom-h) + var(--safe-b) + 28px)}
@media (min-width:1024px){.is-admin .to-top{bottom:calc(var(--bottom-h) + var(--safe-b) + 16px)}
@media (min-width:1024px){.is-admin .to-top{right:auto;left:calc(var(--sidebar-w) + 16px);bottom:20px}}
.adm-main{padding-bottom:48px}}
.adm-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0 16px;flex-wrap:wrap}
.adm-title h1{font-size:1.3rem;margin:0}
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.toolbar .input-icon{min-width:180px}
.stat-grid{display:grid;gap:10px;grid-template-columns:repeat(2,1fr)}
@media (min-width:720px){.stat-grid{grid-template-columns:repeat(3,1fr)}}
@media (min-width:1200px){.stat-grid{grid-template-columns:repeat(4,1fr)}}
.stat-card{display:flex;flex-direction:column;gap:10px;padding:14px;color:inherit}
.stat-card .v{font-size:1.35rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.stat-card .l{font-size:.76rem;color:var(--muted)}
.stat-card .d{font-size:.72rem;font-weight:600}
.form-grid{display:grid;gap:0 14px;grid-template-columns:1fr}
@media (min-width:760px){.form-grid{grid-template-columns:1fr 1fr}.form-grid .wide{grid-column:1/-1}}
.form-actions{position:sticky;bottom:calc(var(--bottom-h) + var(--safe-b) + 8px);display:flex;justify-content:flex-end;gap:8px;padding-top:12px;margin-top:4px;background:linear-gradient(transparent,var(--card) 40%)}
@media (min-width:1024px){.form-actions{bottom:12px}}
.switch-row{gap:12px;padding:8px 0}
.media-field{display:flex;gap:12px;align-items:center;padding:10px;border:1px dashed var(--border);border-radius:14px;background:var(--soft)}
.mf-preview{width:72px;height:72px;flex:0 0 72px;border-radius:12px;background:var(--card);display:grid;place-items:center;overflow:hidden;color:var(--muted);font-size:1.4rem;border:1px solid var(--border)}
.mf-preview img{width:100%;height:100%;object-fit:contain}
.mf-preview a{font-size:.7rem;text-align:center;padding:4px;word-break:break-all}
.mf-actions{display:flex;gap:6px;flex-wrap:wrap}
.crud-list .icon-box img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
.pager{display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 0}
.dtable{width:100%;border-collapse:collapse;font-size:.86rem;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.dtable th,.dtable td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
.dtable th{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--soft);font-weight:700}
.dtable tr:last-child td{border-bottom:0}
.dtable tbody tr:hover{background:color-mix(in srgb,var(--soft) 60%,transparent)}
@media (max-width:860px){
  .dtable,.dtable tbody,.dtable tr,.dtable td{display:block;width:100%}
  .dtable{background:transparent;border:0}
  .dtable thead{display:none}
  .dtable tr{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:10px}
  .dtable td{display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;padding:5px 0;text-align:right}
  .dtable td::before{content:attr(data-label);color:var(--muted);font-size:.74rem;text-align:left;flex:0 0 auto}
  .dtable td.actions{justify-content:flex-end}.dtable td.actions::before{content:none}
}
.hide-sm{display:none}@media (min-width:640px){.hide-sm{display:inline}}
.rte{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--card)}
.rte-bar{display:flex;flex-wrap:wrap;gap:2px;padding:6px;border-bottom:1px solid var(--border);background:var(--soft);position:sticky;top:var(--header-h);z-index:3}
.rte-bar button,.rte-bar select{height:34px;min-width:34px;border:0;border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:.86rem;padding:0 8px}
.rte-bar button:hover{background:var(--card)}
.rte-bar .sep{width:1px;background:var(--border);margin:4px 3px}
.rte-area{min-height:260px;max-height:70vh;overflow:auto;padding:14px 16px;outline:none}
.rte-area:empty::before{content:attr(data-placeholder);color:var(--muted)}
.rte-src{width:100%;min-height:260px;border:0;padding:14px;font-family:ui-monospace,monospace;font-size:.82rem;background:#0f172a;color:#e2e8f0;resize:vertical}
.pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:6px;max-height:260px;overflow:auto}
.pick-grid button{height:42px;border:1px solid var(--border);border-radius:10px;background:var(--card);cursor:pointer;font-size:1.15rem}
.pick-grid button:hover{border-color:var(--primary)}
.media-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
.media-item{position:relative;border-radius:14px;overflow:hidden;background:var(--card);border:1px solid var(--border);cursor:pointer}
.media-item .ph{aspect-ratio:1;background:var(--soft);display:grid;place-items:center}
.media-item img{width:100%;height:100%;object-fit:cover}
.media-item .mi-meta{padding:6px 8px;font-size:.7rem;color:var(--muted)}
.chart{width:100%;height:auto;display:block}
.bars{display:flex;flex-direction:column;gap:8px}
.bar-row{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:10px;align-items:center;font-size:.84rem}
.bar-row .track{height:8px;border-radius:8px;background:var(--soft);overflow:hidden}
.bar-row .fill{height:100%;border-radius:8px;background:var(--primary)}
.chat-thread{display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto;padding:12px;background:var(--soft);border-radius:14px}
.chat-thread .msg{max-width:80%}
</style>
<header class="app-header" role="banner">
  <div class="bar">
    <button class="icon-btn menu-btn" data-action="drawer-open" aria-label="Menu" aria-controls="app-sidebar" aria-expanded="false"><i class="fa-solid fa-bars-staggered"></i></button>
    <a href="<?= e(url('/admin')) ?>" class="brand"><span class="brand-logo"><?php if (setting('logo')): ?><img src="<?= e(media_url(setting('logo'))) ?>" alt=""><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
      <span class="brand-name"><?= e(setting('site_name')) ?></span><small>ADMIN</small></a>
    <button class="hdr-search" data-action="search-open"><i class="fa-solid fa-magnifying-glass"></i><span>Search users, orders, payments…</span><kbd>/</kbd></button>
    <div class="hdr-actions">
      <button class="icon-btn search-mobile" data-action="search-open" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
      <?php if (setting_bool('theme.dark_enabled')): ?><button class="icon-btn" data-action="theme-toggle" aria-label="Theme"><i class="fa-solid fa-moon theme-icon"></i></button><?php endif ?>
      <a class="icon-btn" href="<?= e(url('/')) ?>" data-no-spa aria-label="View site" title="View site"><i class="fa-solid fa-globe"></i></a>
      <a class="icon-btn" href="<?= e(url('/notifications')) ?>" data-no-spa aria-label="Notifications"><i class="fa-regular fa-bell"></i><span class="notif-badge" data-unread <?= $unread ? '' : 'hidden' ?>><?= $unread ?></span></a>
      <a class="hdr-user" href="<?= e(url('/profile')) ?>" data-no-spa><span class="avatar sm"><?= e(mb_strtoupper(mb_substr($au['name'], 0, 1))) ?></span></a>
    </div>
  </div>
</header>
<div class="drawer-scrim" data-action="drawer-close"></div>
<aside class="app-sidebar adm-side" id="app-sidebar" aria-label="Admin menu">
  <nav class="sb-scroll">
    <?php foreach ($menu as $group => $items):
        $items = array_filter($items, fn($i) => can($i[3]));
        if (!$items) continue; ?>
      <div class="sb-label"><?= e($group) ?></div>
      <?php foreach ($items as $i): ?>
        <a class="sb-link" href="<?= e(url('/admin' . ($i[0] === 'index' ? '' : '/' . $i[0]))) ?>" data-nav-link="<?= $i[0] ?>"><i class="fa-solid <?= $i[2] ?>"></i><?= e($i[1]) ?><?php if (!empty($i[4])): ?><span class="count"><?= (int)$i[4] ?></span><?php endif ?></a>
      <?php endforeach ?>
    <?php endforeach ?>
    <div class="sb-label">Account</div>
    <a class="sb-link" href="<?= e(url('/')) ?>" data-no-spa><i class="fa-solid fa-globe"></i>View website</a>
    <a class="sb-link" href="<?= e(url('/profile/security')) ?>" data-no-spa><i class="fa-solid fa-user-shield"></i>My security</a>
    <button class="sb-link" style="width:100%;border:0;background:none;cursor:pointer;color:var(--danger)" data-action="logout"><i class="fa-solid fa-arrow-right-from-bracket" style="color:var(--danger)"></i>Logout</button>
  </nav>
</aside>

<main id="app-main" class="app-main adm-main" tabindex="-1" data-nav="<?= e($nav) ?>"><?= $content ?></main>

<nav class="bottom-nav" aria-label="Admin navigation">
  <?php foreach ([['index', 'Dashboard', 'fa-gauge-high', 'dashboard', 0], ['payments', 'Payments', 'fa-wallet', 'payments', $pendingPay], ['services', 'Services', 'fa-layer-group', 'services', 0], ['news', 'News', 'fa-newspaper', 'news', 0], ['settings', 'Settings', 'fa-sliders', 'settings', 0]] as $b):
      if (!can($b[3])) continue; ?>
    <a class="bn-item" href="<?= e(url('/admin' . ($b[0] === 'index' ? '' : '/' . $b[0]))) ?>" data-nav-link="<?= $b[0] ?>"><i class="fa-solid <?= $b[2] ?>"></i><span><?= e($b[1]) ?></span><?php if ($b[4]): ?><span class="count"><?= (int)$b[4] ?></span><?php endif ?></a>
  <?php endforeach ?>
  <button class="bn-item" data-action="drawer-open" aria-label="More"><i class="fa-solid fa-ellipsis"></i><span>More</span></button>
</nav>
<datalist id="fa-icons"><?php foreach (['fa-solid fa-code', 'fa-brands fa-node-js', 'fa-brands fa-php', 'fa-brands fa-react', 'fa-brands fa-html5', 'fa-brands fa-js', 'fa-brands fa-wordpress', 'fa-brands fa-laravel', 'fa-brands fa-python', 'fa-brands fa-google', 'fa-brands fa-bitcoin', 'fa-brands fa-ethereum', 'fa-solid fa-database', 'fa-solid fa-plug', 'fa-solid fa-server', 'fa-solid fa-cart-shopping', 'fa-solid fa-store', 'fa-solid fa-briefcase', 'fa-solid fa-newspaper', 'fa-solid fa-chart-line', 'fa-solid fa-coins', 'fa-solid fa-user-tie', 'fa-solid fa-building', 'fa-solid fa-gauge-high', 'fa-solid fa-cloud', 'fa-solid fa-mobile-screen', 'fa-solid fa-credit-card', 'fa-solid fa-lock', 'fa-solid fa-key', 'fa-solid fa-fingerprint', 'fa-solid fa-bell', 'fa-solid fa-envelope', 'fa-solid fa-robot', 'fa-solid fa-shield-halved', 'fa-solid fa-magnifying-glass-chart', 'fa-solid fa-bolt', 'fa-solid fa-screwdriver-wrench', 'fa-solid fa-layer-group', 'fa-solid fa-rocket', 'fa-solid fa-palette', 'fa-solid fa-globe', 'fa-solid fa-hashtag', 'fa-solid fa-fire', 'fa-solid fa-crown', 'fa-solid fa-gift', 'fa-solid fa-headset'] as $ic): ?><option value="<?= $ic ?>"><?php endforeach ?></datalist>
<?php
include ROOT . '/includes/notifications.php';
$bare = true; // footer: scripts only
include ROOT . '/includes/footer.php';
