<?php
/** Logged-in app shell: desktop sidebar, mobile top bar + bottom navigation. */
$u = Auth::user();
$siteName = (string) setting('site_name', 'Probaho');
$unread = $u ? Notify::unreadCount((int) $u['id']) : 0;
$side = [
    ['/dashboard', 'home', 'home', 'হোম'],
    ['/services', 'services', 'grid', 'সার্ভিস'],
    ['/qr', 'qr', 'qr', 'QR পেমেন্ট'],
    ['/wallet', 'wallet', 'wallet', 'ওয়ালেট'],
    ['/transactions', 'transactions', 'history', 'লেনদেন'],
    ['/payment/binance-pay', 'binance', 'binance', 'Binance Pay'],
    ['/products', 'products', 'package', 'প্রোডাক্ট'],
    ['/notifications', 'notifications', 'bell', 'নোটিফিকেশন'],
    ['/support', 'support', 'headset', 'সাপোর্ট'],
    ['/profile', 'profile', 'user', 'প্রোফাইল'],
];
$avatar = static function (?array $u): string {
    if ($u && !empty($u['avatar'])) {
        return '<img src="' . e(upload_url($u['avatar'])) . '" alt="" class="avatar-img" referrerpolicy="no-referrer">';
    }
    return '<span class="avatar-initial">' . e(mb_strtoupper(mb_substr((string) ($u['name'] ?? 'U'), 0, 1))) . '</span>';
};
?>
<aside class="app-sidebar" aria-label="অ্যাপ মেনু">
  <a href="<?= e(url('/dashboard')) ?>" class="brand" data-link><img src="<?= e(brand_logo()) ?>" alt="" width="34" height="34" class="brand-logo"><span class="brand-name"><?= e($siteName) ?></span></a>
  <nav class="side-nav">
    <?php foreach ($side as [$href, $key, $ic, $label]): ?>
      <a href="<?= e(url($href)) ?>" data-link data-nav="<?= e($key) ?>" class="<?= $active === $key ? 'active' : '' ?>"><?= icon($ic) ?><span><?= e($label) ?></span><?php if ($key === 'notifications'): ?><b class="nav-badge" data-unread <?= $unread ? '' : 'hidden' ?>><?= $unread > 99 ? '99+' : $unread ?></b><?php endif; ?></a>
    <?php endforeach; ?>
  </nav>
  <div class="side-foot">
    <a href="<?= e(url('/settings')) ?>" class="side-user" data-link>
      <span class="avatar"><?= $avatar($u) ?></span>
      <span class="side-user-meta"><b><?= e($u['name'] ?? '') ?></b><small>ID: <?= e($u['uid'] ?? '') ?></small></span>
      <?= icon('settings') ?>
    </a>
  </div>
</aside>
<div class="app-frame">
  <header class="app-topbar">
    <button type="button" class="icon-btn topbar-back" data-action="back" aria-label="পিছনে" <?= empty($meta['back']) ? 'hidden' : '' ?>><?= icon('chevron-left') ?></button>
    <a href="<?= e(url('/dashboard')) ?>" class="brand topbar-brand" data-link <?= empty($meta['back']) ? '' : 'hidden' ?>><img src="<?= e(brand_logo()) ?>" alt="" width="30" height="30" class="brand-logo"></a>
    <h1 class="topbar-title" data-heading><?= e($meta['heading'] ?? $meta['title']) ?></h1>
    <div class="topbar-actions">
      <button type="button" class="icon-btn" data-action="theme-cycle" aria-label="থিম পরিবর্তন"><?= icon('sun', 'theme-ic-light') ?><?= icon('moon', 'theme-ic-dark') ?></button>
      <a href="<?= e(url('/notifications')) ?>" class="icon-btn bell" data-link aria-label="নোটিফিকেশন"><?= icon('bell') ?><b class="dot-badge" data-unread <?= $unread ? '' : 'hidden' ?>><?= $unread > 99 ? '99+' : $unread ?></b></a>
      <a href="<?= e(url('/profile')) ?>" class="avatar avatar-sm" data-link aria-label="প্রোফাইল"><?= $avatar($u) ?></a>
    </div>
  </header>
  <main class="app-main"><?= $content ?></main>
</div>
<nav class="bottom-nav" aria-label="নিচের মেনু">
  <a href="<?= e(url('/dashboard')) ?>" data-link data-nav="home" class="<?= $active === 'home' ? 'active' : '' ?>"><?= icon('home') ?><span>হোম</span></a>
  <a href="<?= e(url('/services')) ?>" data-link data-nav="services" class="<?= $active === 'services' ? 'active' : '' ?>"><?= icon('grid') ?><span>সার্ভিস</span></a>
  <a href="<?= e(url('/qr')) ?>" data-link data-nav="qr" class="qr-fab <?= $active === 'qr' ? 'active' : '' ?>" aria-label="QR"><span class="qr-fab-inner"><?= icon('qr') ?></span><span>QR</span></a>
  <a href="<?= e(url('/wallet')) ?>" data-link data-nav="wallet" class="<?= $active === 'wallet' ? 'active' : '' ?>"><?= icon('wallet') ?><span>ওয়ালেট</span></a>
  <a href="<?= e(url('/profile')) ?>" data-link data-nav="profile" class="<?= $active === 'profile' ? 'active' : '' ?>"><?= icon('user') ?><span>প্রোফাইল</span></a>
</nav>
