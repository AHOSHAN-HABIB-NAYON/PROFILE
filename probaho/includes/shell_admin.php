<?php
/** /v2admin shell. */
$admin = AdminAuth::user();
$siteName = (string) setting('site_name', 'Probaho');
if (!$admin) {
    echo '<main class="admin-auth">' . $content . '</main>';
    return;
}
$pending = [
    'transactions' => (int) db()->val("SELECT COUNT(*) FROM transactions WHERE status = 'pending' AND type IN ('deposit','withdraw')"),
    'reports' => (int) db()->val("SELECT COUNT(*) FROM reports WHERE status = 'pending'"),
];
$groups = [
    'ওভারভিউ' => [['', 'chart', 'ড্যাশবোর্ড']],
    'ব্যবহারকারী ও অর্থ' => [
        ['users', 'users', 'ইউজার'], ['wallets', 'wallet', 'ওয়ালেট'], ['transactions', 'history', 'লেনদেন'],
        ['payments', 'card', 'পেমেন্ট'], ['binance', 'binance', 'Binance Pay'], ['payment-methods', 'layers', 'পেমেন্ট মেথড'],
    ],
    'কনটেন্ট' => [
        ['services', 'grid', 'সার্ভিস'], ['service-categories', 'tag', 'সার্ভিস ক্যাটাগরি'], ['products', 'package', 'প্রোডাক্ট'],
        ['posts', 'megaphone', 'পোস্ট / ঘোষণা'], ['faqs', 'help', 'FAQ'], ['pages', 'file', 'পেজ'],
    ],
    'যোগাযোগ' => [
        ['reports', 'flag', 'রিপোর্ট'], ['notifications', 'bell', 'নোটিফিকেশন ও পুশ'], ['knowledge', 'bot', 'AI নলেজ বেস'],
        ['chat-logs', 'message', 'AI চ্যাট লগ'], ['support', 'headset', 'সাপোর্ট'],
    ],
    'সিস্টেম' => [
        ['smtp', 'mail', 'SMTP ইমেইল'], ['push', 'zap', 'Web Push'], ['pwa', 'smartphone', 'PWA'],
        ['security', 'shield', 'সিকিউরিটি'], ['settings', 'settings', 'সেটিংস'], ['admins', 'key', 'অ্যাডমিন'], ['logs', 'activity', 'লগ'],
    ],
];
?>
<aside class="admin-sidebar" id="admin-sidebar">
  <a href="<?= e(url('/v2admin')) ?>" class="brand" data-link><img src="<?= e(brand_logo()) ?>" alt="" width="32" height="32" class="brand-logo"><span class="brand-name"><?= e($siteName) ?> <small>Admin</small></span></a>
  <nav class="admin-nav">
    <?php foreach ($groups as $title => $items): ?>
      <div class="admin-nav-group"><?= e($title) ?></div>
      <?php foreach ($items as [$slug, $ic, $label]): $key = $slug ?: 'dashboard'; ?>
        <a href="<?= e(url('/v2admin' . ($slug ? '/' . $slug : ''))) ?>" data-link data-nav="<?= e($key) ?>" class="<?= $active === $key ? 'active' : '' ?>"><?= icon($ic) ?><span><?= e($label) ?></span><?php if (!empty($pending[$slug])): ?><b class="nav-badge"><?= $pending[$slug] ?></b><?php endif; ?></a>
      <?php endforeach; ?>
    <?php endforeach; ?>
  </nav>
</aside>
<div class="admin-frame">
  <header class="admin-topbar">
    <button type="button" class="icon-btn admin-menu-btn" data-action="admin-menu" aria-label="মেনু"><?= icon('menu') ?></button>
    <h1 class="topbar-title" data-heading><?= e($meta['heading'] ?? $meta['title']) ?></h1>
    <div class="topbar-actions">
      <a href="<?= e(url('/')) ?>" class="icon-btn" target="_blank" rel="noopener" aria-label="সাইট দেখুন"><?= icon('external') ?></a>
      <button type="button" class="icon-btn" data-action="theme-cycle" aria-label="থিম"><?= icon('sun', 'theme-ic-light') ?><?= icon('moon', 'theme-ic-dark') ?></button>
      <span class="admin-who hide-sm"><?= e($admin['name']) ?> <small><?= e($admin['role']) ?></small></span>
      <button type="button" class="icon-btn" data-action="admin-logout" aria-label="লগআউট"><?= icon('logout') ?></button>
    </div>
  </header>
  <main class="admin-main"><?= $content ?></main>
</div>
