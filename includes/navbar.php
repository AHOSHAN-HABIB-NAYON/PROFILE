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
    <button class="icon-btn menu-btn" data-action="drawer-open" aria-label="<?= e(t('nav.menu')) ?>" aria-controls="app-sidebar" aria-expanded="false"><i class="fa-solid fa-bars-staggered"></i></button>
    <a href="<?= e(url('/')) ?>" class="brand" aria-label="<?= e($siteName) ?>">
      <span class="brand-logo"><?php if ($logo): ?><img src="<?= e(media_url($logo)) ?>" alt="" width="34" height="34"><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
      <span class="brand-name"><?= e($siteName) ?></span>
    </a>
    <button class="hdr-search" data-action="search-open" aria-label="<?= e(t('search.placeholder')) ?>"><i class="fa-solid fa-magnifying-glass"></i><span><?= e(t('search.placeholder')) ?></span><kbd>/</kbd></button>
    <div class="hdr-actions">
      <button class="icon-btn search-mobile" data-action="search-open" aria-label="<?= e(t('search.title')) ?>"><i class="fa-solid fa-magnifying-glass"></i></button>
      <button class="icon-btn lang-btn" data-action="lang-toggle" data-lang="<?= lang() === 'bn' ? 'en' : 'bn' ?>" aria-label="<?= e(t('nav.language')) ?>"><?= lang() === 'bn' ? 'EN' : 'বাং' ?></button>
      <?php if (setting_bool('theme.dark_enabled')): ?>
      <button class="icon-btn" data-action="theme-toggle" aria-label="<?= e(t('nav.theme')) ?>"><i class="fa-solid fa-moon theme-icon"></i></button>
      <?php endif ?>
      <a class="icon-btn" href="<?= e(url('/notifications')) ?>" aria-label="<?= e(t('nav.notifications')) ?>">
        <i class="fa-regular fa-bell"></i><span class="notif-badge" data-unread <?= $unread ? '' : 'hidden' ?>><?= $unread > 99 ? '99+' : $unread ?></span>
      </a>
      <a class="hdr-user" href="<?= e(url($u ? '/profile' : '/login')) ?>" aria-label="<?= e(t('nav.profile')) ?>">
        <?php if ($u): ?><span class="avatar sm"><?php if ($u['avatar']): ?><img src="<?= e(media_url($u['avatar'])) ?>" alt=""><?php else: ?><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?><?php endif ?></span>
        <?php else: ?><span class="btn btn-sm"><?= e(t('auth.login')) ?></span><?php endif ?>
      </a>
    </div>
  </div>
</header>
