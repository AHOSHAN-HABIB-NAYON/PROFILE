<?php
/** @var string $content @var array $page */
$user = auth();
$pending = (int)DB::val("SELECT COUNT(*) FROM payments WHERE status = 'pending'");
$newMsgs = (int)DB::val("SELECT COUNT(*) FROM contact_messages WHERE status = 'new'");
$groups = [
    'admin.g_overview' => [
        ['dashboard', '/admin', 'fa-solid fa-gauge-high', 'admin.dashboard', 0],
        ['analytics', '/admin/analytics', 'fa-solid fa-chart-line', 'admin.analytics', 0],
    ],
    'admin.g_business' => [
        ['users', '/admin/users', 'fa-solid fa-users', 'admin.users', 0],
        ['payments', '/admin/payments', 'fa-solid fa-wallet', 'admin.payments', $pending],
        ['messages', '/admin/messages', 'fa-solid fa-inbox', 'admin.messages', $newMsgs],
        ['notifications', '/admin/notifications', 'fa-solid fa-bell', 'admin.notifications', 0],
    ],
    'admin.g_content' => [
        ['services', '/admin/services', 'fa-solid fa-layer-group', 'admin.services', 0],
        ['categories', '/admin/categories', 'fa-solid fa-folder-tree', 'admin.categories', 0],
        ['posts', '/admin/posts', 'fa-solid fa-newspaper', 'admin.posts', 0],
        ['post-categories', '/admin/post-categories', 'fa-solid fa-tags', 'admin.post_categories', 0],
        ['team', '/admin/team', 'fa-solid fa-user-tie', 'admin.team', 0],
        ['faqs', '/admin/faqs', 'fa-solid fa-circle-question', 'admin.faqs', 0],
        ['slides', '/admin/slides', 'fa-solid fa-images', 'admin.slider', 0],
    ],
    'admin.g_system' => [
        ['settings', '/admin/settings', 'fa-solid fa-gear', 'admin.settings', 0],
        ['payment-methods', '/admin/payment-methods', 'fa-solid fa-building-columns', 'admin.payment_methods', 0],
        ['compressor', '/admin/compressor', 'fa-solid fa-compress', 'admin.compressor', 0],
        ['ai', '/admin/ai-logs', 'fa-solid fa-robot', 'admin.ai_logs', 0],
        ['logs', '/admin/logs', 'fa-solid fa-file-lines', 'admin.logs', 0],
    ],
];
require VIEWS . '/partials/head.php';
?>
<body class="layout-admin">
<div id="progress" aria-hidden="true"></div>
<a class="skip-link" href="#main"><?= e(t('a11y.skip')) ?></a>
<header class="topbar admin-topbar" role="banner">
    <button class="icon-btn only-mobile" type="button" data-action="drawer" aria-label="<?= e(t('nav.menu')) ?>" aria-controls="sidebar" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
    <a class="brand" href="<?= e(url('/admin')) ?>">
        <?php if (setting('logo')): ?><img class="brand-logo" src="<?= e(upload_url(setting('logo'))) ?>" alt="" width="28" height="28">
        <?php else: ?><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><?php endif; ?>
        <span class="brand-name"><?= e(setting('site_name')) ?></span><span class="badge badge-primary">Admin</span>
    </a>
    <form class="admin-search only-desktop" method="get" action="<?= e(url('/admin/search')) ?>" role="search">
        <i class="fa-solid fa-magnifying-glass"></i><input name="q" placeholder="<?= e(t('admin.search_ph')) ?>" aria-label="<?= e(t('admin.search')) ?>">
    </form>
    <div class="topbar-actions">
        <a class="icon-btn only-mobile" href="<?= e(url('/admin/search')) ?>" aria-label="<?= e(t('admin.search')) ?>"><i class="fa-solid fa-magnifying-glass"></i></a>
        <a class="icon-btn" href="<?= e(url('/')) ?>" data-no-spa target="_blank" rel="noopener" aria-label="<?= e(t('admin.view_site')) ?>" title="<?= e(t('admin.view_site')) ?>"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        <button class="icon-btn" type="button" data-action="theme" aria-label="<?= e(t('nav.theme')) ?>"><i class="fa-solid fa-moon theme-ic-dark"></i><i class="fa-solid fa-sun theme-ic-light"></i></button>
        <button class="icon-btn lang-btn" type="button" data-action="lang" data-lang="<?= lang() === 'bn' ? 'en' : 'bn' ?>" aria-label="<?= e(t('nav.language')) ?>"><?= lang() === 'bn' ? 'EN' : 'বাং' ?></button>
        <button class="icon-btn notif-btn" type="button" data-action="notifications" aria-label="<?= e(t('nav.notifications')) ?>"><i class="fa-solid fa-bell"></i><span class="dot-badge" data-notif-count hidden></span></button>
        <a class="only-desktop topbar-user" href="<?= e(url('/profile')) ?>" data-no-spa><?= avatar_html($user, 'avatar-sm') ?></a>
    </div>
    <div class="notif-panel card" id="notif-panel" hidden role="dialog" aria-label="<?= e(t('nav.notifications')) ?>">
        <div class="notif-head"><strong><?= e(t('nav.notifications')) ?></strong><button class="link-btn" type="button" data-action="notif-read-all"><?= e(t('notif.mark_all')) ?></button></div>
        <div class="notif-list" data-notif-list></div>
        <a class="notif-foot" href="<?= e(url('/notifications')) ?>" data-no-spa><?= e(t('notif.view_all')) ?></a>
    </div>
</header>
<div class="shell">
    <aside class="sidebar" id="sidebar" aria-label="Admin">
        <div class="sidebar-inner">
            <a class="side-user" href="<?= e(url('/profile')) ?>" data-no-spa><?= avatar_html($user) ?><span><strong><?= e($user['name']) ?></strong><small><?= e(t('admin.administrator')) ?></small></span></a>
            <?php foreach ($groups as $label => $links): ?>
                <nav class="side-nav" aria-label="<?= e(t($label)) ?>">
                    <span class="side-label"><?= e(t($label)) ?></span>
                    <?php foreach ($links as [$key, $href, $icon, $lbl, $count]): ?>
                        <a href="<?= e(url($href)) ?>" data-nav="<?= $key ?>"><i class="<?= $icon ?>"></i><span><?= e(t($lbl)) ?></span><?php if ($count): ?><span class="side-count"><?= num($count) ?></span><?php endif; ?></a>
                    <?php endforeach; ?>
                </nav>
            <?php endforeach; ?>
            <div class="side-extra">
                <a class="side-link" href="<?= e(url('/')) ?>" data-no-spa><i class="fa-solid fa-globe"></i><span><?= e(t('admin.view_site')) ?></span></a>
                <form method="post" action="<?= e(url('/logout')) ?>" data-ajax data-full-reload data-confirm="<?= e(t('auth.logout_confirm')) ?>"><?= csrf_field() ?><button class="side-link text-danger" type="submit"><i class="fa-solid fa-right-from-bracket"></i><span><?= e(t('auth.logout')) ?></span></button></form>
            </div>
        </div>
    </aside>
    <div class="drawer-backdrop" data-action="drawer-close" hidden></div>
    <div class="shell-main">
        <main id="main" class="main admin-main" tabindex="-1">
            <?php if ($m = Session::flash('success')): ?><div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> <?= e($m) ?></div><?php endif; ?>
            <?php if ($m = Session::flash('error')): ?><div class="alert alert-danger"><i class="fa-solid fa-circle-exclamation"></i> <?= e($m) ?></div><?php endif; ?>
            <?= $content ?>
        </main>
    </div>
</div>
<nav class="bottom-nav" style="--bn-cols:6" aria-label="Admin">
    <?php foreach ([['dashboard', '/admin', 'fa-solid fa-gauge-high', 'admin.dashboard_s'], ['users', '/admin/users', 'fa-solid fa-users', 'admin.users'], ['payments', '/admin/payments', 'fa-solid fa-wallet', 'admin.payments'],
        ['posts', '/admin/posts', 'fa-solid fa-newspaper', 'admin.posts'], ['services', '/admin/services', 'fa-solid fa-layer-group', 'admin.services'], ['settings', '/admin/settings', 'fa-solid fa-gear', 'admin.settings']] as [$key, $href, $icon, $lbl]): ?>
        <a href="<?= e(url($href)) ?>" data-nav="<?= $key ?>"><i class="<?= $icon ?>"></i><span><?= e(t($lbl)) ?></span></a>
    <?php endforeach; ?>
</nav>
<?php require VIEWS . '/partials/boot.php'; ?>
</body>
</html>
