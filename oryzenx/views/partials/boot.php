<?php
/** @var ?array $user @var array $page */
$boot = [
    'base' => base_path(),
    'lang' => lang(),
    'layout' => $page['layout'],
    'nav' => $page['nav'],
    'cache' => $page['cache'],
    'user' => $user ? ['id' => (int)$user['id'], 'name' => $user['name']] : null,
    'strings' => Lang::js(),
    'sound' => setting('notify_sound') === '1',
    'push' => setting('push_enabled') === '1' && setting('vapid_public') !== '' ? setting('vapid_public') : null,
    'ai' => ['greet' => setting('ai_greeting') === '1', 'sound' => setting('ai_sound') === '1'],
    'pwa' => ['enabled' => setting('pwa_enabled') === '1', 'prompt' => setting('pwa_install_prompt') === '1', 'version' => setting('pwa_version')],
    'recaptcha' => Recaptcha::enabled() ? setting('recaptcha_site_key') : null,
    'js' => array_map(fn($j) => asset("js/$j.js"), $page['js']),
];
?>
<div class="toast-stack" id="toasts" aria-live="polite"></div>
<div class="modal-root" id="modal-root"></div>
<div class="search-overlay" id="search-overlay" hidden role="dialog" aria-modal="true" aria-label="<?= e(t('search.title')) ?>">
    <div class="search-box card">
        <div class="search-input-row">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="search" id="global-search" placeholder="<?= e(t('search.placeholder')) ?>" autocomplete="off" aria-label="<?= e(t('search.title')) ?>">
            <button class="icon-btn icon-btn-sm" type="button" data-action="search-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="search-results" id="search-results"></div>
    </div>
</div>
<div class="install-card card" id="install-card" hidden role="dialog" aria-label="<?= e(t('pwa.install')) ?>">
    <img src="<?= e(url('/icon-192.png')) ?>" alt="" width="40" height="40">
    <div><strong><?= e(t('pwa.install_title')) ?></strong><p class="muted small"><?= e(t('pwa.install_text')) ?></p>
        <div class="row-gap"><button class="btn btn-sm btn-primary" type="button" data-action="install"><?= e(t('pwa.install')) ?></button>
            <button class="btn btn-sm btn-ghost" type="button" data-action="install-later"><?= e(t('pwa.later')) ?></button></div></div>
    <button class="icon-btn icon-btn-sm install-x" type="button" data-action="install-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
</div>
<script>window.OZX = <?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
<?php foreach ($boot['js'] as $js): ?><script src="<?= e($js) ?>" defer></script><?php endforeach; ?>
