<?php
/** Mobile bottom navigation (hidden on desktop where the sidebar takes over). */
defined('APP') || exit;
$items = [
    ['home', '/', 'fa-house', t('nav.home')],
    ['services', '/services', 'fa-layer-group', t('nav.services')],
    ['news', '/news', 'fa-newspaper', t('nav.news')],
    ['payment', '/payment', 'fa-receipt', t('nav.orders')],
    ['profile', user() ? '/profile' : '/login', 'fa-user', t('nav.profile')],
];
?>
<nav class="bottom-nav" aria-label="<?= e(t('nav.main')) ?>">
  <?php foreach ($items as [$key, $href, $icon, $label]): ?>
    <a class="bn-item" href="<?= e(url($href)) ?>" data-nav-link="<?= $key ?>"><i class="fa-solid <?= $icon ?>"></i><span><?= e($label) ?></span></a>
  <?php endforeach ?>
</nav>
