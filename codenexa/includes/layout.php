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
$gfont = 'family=Caveat:wght@600' . ($lang === 'bn' ? '&family=Hind+Siliguri:wght@400;500;600;700' : ($lang === 'hi' ? '&family=Hind:wght@400;500;600;700' : ''));
$fontDir = base_path() . 'assets/vendor/fonts/';
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
    <meta name="theme-color" content="#070b1f">
    <meta property="og:title" content="<?= e($fullTitle) ?>">
    <meta property="og:description" content="<?= e(setting('meta_description')) ?>">
    <meta property="og:type" content="website">
    <link rel="icon" type="image/svg+xml" href="<?= e(asset('img/favicon.svg')) ?>">
    <script>
        // Before first paint: saved theme (light is default), accent, splash once per session.
        (function () {
            var d = document.documentElement; d.classList.remove('no-js');
            try {
                if (localStorage.getItem('theme') === 'dark') d.setAttribute('data-theme', 'dark');
                var a = localStorage.getItem('accent'); if (a) d.setAttribute('data-accent', a);
                if (sessionStorage.getItem('splash')) d.classList.add('no-splash'); else sessionStorage.setItem('splash', '1');
            } catch (e) { d.classList.add('no-splash'); }
        })();
    </script>
    <link rel="preload" href="<?= e($fontDir) ?>poppins-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="<?= e($fontDir) ?>poppins-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
    <style>
        <?php foreach ([400, 500, 600, 700, 800] as $w): ?>@font-face{font-family:Poppins;font-style:normal;font-weight:<?= $w ?>;font-display:swap;src:url(<?= e($fontDir) ?>poppins-latin-<?= $w ?>-normal.woff2) format("woff2")}
        <?php endforeach; ?>
    </style>
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
    <link rel="stylesheet" href="<?= e(asset('vendor/fa/css/all.min.css')) ?>" media="print" onload="this.media='all'">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?<?= $gfont ?>&display=swap" media="print" onload="this.media='all'">
    <script src="<?= e(asset('js/app.js')) ?>" defer></script>
</head>
<body class="lang-<?= e($lang) ?>" data-offline="<?= e(t('offline')) ?>">
<?= svg_defs() ?>

<div class="splash" id="splash" aria-hidden="true">
    <div class="splash-inner">
        <?= logo_svg(84) ?>
        <strong><?= e($siteName) ?></strong>
        <small><?= e(setting('tagline')) ?></small>
        <span class="splash-bar"><i></i></span>
    </div>
</div>

<div class="progress" id="progress"></div>

<header class="site-header" id="header">
    <div class="container nav-wrap">
        <?= brand() ?>
        <nav class="main-nav" aria-label="Main">
            <?php foreach ($nav as $k => $n): ?>
                <a href="<?= e($n[1]) ?>" data-link data-nav="<?= $k ?>" class="<?= $active === $k ? 'active' : '' ?>"><?= e(t('nav.' . $k)) ?></a>
            <?php endforeach; ?>
            <span class="nav-ink" aria-hidden="true"></span>
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
            <button type="button" class="icon-btn menu-btn" data-drawer-open aria-label="Menu"><i class="fa-solid fa-bars-staggered"></i></button>
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
            <?php $i = 0; foreach ($nav as $k => $n): ?>
                <a href="<?= e($n[1]) ?>" data-link data-nav="<?= $k ?>" class="<?= $active === $k ? 'active' : '' ?>" style="--i:<?= $i++ ?>"><i class="<?= $n[0] ?>"></i><?= e(t('nav.' . $k)) ?><i class="fa-solid fa-chevron-right go"></i></a>
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

<footer class="site-footer band-dark">
    <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><svg class="star-field" viewBox="0 0 1200 300" preserveAspectRatio="none"><?= stars(30, 1200, 300, 33) ?></svg></div>
    <div class="container footer-inner">
        <div class="footer-brand">
            <?= brand() ?>
            <p class="muted"><?= e(setting('tagline')) ?></p>
        </div>
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
        <small class="muted copy">&copy; <?= date('Y') ?> <?= e($siteName) ?>. <?= e(t('footer.rights')) ?></small>
    </div>
</footer>

<nav class="bottom-nav" aria-label="Mobile">
    <?php foreach ($nav as $k => $n): ?>
        <a href="<?= e($n[1]) ?>" data-link data-nav="<?= $k ?>" class="<?= $active === $k ? 'active' : '' ?>"><i class="<?= $n[0] ?>"></i><span><?= e(t('nav.' . $k)) ?></span></a>
    <?php endforeach; ?>
    <span class="bn-ink" aria-hidden="true"></span>
</nav>

<button type="button" class="to-top" id="toTop" aria-label="Back to top">
    <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" class="tt-bg"/><circle cx="22" cy="22" r="20" class="tt-ring" id="ttRing"/></svg>
    <i class="fa-solid fa-arrow-up"></i>
</button>

<div class="modal" id="videoModal" aria-hidden="true">
    <div class="modal-box"><button type="button" class="icon-btn modal-close" data-modal-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div class="video-frame"></div></div>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
</body>
</html>
