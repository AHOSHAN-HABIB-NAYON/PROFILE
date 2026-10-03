<nav class="bottom-nav" aria-label="<?= e(t('nav.primary')) ?>">
    <?php foreach ([
        ['home', '/', 'fa-solid fa-house', t('nav.home')],
        ['services', '/services', 'fa-solid fa-layer-group', t('nav.services')],
        ['news', '/news', 'fa-solid fa-newspaper', t('nav.news')],
        ['payment', '/payment', 'fa-solid fa-wallet', t('nav.payment')],
        ['profile', '/profile', 'fa-solid fa-user', t('nav.profile')],
    ] as [$key, $href, $icon, $label]): ?>
        <a href="<?= e(url($href)) ?>" data-nav="<?= $key ?>"><i class="<?= $icon ?>"></i><span><?= e($label) ?></span></a>
    <?php endforeach; ?>
</nav>
