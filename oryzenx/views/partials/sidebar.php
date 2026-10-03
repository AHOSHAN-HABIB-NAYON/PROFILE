<?php
/** @var ?array $user */
$links = [
    ['home', '/', 'fa-solid fa-house', t('nav.home')],
    ['services', '/services', 'fa-solid fa-layer-group', t('nav.services')],
    ['news', '/news', 'fa-solid fa-newspaper', t('nav.news')],
    ['projects', '/projects', 'fa-solid fa-briefcase', t('nav.projects')],
    ['team', '/team', 'fa-solid fa-users', t('nav.team')],
    ['payment', '/payment', 'fa-solid fa-wallet', t('nav.payment')],
    ['faq', '/faq', 'fa-solid fa-circle-question', t('nav.faq')],
    ['contact', '/contact', 'fa-solid fa-headset', t('nav.contact')],
];
?>
<aside class="sidebar" id="sidebar" aria-label="<?= e(t('nav.menu')) ?>">
    <div class="sidebar-inner">
        <a class="side-brand" href="<?= e(url('/')) ?>"><?= brand_avatar() ?><span><strong><?= e(setting('site_name')) ?></strong><small><?= e(lang() === 'bn' ? setting('site_tagline_bn') : setting('site_tagline')) ?></small></span></a>
        <?php if ($user): ?>
            <a class="side-user" href="<?= e(url('/profile')) ?>" data-nav="profile">
                <?= avatar_html($user) ?>
                <span><strong><?= e($user['name']) ?></strong><small><?= e($user['email']) ?></small></span>
            </a>
        <?php else: ?>
            <div class="side-auth">
                <a class="btn btn-sm btn-primary" href="<?= e(url('/login')) ?>"><?= e(t('auth.login')) ?></a>
                <a class="btn btn-sm btn-outline" href="<?= e(url('/register')) ?>"><?= e(t('auth.register')) ?></a>
            </div>
        <?php endif; ?>
        <nav class="side-nav">
            <?php foreach ($links as [$key, $href, $icon, $label]): ?>
                <a href="<?= e(url($href)) ?>" data-nav="<?= $key ?>"><i class="<?= $icon ?>"></i><span><?= e($label) ?></span></a>
            <?php endforeach; ?>
            <?php if ($user): ?>
                <a href="<?= e(url('/notifications')) ?>" data-nav="notifications"><i class="fa-solid fa-bell"></i><span><?= e(t('nav.notifications')) ?></span></a>
                <a href="<?= e(url('/profile')) ?>" data-nav="profile"><i class="fa-solid fa-user"></i><span><?= e(t('nav.profile')) ?></span></a>
                <a href="<?= e(url('/profile/security')) ?>" data-nav="security"><i class="fa-solid fa-shield-halved"></i><span><?= e(t('nav.security')) ?></span></a>
                <?php if ($user['role'] === 'admin'): ?>
                    <a href="<?= e(url('/admin')) ?>" data-no-spa><i class="fa-solid fa-gauge-high"></i><span><?= e(t('nav.admin')) ?></span></a>
                <?php endif; ?>
            <?php endif; ?>
        </nav>
        <div class="side-extra">
            <button class="side-link" type="button" data-action="install" hidden data-install-btn><i class="fa-solid fa-download"></i><span><?= e(t('pwa.install')) ?></span></button>
            <button class="side-link" type="button" data-action="chat-open"><i class="fa-solid fa-robot"></i><span><?= e(t('chat.title')) ?></span></button>
            <?php if ($user): ?>
                <form method="post" action="<?= e(url('/logout')) ?>" data-ajax data-full-reload data-confirm="<?= e(t('auth.logout_confirm')) ?>"><?= csrf_field() ?>
                    <button class="side-link text-danger" type="submit"><i class="fa-solid fa-right-from-bracket"></i><span><?= e(t('auth.logout')) ?></span></button>
                </form>
            <?php endif; ?>
        </div>
    </div>
</aside>
<div class="drawer-backdrop" data-action="drawer-close" hidden></div>
