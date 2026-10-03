<?php
/** Mobile bottom navigation (hidden on desktop where the sidebar takes over). */
defined('APP') || exit;
$items = [
    ['home', '/', 'fa-solid fa-house', t('nav.home')],
    ['services', '/services', 'fa-solid fa-layer-group', t('nav.services')],
    ['news', '/news', 'fa-regular fa-newspaper', t('nav.news')],
    ['payment', '/payment', 'fa-solid fa-receipt', t('nav.orders')],
    user() ? ['profile', '/profile', 'fa-regular fa-user', t('nav.profile')] : ['profile', '/login', 'fa-regular fa-user', t('auth.login')],
];
?>
<nav class="bottom-nav" aria-label="<?= e(t('nav.main')) ?>">
  <?php foreach ($items as [$key, $href, $icon, $label]): ?>
    <a class="bn-item" href="<?= e(url($href)) ?>" data-nav-link="<?= $key ?>"><i class="<?= $icon ?>"></i><span><?= e($label) ?></span></a>
  <?php endforeach ?>
</nav>
