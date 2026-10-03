<?php
/** @var ?array $user */
$logo = setting('logo');
?>
<header class="topbar" role="banner">
    <button class="hbtn only-mobile" type="button" data-action="drawer" aria-label="<?= e(t('nav.menu')) ?>" aria-controls="sidebar" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
    <a class="brand" href="<?= e(url('/')) ?>" aria-label="<?= e(setting('site_name')) ?>">
        <?php if ($logo): ?>
            <img class="brand-logo" src="<?= e(upload_url($logo)) ?>" alt="" width="28" height="28">
        <?php else: ?>
            <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <?php endif; ?>
        <?php if (setting('show_site_name') === '1'): ?><span class="brand-name"><?= e(setting('site_name')) ?></span><?php endif; ?>
    </a>
    <button class="search-trigger only-desktop" type="button" data-action="search"><i class="fa-solid fa-magnifying-glass"></i><span><?= e(t('search.placeholder')) ?></span><kbd>/</kbd></button>
    <div class="topbar-actions">
        <button class="hbtn only-mobile" type="button" data-action="search" aria-label="<?= e(t('search.title')) ?>"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="hbtn" type="button" data-action="lang" data-lang="<?= lang() === 'bn' ? 'en' : 'bn' ?>" aria-label="<?= e(t('nav.language')) ?>" title="<?= lang() === 'bn' ? 'English' : 'বাংলা' ?>"><i class="fa-solid fa-language"></i></button>
        <?php if (setting('allow_dark') === '1'): ?>
        <button class="hbtn" type="button" data-action="theme" aria-label="<?= e(t('nav.theme')) ?>"><i class="fa-regular fa-moon theme-ic-dark"></i><i class="fa-solid fa-sun theme-ic-light"></i></button>
        <?php endif; ?>
        <?php if ($user): ?>
            <button class="hbtn notif-btn" type="button" data-action="notifications" aria-label="<?= e(t('nav.notifications')) ?>" aria-haspopup="true">
                <i class="fa-regular fa-bell"></i><span class="dot-badge" data-notif-count hidden></span>
            </button>
            <a class="only-desktop topbar-user" href="<?= e(url('/profile')) ?>" data-nav="profile"><?= avatar_html($user, 'avatar-sm') ?></a>
        <?php else: ?>
            <a class="btn btn-sm btn-ghost only-desktop" href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a>
            <a class="hsignup" href="<?= e(url('/register')) ?>"><?= e(t('auth.signup')) ?></a>
        <?php endif; ?>
    </div>
    <div class="notif-panel card" id="notif-panel" hidden role="dialog" aria-label="<?= e(t('nav.notifications')) ?>">
        <div class="notif-head"><strong><?= e(t('nav.notifications')) ?></strong>
            <?php if ($user): ?><button class="link-btn" type="button" data-action="notif-read-all"><?= e(t('notif.mark_all')) ?></button><?php endif; ?></div>
        <div class="notif-list" data-notif-list>
            <?php if (!$user): ?><div class="empty-sm"><i class="fa-regular fa-bell"></i><p><?= e(t('notif.login_to_see')) ?></p><a class="btn btn-sm btn-primary" href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a></div><?php endif; ?>
        </div>
        <?php if ($user): ?><a class="notif-foot" href="<?= e(url('/notifications')) ?>"><?= e(t('notif.view_all')) ?></a><?php endif; ?>
    </div>
</header>
