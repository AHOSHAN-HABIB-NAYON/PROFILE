<?php
/** Persistent top app bar (never reloaded during AJAX navigation). */
defined('APP') || exit;
$u = user();
$unread = $u ? unread_count((int)$u['id']) : 0;
$logo = setting('logo');
$siteName = (string)setting('site_name');
?>
<header class="app-header" role="banner">
  <div class="bar">
    <button class="sq-btn menu-btn" data-action="drawer-open" aria-label="<?= e(t('nav.menu')) ?>" aria-controls="app-sidebar" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
    <a href="<?= e(url('/')) ?>" class="brand" aria-label="<?= e($siteName) ?>">
      <span class="brand-logo"><?php if ($logo): ?><img src="<?= e(media_url($logo)) ?>" alt="" width="36" height="36"><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
      <span class="brand-name"><?= e($siteName) ?></span>
    </a>
    <button class="hdr-search" data-action="search-open" aria-label="<?= e(t('search.placeholder')) ?>"><i class="fa-solid fa-magnifying-glass"></i><span><?= e(t('search.placeholder')) ?></span><kbd>/</kbd></button>
    <div class="hdr-actions">
      <button class="sq-btn search-mobile" data-action="search-open" aria-label="<?= e(t('search.title')) ?>"><i class="fa-solid fa-magnifying-glass"></i></button>
      <button class="sq-btn" data-action="lang-toggle" data-lang="<?= lang() === 'bn' ? 'en' : 'bn' ?>" aria-label="<?= e(t('nav.language')) ?>" title="<?= lang() === 'bn' ? 'English' : 'বাংলা' ?>"><i class="fa-solid fa-language"></i></button>
      <?php if (setting_bool('theme.dark_enabled')): ?>
      <button class="sq-btn" data-action="theme-toggle" aria-label="<?= e(t('nav.theme')) ?>"><i class="fa-regular fa-moon theme-icon"></i></button>
      <?php endif ?>
      <?php if ($u): ?>
      <a class="sq-btn" href="<?= e(url('/notifications')) ?>" aria-label="<?= e(t('nav.notifications')) ?>">
        <i class="fa-regular fa-bell"></i><span class="notif-badge" data-unread <?= $unread ? '' : 'hidden' ?>><?= $unread > 99 ? '99+' : $unread ?></span>
      </a>
      <a class="hdr-user" href="<?= e(url('/profile')) ?>" aria-label="<?= e(t('nav.profile')) ?>">
        <span class="avatar sm"><?php if ($u['avatar']): ?><img src="<?= e(media_url($u['avatar'])) ?>" alt=""><?php else: ?><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?><?php endif ?></span>
      </a>
      <?php else: ?>
      <a class="btn btn-signup" href="<?= e(url(setting_bool('security.allow_registration') ? '/register' : '/login')) ?>"><?= e(setting_bool('security.allow_registration') ? t('auth.signup') : t('auth.login')) ?></a>
      <?php endif ?>
    </div>
  </div>
</header>
