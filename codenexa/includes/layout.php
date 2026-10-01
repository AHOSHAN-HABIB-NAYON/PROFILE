<?php
/** @var array $data  @var string $fullTitle  @var string $siteName  @var string $lang */
$nav = [
    'home'      => ['fa-solid fa-house', url()],
    'services'  => ['fa-solid fa-grip', url('services')],
    'portfolio' => ['fa-solid fa-briefcase', url('portfolio')],
    'about'     => ['fa-solid fa-user', url('about')],
    'contact'   => ['fa-solid fa-envelope', url('contact')],
];
$active = $data['page'] === 'service' ? 'services' : $data['page'];
$socials = [
    'facebook' => 'fa-brands fa-facebook-f',
    'twitter'  => 'fa-brands fa-x-twitter',
    'linkedin' => 'fa-brands fa-linkedin-in',
    'youtube'  => 'fa-brands fa-youtube',
    'github'   => 'fa-brands fa-github',
];
$accents = ['indigo' => '#6366f1', 'purple' => '#a855f7', 'green' => '#10b981', 'blue' => '#2563eb'];
$fontExtra = $lang === 'bn' ? '&family=Hind+Siliguri:wght@400;500;600;700' : ($lang === 'hi' ? '&family=Hind:wght@400;500;600;700' : '');
?>
<!DOCTYPE html>
<html lang="<?= e($lang) ?>" class="no-js" data-theme="light" data-accent="indigo">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?= e($fullTitle) ?></title>
    <meta name="description" content="<?= e(setting('meta_description')) ?>">
    <meta name="csrf" content="<?= e(csrf_token()) ?>">
    <meta name="base" content="<?= e(base_path()) ?>">
    <meta name="theme-color" content="#ffffff" id="themeColor">
    <meta property="og:title" content="<?= e($fullTitle) ?>">
    <meta property="og:description" content="<?= e(setting('meta_description')) ?>">
    <meta property="og:type" content="website">
    <link rel="icon" type="image/svg+xml" href="<?= e(asset('img/favicon.svg')) ?>">
    <script>
        // Apply saved theme before first paint (no flash). Light is the default.
        (function () {
            try {
                var d = document.documentElement; d.classList.remove("no-js"); var t = localStorage.getItem('theme'), a = localStorage.getItem('accent');
                if (t === 'dark') d.setAttribute('data-theme', 'dark');
                if (a) d.setAttribute('data-accent', a);
            } catch (e) {}
        })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Caveat:wght@600<?= $fontExtra ?>&display=swap">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" media="print" onload="this.media='all'">
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
    <script src="<?= e(asset('js/app.js')) ?>" defer></script>
</head>
<body class="lang-<?= e($lang) ?>" data-offline="<?= e(t('offline')) ?>">
<div class="progress" id="progress"></div>

<header class="site-header" id="header">
    <div class="container nav-wrap">
        <?= brand() ?>
        <nav class="main-nav" aria-label="Main">
            <?php foreach ($nav as $k => $n): ?>
                <a href="<?= e($n[1]) ?>" data-link data-nav="<?= $k ?>" class="<?= $active === $k ? 'active' : '' ?>"><?= e(t('nav.' . $k)) ?></a>
            <?php endforeach; ?>
        </nav>
        <div class="nav-actions">
            <div class="lang-pick">
                <button type="button" class="icon-btn" aria-label="<?= e(t('nav.language')) ?>" data-toggle="lang-menu"><i class="fa-solid fa-globe"></i><span class="lang-code"><?= strtoupper(e($lang)) ?></span></button>
                <div class="dropdown" id="lang-menu">
                    <?php foreach (LANGS as $code => $label): ?>
                        <button type="button" data-lang="<?= $code ?>" class="<?= $code === $lang ? 'active' : '' ?>"><?= e($label) ?></button>
                    <?php endforeach; ?>
                </div>
            </div>
            <button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-label="<?= e(t('nav.darkmode')) ?>">
                <i class="fa-solid fa-moon"></i><i class="fa-solid fa-sun"></i>
            </button>
            <a href="<?= e(url('contact')) ?>" class="btn btn-primary btn-sm hide-sm" data-link><?= e(t('nav.quote')) ?></a>
            <button type="button" class="icon-btn menu-btn" data-drawer-open aria-label="Menu"><i class="fa-solid fa-bars"></i></button>
        </div>
    </div>
</header>

<aside class="drawer" id="drawer" aria-hidden="true">
    <div class="drawer-panel">
        <div class="drawer-head">
            <?= brand() ?>
            <button type="button" class="icon-btn" data-drawer-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <nav class="drawer-nav">
            <?php foreach ($nav as $k => $n): ?>
                <a href="<?= e($n[1]) ?>" data-link data-nav="<?= $k ?>" class="<?= $active === $k ? 'active' : '' ?>"><i class="<?= $n[0] ?>"></i><?= e(t('nav.' . $k)) ?></a>
            <?php endforeach; ?>
        </nav>
        <div class="drawer-block">
            <span class="drawer-label"><i class="fa-solid fa-globe"></i> <?= e(t('nav.language')) ?></span>
            <div class="seg">
                <?php foreach (LANGS as $code => $label): ?>
                    <button type="button" data-lang="<?= $code ?>" class="<?= $code === $lang ? 'active' : '' ?>"><?= strtoupper($code) ?></button>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="drawer-block row-between">
            <span class="drawer-label"><i class="fa-solid fa-moon"></i> <?= e(t('nav.darkmode')) ?></span>
            <button type="button" class="switch" data-theme-toggle role="switch" aria-label="<?= e(t('nav.darkmode')) ?>"><span></span></button>
        </div>
        <div class="drawer-block">
            <span class="drawer-label"><i class="fa-solid fa-palette"></i> <?= e(t('nav.color')) ?></span>
            <div class="swatches">
                <?php foreach ($accents as $name => $hex): ?>
                    <button type="button" data-accent="<?= $name ?>" style="--sw:<?= $hex ?>" aria-label="<?= ucfirst($name) ?>"></button>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="drawer-foot">
            <small class="muted">&copy; <?= date('Y') ?> <?= e($siteName) ?>.<br><?= e(t('footer.rights')) ?></small>
            <div class="socials">
                <?php foreach ($socials as $k => $icon): if (setting($k) === '') continue; ?>
                    <a href="<?= e(setting($k)) ?>" target="_blank" rel="noopener" aria-label="<?= ucfirst($k) ?>"><i class="<?= $icon ?>"></i></a>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
</aside>

<main id="app" data-page="<?= e($data['page']) ?>">
<?= $data['html'] ?>
</main>

<footer class="site-footer">
    <div class="container footer-inner">
        <?= brand() ?>
        <p class="muted"><?= e(setting('tagline')) ?></p>
        <div class="socials">
            <?php foreach ($socials as $k => $icon): if (setting($k) === '') continue; ?>
                <a href="<?= e(setting($k)) ?>" target="_blank" rel="noopener" aria-label="<?= ucfirst($k) ?>"><i class="<?= $icon ?>"></i></a>
            <?php endforeach; ?>
        </div>
        <nav class="footer-nav">
            <?php foreach ($nav as $k => $n): ?>
                <a href="<?= e($n[1]) ?>" data-link><?= e(t('nav.' . $k)) ?></a>
            <?php endforeach; ?>
        </nav>
        <small class="muted">&copy; <?= date('Y') ?> <?= e($siteName) ?>. <?= e(t('footer.rights')) ?></small>
    </div>
</footer>

<nav class="bottom-nav" aria-label="Mobile">
    <?php foreach ($nav as $k => $n): ?>
        <a href="<?= e($n[1]) ?>" data-link data-nav="<?= $k ?>" class="<?= $active === $k ? 'active' : '' ?>"><i class="<?= $n[0] ?>"></i><span><?= e(t('nav.' . $k)) ?></span></a>
    <?php endforeach; ?>
</nav>

<div class="modal" id="videoModal" aria-hidden="true">
    <div class="modal-box"><button type="button" class="icon-btn modal-close" data-modal-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div class="video-frame"></div></div>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
</body>
</html>
