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
<script>window.OZX = <?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
<?php foreach ($boot['js'] as $js): ?><script src="<?= e($js) ?>" defer></script><?php endforeach; ?>
