<?php
/** Navigation drawer (mobile) / persistent sidebar (desktop). */
defined('APP') || exit;
$u = user();
$cats = rows('SELECT slug, name_en, name_bn, icon FROM service_categories WHERE status = 1 ORDER BY sort, id LIMIT 8');
$links = [
    ['home', '/', 'fa-house', t('nav.home')],
    ['services', '/services', 'fa-layer-group', t('nav.services')],
    ['news', '/news', 'fa-newspaper', t('nav.news')],
    ['team', '/team', 'fa-users', t('nav.team')],
    ['contact', '/contact', 'fa-headset', t('nav.contact')],
    ['payment', '/payment', 'fa-receipt', t('nav.orders')],
    ['notifications', '/notifications', 'fa-bell', t('nav.notifications')],
];
?>
<div class="drawer-scrim" data-action="drawer-close"></div>
<aside class="app-sidebar" id="app-sidebar" aria-label="<?= e(t('nav.menu')) ?>">
  <div class="sb-head">
    <strong><?= e(setting('site_name')) ?></strong>
    <button class="icon-btn" data-action="drawer-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <nav class="sb-scroll">
    <?php if ($u): ?>
      <a class="sb-user" href="<?= e(url('/profile')) ?>" data-nav-link="profile">
        <span class="avatar"><?php if ($u['avatar']): ?><img src="<?= e(media_url($u['avatar'])) ?>" alt=""><?php else: ?><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?><?php endif ?></span>
        <span class="grow"><strong class="truncate" style="display:block"><?= e($u['name']) ?></strong><span class="small muted truncate" style="display:block"><?= e($u['email']) ?></span></span>
        <i class="fa-solid fa-chevron-right small muted"></i>
      </a>
    <?php else: ?>
      <div class="row" style="margin-bottom:12px">
        <a class="btn btn-sm grow" href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a>
        <a class="btn btn-sm btn-soft grow" href="<?= e(url('/register')) ?>"><?= e(t('auth.register')) ?></a>
      </div>
    <?php endif ?>

    <?php foreach ($links as [$key, $href, $icon, $label]): ?>
      <a class="sb-link" href="<?= e(url($href)) ?>" data-nav-link="<?= $key ?>"><i class="fa-solid <?= $icon ?>"></i><?= e($label) ?></a>
    <?php endforeach ?>
    <?php if ($u): ?><a class="sb-link" href="<?= e(url('/profile')) ?>" data-nav-link="profile"><i class="fa-solid fa-user"></i><?= e(t('nav.profile')) ?></a><?php endif ?>
    <?php if ($u && is_staff($u)): ?><a class="sb-link" href="<?= e(url('/admin')) ?>" data-no-spa><i class="fa-solid fa-gauge-high"></i><?= e(t('nav.admin')) ?></a><?php endif ?>

    <?php if ($cats): ?>
      <div class="sb-label"><?= e(t('nav.categories')) ?></div>
      <?php foreach ($cats as $c): ?>
        <a class="sb-link" href="<?= e(url('/services?category=' . $c['slug'])) ?>"><i class="<?= e(fa($c['icon'], 'fa-solid fa-folder')) ?>"></i><?= e(loc($c, 'name')) ?></a>
      <?php endforeach ?>
    <?php endif ?>

    <div class="sb-label"><?= e(t('nav.preferences')) ?></div>
    <?php if (setting_bool('theme.dark_enabled')): ?>
    <div class="sb-row"><span><i class="fa-solid fa-circle-half-stroke muted"></i> <?= e(t('nav.theme')) ?></span>
      <span class="seg" role="group" aria-label="<?= e(t('nav.theme')) ?>">
        <button data-action="theme-set" data-theme="light"><?= e(t('theme.light')) ?></button>
        <button data-action="theme-set" data-theme="dark"><?= e(t('theme.dark')) ?></button>
        <button data-action="theme-set" data-theme="system"><?= e(t('theme.auto')) ?></button>
      </span></div>
    <?php endif ?>
    <div class="sb-row"><span><i class="fa-solid fa-language muted"></i> <?= e(t('nav.language')) ?></span>
      <span class="seg"><?php foreach (LANGS as $code => $name): ?><button data-action="lang-set" data-lang="<?= $code ?>" class="<?= lang() === $code ? 'active' : '' ?>"><?= e($name) ?></button><?php endforeach ?></span></div>
    <div class="sb-row"><span><i class="fa-solid fa-volume-high muted"></i> <?= e(t('notif.sound')) ?></span>
      <label class="switch"><input type="checkbox" data-action="sound-toggle" aria-label="<?= e(t('notif.sound')) ?>"><span></span></label></div>
    <?php if (setting_bool('pwa.enabled')): ?>
      <button class="sb-link" style="width:100%;border:0;background:none;cursor:pointer" data-action="install-app" data-install-link hidden><i class="fa-solid fa-download"></i><?= e(t('pwa.install')) ?></button>
    <?php endif ?>
    <?php if ($u): ?>
      <button class="sb-link" style="width:100%;border:0;background:none;cursor:pointer;color:var(--danger)" data-action="logout"><i class="fa-solid fa-arrow-right-from-bracket" style="color:var(--danger)"></i><?= e(t('auth.logout')) ?></button>
    <?php endif ?>
  </nav>
</aside>
