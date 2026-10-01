<?php
/**
 * Reusable view components + inline SVG illustrations.
 * Illustrations are pure SVG/CSS (no image requests) and animate with
 * transform/opacity only.
 */
declare(strict_types=1);

/* ================================================================ brand */

function logo_svg(int $size = 34): string
{
    return '<svg class="logo-mark" width="' . $size . '" height="' . $size . '" viewBox="0 0 48 48" aria-hidden="true">'
        . '<path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" fill="none" stroke="url(#gA)" stroke-width="4" stroke-linejoin="round"/>'
        . '<path d="m19 18-6 6 6 6M29 18l6 6-6 6M26 15l-4 18" fill="none" stroke="url(#gA)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function brand(): string
{
    $name = setting('site_name', 'CodeNexa');
    if (preg_match('/^([A-Z][a-z]+)([A-Z].*)$/u', $name, $m)) {
        $name = e($m[1]) . '<span class="grad-text">' . e($m[2]) . '</span>';
    } else {
        $name = e($name);
    }
    return '<a href="' . e(url()) . '" class="brand" data-link>' . logo_svg() . '<span>' . $name . '</span></a>';
}

/** Shared SVG gradients/filters, printed once per document. */
function svg_defs(): string
{
    return <<<'SVG'
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="gA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient>
    <linearGradient id="gC" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="var(--a1)"/></linearGradient>
    <linearGradient id="gP" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e879f9"/><stop offset="1" stop-color="var(--a1)"/></linearGradient>
    <linearGradient id="gScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a4a"/><stop offset="1" stop-color="#070b24"/></linearGradient>
    <linearGradient id="gFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a2)" stop-opacity=".55"/><stop offset="1" stop-color="var(--a1)" stop-opacity="0"/></linearGradient>
    <radialGradient id="gGlow"><stop offset="0" stop-color="var(--a1)" stop-opacity=".9"/><stop offset="1" stop-color="var(--a1)" stop-opacity="0"/></radialGradient>
    <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="fBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
</svg>
SVG;
}

/* ===================================================== isometric helpers */

function p2(float $x, float $y): string
{
    return round($x, 1) . ',' . round($y, 1);
}

/** Isometric box: F = front-bottom corner, w along right-up, d along left-up, h up. */
function iso_box(float $x, float $y, float $w, float $d, float $h, string $cls = ''): string
{
    $R = [$x + $w * .866, $y - $w * .5];
    $L = [$x - $d * .866, $y - $d * .5];
    $B = [$R[0] - $d * .866, $R[1] - $d * .5];
    return '<g class="ibox ' . $cls . '">'
        . '<polygon class="f-l" points="' . p2($L[0], $L[1]) . ' ' . p2($x, $y) . ' ' . p2($x, $y - $h) . ' ' . p2($L[0], $L[1] - $h) . '"/>'
        . '<polygon class="f-r" points="' . p2($x, $y) . ' ' . p2($R[0], $R[1]) . ' ' . p2($R[0], $R[1] - $h) . ' ' . p2($x, $y - $h) . '"/>'
        . '<polygon class="f-t" points="' . p2($x, $y - $h) . ' ' . p2($R[0], $R[1] - $h) . ' ' . p2($B[0], $B[1] - $h) . ' ' . p2($L[0], $L[1] - $h) . '"/>'
        . '</g>';
}

/** Transform for drawing flat content on the right-facing (front) face starting at F. */
function face_r(float $x, float $y): string
{
    return 'matrix(.866,-.5,0,1,' . round($x, 1) . ',' . round($y, 1) . ')';
}

/** Transform for drawing on the left-facing face, starting at its far-left corner. */
function face_l(float $x, float $y): string
{
    return 'matrix(.866,.5,0,1,' . round($x, 1) . ',' . round($y, 1) . ')';
}

/** Transform for drawing on a top face from its front corner. */
function face_t(float $x, float $y): string
{
    return 'matrix(.866,-.5,-.866,-.5,' . round($x, 1) . ',' . round($y, 1) . ')';
}

function code_lines(int $n, float $x0, float $y0, float $maxW, float $gap = 12): string
{
    $widths = [.55, .8, .4, .7, .62, .9, .35, .75, .5, .68, .45, .85];
    $fills  = ['url(#gC)', '#e879f9', 'url(#gA)', '#34d399', 'url(#gC)', '#fbbf24', 'url(#gA)', '#e879f9', 'url(#gC)', '#34d399', 'url(#gA)', '#60a5fa'];
    $indent = [0, 10, 20, 20, 10, 20, 30, 20, 10, 0, 10, 0];
    $out = '';
    for ($i = 0; $i < $n; $i++) {
        $ix = $indent[$i % 12];
        $out .= '<rect class="ty" style="animation-delay:' . ($i * 0.35) . 's" x="' . ($x0 + $ix) . '" y="' . ($y0 + $i * $gap) . '" width="' . round(($maxW - $ix) * $widths[$i % 12], 1) . '" height="5" rx="2.5" fill="' . $fills[$i % 12] . '"/>';
    }
    return $out;
}

/** Isometric laptop. F = front corner of the deck. */
function iso_laptop(float $x, float $y, float $w = 160, float $d = 110, float $sh = 128): string
{
    $Lx = $x - $d * .866;
    $Ly = $y - $d * .5 - 7;
    $keys = '';
    for ($u = 18; $u <= $w - 26; $u += 12) {
        for ($v = $d * .48; $v <= $d * .86; $v += 10) {
            $keys .= '<rect x="' . $u . '" y="' . round($v, 1) . '" width="9" height="7" rx="1.5"/>';
        }
    }
    $lines = (int) floor(($sh - 30) / 12);
    return '<g class="laptop">'
        . '<ellipse cx="' . round($x - 10, 1) . '" cy="' . round($y - 40, 1) . '" rx="' . round($w * .8) . '" ry="' . round($w * .38) . '" fill="url(#gGlow)" opacity=".35" class="pulse"/>'
        . iso_box($x, $y, $w, $d, 7, 'deck')
        . '<g transform="' . face_t($x, $y - 7) . '"><g class="keys">' . $keys . '</g>'
        . '<rect class="pad" x="' . round($w * .36) . '" y="10" width="' . round($w * .28) . '" height="' . round($d * .3) . '" rx="4"/></g>'
        . iso_box($Lx, $Ly, $w, 4, $sh, 'lid')
        . '<g transform="' . face_r($Lx, $Ly) . '">'
        . '<rect x="6" y="' . (-$sh + 6) . '" width="' . ($w - 12) . '" height="' . ($sh - 12) . '" rx="4" fill="url(#gScreen)" stroke="url(#gA)" stroke-width="1.5"/>'
        . '<circle cx="14" cy="' . (-$sh + 14) . '" r="2" fill="#f87171"/><circle cx="21" cy="' . (-$sh + 14) . '" r="2" fill="#fbbf24"/><circle cx="28" cy="' . (-$sh + 14) . '" r="2" fill="#34d399"/>'
        . code_lines($lines, 16, -$sh + 24, $w - 34)
        . '<rect class="caret" x="16" y="-18" width="2" height="8" fill="#fff"/>'
        . '</g></g>';
}

function stars(int $n, int $w, int $h, int $seed = 7): string
{
    mt_srand($seed);
    $out = '<g class="stars">';
    for ($i = 0; $i < $n; $i++) {
        $out .= '<circle cx="' . mt_rand(0, $w) . '" cy="' . mt_rand(0, $h) . '" r="' . (mt_rand(6, 18) / 10) . '" style="animation-delay:-' . (mt_rand(0, 40) / 10) . 's"/>';
    }
    mt_srand();
    return $out . '</g>';
}

/* ======================================================== illustrations */

/** Hero: neon isometric laptop with floating panels, server, cloud and badges. */
function hero_art(): string
{
    $grid = '';
    for ($i = 1; $i < 10; $i++) {
        $g = $i * 23;
        $grid .= '<line x1="0" y1="' . $g . '" x2="230" y2="' . $g . '"/><line x1="' . $g . '" y1="0" x2="' . $g . '" y2="230"/>';
    }
    $bars = '';
    foreach ([34, 52, 28, 64, 46, 72] as $i => $bh) {
        $bars .= '<rect class="bar" style="animation-delay:' . ($i * .15) . 's" x="' . (10 + $i * 13) . '" y="' . (-8 - $bh) . '" width="8" height="' . $bh . '" rx="2" fill="url(#gC)"/>';
    }
    $lights = '';
    for ($i = 0; $i < 6; $i++) {
        $lights .= '<rect x="6" y="' . (-108 + $i * 17) . '" width="22" height="9" rx="2" fill="rgba(255,255,255,.07)"/><circle class="blink" style="animation-delay:' . ($i * .37) . 's" cx="11" cy="' . (-103.5 + $i * 17) . '" r="1.8" fill="' . ($i % 2 ? '#34d399' : '#22d3ee') . '"/>';
    }
    return '<svg viewBox="0 0 560 480" class="art hero-scene" role="presentation">'
        . stars(26, 560, 300, 3)
        . '<g class="px" data-depth="6">'
        . iso_box(280, 450, 230, 230, 10, 'plat')
        . '<g transform="' . face_t(280, 440) . '" class="grid-plane">' . $grid . '</g>'
        . '<path class="stream" d="M150 380 Q 110 300 140 215" /><path class="stream s2" d="M455 300 Q 500 220 470 140"/>'
        . '</g>'
        . '<g class="px" data-depth="10">'
        . iso_box(468, 300, 34, 34, 120, 'server')
        . '<g transform="' . face_r(468, 300) . '">' . $lights . '</g>'
        . '</g>'
        . '<g class="px" data-depth="14"><g class="fl1">' . iso_laptop(312, 392) . '</g></g>'
        . '<g class="px" data-depth="22"><g class="fl2">'
        . iso_box(70, 262, 92, 3, 104, 'panel')
        . '<g transform="' . face_r(70, 262) . '"><rect x="5" y="-99" width="82" height="94" rx="5" fill="url(#gScreen)" stroke="url(#gP)" stroke-width="1.4"/>'
        . '<text x="12" y="-82" font-size="9" fill="#e879f9" font-family="monospace">&lt;/&gt;</text>' . code_lines(6, 12, -72, 66, 11) . '</g>'
        . '</g></g>'
        . '<g class="px" data-depth="26"><g class="fl3">'
        . iso_box(540, 238, 3, 92, 96, 'panel')
        . '<g transform="' . face_l(540 - 92 * .866, 238 - 46) . '"><rect x="4" y="-91" width="84" height="86" rx="5" fill="url(#gScreen)" stroke="url(#gC)" stroke-width="1.4"/>' . $bars . '</g>'
        . '</g></g>'
        . '<g class="px" data-depth="30"><g class="fl2">'
        . '<circle cx="455" cy="70" r="40" fill="url(#gGlow)" opacity=".5"/>'
        . '<path d="M430 90a17 17 0 0 1 2-34 24 24 0 0 1 46 6 14 14 0 0 1-2 28Z" fill="none" stroke="url(#gC)" stroke-width="3" filter="url(#fGlow)"/>'
        . '<path d="m455 82 0-18m-8 8 8-8 8 8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>'
        . '</g></g>'
        . '<g class="px" data-depth="34"><g class="fl1">'
        . '<polygon points="62,76 92,93 92,127 62,144 32,127 32,93" fill="#0d1440" stroke="url(#gA)" stroke-width="2.5" filter="url(#fGlow)"/>'
        . '<text x="62" y="116" text-anchor="middle" font-size="17" font-weight="800" font-style="italic" fill="#fff" font-family="Poppins,sans-serif">php</text>'
        . '</g></g>'
        . '<g class="px" data-depth="28"><g class="fl3">'
        . '<rect x="250" y="28" width="56" height="56" rx="14" fill="#0d1440" stroke="url(#gP)" stroke-width="2" transform="rotate(12 278 56)" filter="url(#fGlow)"/>'
        . '<path d="M278 70s-14-8.5-14-18a8 8 0 0 1 14-5 8 8 0 0 1 14 5c0 9.5-14 18-14 18Z" fill="url(#gP)"/>'
        . '</g></g>'
        . '<g class="px" data-depth="18"><g class="fl2">'
        . '<rect x="458" y="398" width="82" height="36" rx="10" fill="#0d1440" stroke="#22c55e" stroke-width="1.6" filter="url(#fGlow)"/>'
        . '<text x="499" y="422" text-anchor="middle" font-size="17" font-weight="700" fill="#22c55e" font-family="Poppins,sans-serif">node</text>'
        . '</g></g>'
        . '<g class="px" data-depth="16"><g class="plant">'
        . '<path d="M118 418h28l-4 26h-20Z" fill="#1b2560" stroke="url(#gA)" stroke-width="1.2"/>'
        . '<path d="M132 418c-2-18-14-26-24-28 4 12 10 22 24 28Zm0 0c2-20 12-30 24-32-3 14-10 25-24 32Zm0 0c0-14 0-24 0-34" fill="#34d399" stroke="#10b981" stroke-width="1.2"/>'
        . '</g></g>'
        . '</svg>';
}

/** "Why choose us": servers, laptop, cloud lock and shield on a platform. */
function why_art(): string
{
    $grid = '';
    for ($i = 1; $i < 8; $i++) {
        $g = $i * 25;
        $grid .= '<line x1="0" y1="' . $g . '" x2="200" y2="' . $g . '"/><line x1="' . $g . '" y1="0" x2="' . $g . '" y2="200"/>';
    }
    $rack = function (float $x, float $y, float $h) {
        $l = '';
        for ($i = 0; $i < (int) ($h / 18); $i++) {
            $l .= '<rect x="5" y="' . (-$h + 6 + $i * 18) . '" width="24" height="10" rx="2" fill="rgba(255,255,255,.07)"/><circle class="blink" style="animation-delay:' . ($i * .29) . 's" cx="10" cy="' . (-$h + 11 + $i * 18) . '" r="1.8" fill="' . ($i % 2 ? '#e879f9' : '#22d3ee') . '"/>';
        }
        return iso_box($x, $y, 34, 34, $h, 'server') . '<g transform="' . face_r($x, $y) . '">' . $l . '</g>';
    };
    return '<svg viewBox="0 0 480 420" class="art why-scene" role="presentation">'
        . stars(18, 480, 220, 11)
        . '<g class="px" data-depth="6">' . iso_box(240, 400, 200, 200, 10, 'plat')
        . '<g transform="' . face_t(240, 390) . '" class="grid-plane">' . $grid . '</g></g>'
        . '<g class="px" data-depth="10">' . $rack(150, 275, 110) . $rack(190, 252, 140) . '</g>'
        . '<g class="px" data-depth="14"><g class="fl1">' . iso_laptop(285, 360, 130, 90, 100) . '</g></g>'
        . '<path class="stream" d="M205 120 Q 260 60 330 70"/>'
        . '<g class="px" data-depth="24"><g class="fl2">'
        . '<circle cx="360" cy="78" r="46" fill="url(#gGlow)" opacity=".45"/>'
        . '<path d="M330 102a19 19 0 0 1 2-38 27 27 0 0 1 52 7 16 16 0 0 1-2 31Z" fill="#0d1440" stroke="url(#gC)" stroke-width="3" filter="url(#fGlow)"/>'
        . '<rect x="349" y="76" width="20" height="16" rx="3" fill="url(#gA)"/><path d="M353 76v-5a6 6 0 0 1 12 0v5" fill="none" stroke="#fff" stroke-width="2.5"/>'
        . '</g></g>'
        . '<g class="px" data-depth="30"><g class="fl3">'
        . '<path d="M420 180l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36v-20Z" fill="#0d1440" stroke="url(#gP)" stroke-width="2.5" filter="url(#fGlow)"/>'
        . '<path d="m409 210 8 8 15-16" fill="none" stroke="#34d399" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'
        . '</g></g>'
        . '<g class="px" data-depth="20"><g class="fl2">'
        . '<rect x="40" y="150" width="70" height="46" rx="10" fill="#0d1440" stroke="url(#gA)" stroke-width="1.6" filter="url(#fGlow)"/>'
        . '<path d="M52 184l12-12 10 8 14-16 12 10" fill="none" stroke="url(#gC)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
        . '</g></g>'
        . '</svg>';
}

/** About: developer workspace (front view) with two monitors. */
function workspace_art(bool $play = false, string $video = ''): string
{
    $chart = '';
    foreach ([30, 46, 26, 58, 40, 66, 52] as $i => $h) {
        $chart .= '<rect class="bar" style="animation-delay:' . ($i * .12) . 's" x="' . (318 + $i * 16) . '" y="' . (178 - $h) . '" width="10" height="' . $h . '" rx="2" fill="url(#gC)"/>';
    }
    $svg = '<svg viewBox="0 0 520 300" class="art work-scene" role="presentation">'
        . '<rect width="520" height="300" fill="#0a0f2c"/>'
        . '<circle cx="420" cy="60" r="140" fill="url(#gGlow)" opacity=".25"/>'
        . '<circle cx="90" cy="320" r="120" fill="url(#gGlow)" opacity=".18"/>'
        . '<rect x="30" y="30" width="120" height="150" rx="6" fill="#121a48" stroke="rgba(255,255,255,.08)"/><path d="M90 30v150M30 105h120" stroke="rgba(255,255,255,.08)"/>'
        . '<g class="fl1"><rect x="60" y="72" width="236" height="150" rx="10" fill="#141c4f" stroke="url(#gA)" stroke-width="2"/>'
        . '<rect x="70" y="82" width="216" height="130" rx="6" fill="url(#gScreen)"/>'
        . '<g transform="translate(0,0)">' . code_lines(9, 84, 96, 180, 12.5) . '</g>'
        . '<path d="M168 222h20l6 26h-32Z" fill="#1b2560"/></g>'
        . '<g class="fl2"><rect x="304" y="92" width="170" height="112" rx="10" fill="#141c4f" stroke="url(#gC)" stroke-width="2"/>'
        . '<rect x="312" y="100" width="154" height="96" rx="6" fill="url(#gScreen)"/>' . $chart
        . '<path d="M318 140 l20 -10 18 6 20 -18 22 8 22 -20 22 4" fill="none" stroke="#e879f9" stroke-width="2" stroke-linecap="round"/>'
        . '<path d="M380 204h18l5 44h-28Z" fill="#1b2560"/></g>'
        . '<rect x="0" y="248" width="520" height="14" fill="#1b2560"/><rect x="0" y="262" width="520" height="38" fill="#0d1338"/>'
        . '<rect x="140" y="236" width="150" height="12" rx="4" fill="#26307a"/>'
        . '<g transform="translate(330 214)"><rect x="0" y="0" width="34" height="34" rx="6" fill="url(#gA)"/><path d="M34 8a9 9 0 0 1 0 18" fill="none" stroke="url(#gA)" stroke-width="4"/>'
        . '<path class="steam" d="M10 -6c-4-6 4-8 0-14M22 -6c-4-6 4-8 0-14" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round"/></g>'
        . '<g class="plant" transform="translate(440 182)"><path d="M10 40h28l-4 26H14Z" fill="#26307a"/><path d="M24 40c-2-18-14-26-24-28 4 12 10 22 24 28Zm0 0c2-20 12-30 24-32-3 14-10 25-24 32Z" fill="#34d399"/></g>'
        . '</svg>';
    if ($play) {
        $btn = $video !== ''
            ? '<button type="button" class="play-big" data-video="' . e($video) . '" aria-label="' . e(t('hero.video')) . '"><i class="fa-solid fa-play"></i></button>'
            : '';
        return '<div class="work-wrap">' . $svg . $btn . '</div>';
    }
    return $svg;
}

/** Contact: neon envelope with paper plane trail. */
function mail_art(): string
{
    return '<svg viewBox="0 0 300 220" class="art mail-scene" role="presentation">'
        . stars(14, 300, 220, 5)
        . '<path class="trail" d="M30 190 C 80 150, 60 110, 120 120 S 190 120, 200 90" fill="none" stroke="url(#gC)" stroke-width="2" stroke-dasharray="6 7"/>'
        . '<g class="fl1"><g transform="rotate(-14 200 80)">'
        . '<rect x="150" y="40" width="120" height="82" rx="10" fill="#0d1440" stroke="url(#gA)" stroke-width="3" filter="url(#fGlow)"/>'
        . '<path d="M154 46l56 42 56-42" fill="none" stroke="url(#gC)" stroke-width="3" stroke-linejoin="round"/>'
        . '<path d="M154 118l40-34M266 118l-40-34" stroke="url(#gA)" stroke-width="2"/></g></g>'
        . '<g class="plane"><path d="M30 190l34-8-10 12Z" fill="url(#gP)"/></g>'
        . '</svg>';
}

/* ============================================================ sections */

function section_head(string $eyebrow, string $title, string $sub = '', string $linkText = '', string $link = '', bool $center = false): void
{
    ?>
    <div class="sec-head<?= $center ? ' center' : '' ?>">
        <div>
            <span class="eyebrow reveal"><?= e($eyebrow) ?></span>
            <h2 class="reveal" style="--d:60ms"><?= e($title) ?></h2>
            <?php if ($sub): ?><p class="muted reveal" style="--d:120ms"><?= e($sub) ?></p><?php endif; ?>
        </div>
        <?php if ($linkText): ?>
            <a href="<?= e($link) ?>" class="link-arrow reveal" data-link><?= e($linkText) ?> <i class="fa-solid fa-arrow-right"></i></a>
        <?php endif; ?>
    </div>
    <?php
}

/** Dark page header used at the top of every inner page. */
function page_hero(string $eyebrow, string $title, string $sub = '', array $crumbs = []): void
{
    ?>
    <section class="band-dark top-band page-hero">
        <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="grid-lines"></span><?= '<svg class="star-field" viewBox="0 0 1200 300" preserveAspectRatio="none">' . stars(40, 1200, 300, 21) . '</svg>' ?></div>
        <div class="container">
            <nav class="crumbs reveal" aria-label="Breadcrumb">
                <a href="<?= e(url()) ?>" data-link><i class="fa-solid fa-house"></i> <?= e(t('nav.home')) ?></a>
                <?php foreach ($crumbs as $c): ?>
                    <i class="fa-solid fa-chevron-right sep"></i>
                    <?php if (!empty($c[1])): ?><a href="<?= e($c[1]) ?>" data-link><?= e($c[0]) ?></a><?php else: ?><span><?= e($c[0]) ?></span><?php endif; ?>
                <?php endforeach; ?>
            </nav>
            <span class="eyebrow reveal" style="--d:40ms"><?= e($eyebrow) ?></span>
            <h1 class="reveal" style="--d:80ms"><?= e($title) ?></h1>
            <?php if ($sub): ?><p class="lead reveal" style="--d:140ms"><?= e($sub) ?></p><?php endif; ?>
        </div>
    </section>
    <?php
}

function services_grid(array $services, bool $list = false): void
{
    ?>
    <div class="grid services-grid<?= $list ? ' as-list' : '' ?>"<?= $list ? ' data-search-list' : '' ?>>
        <?php foreach ($services as $i => $s): ?>
            <a href="<?= e(url('service', ['slug' => $s['slug']])) ?>" class="card service-card reveal" data-link data-tilt
               style="--c:<?= e($s['color']) ?>;--d:<?= ($i % 4) * 70 ?>ms" data-search="<?= e(mb_strtolower($s['title'] . ' ' . $s['summary'])) ?>">
                <span class="icon-tile"><i class="<?= e($s['icon']) ?>"></i></span>
                <span class="sc-text">
                    <h3><?= e($s['title']) ?></h3>
                    <p class="muted"><?= e($s['summary']) ?></p>
                </span>
                <span class="card-arrow"><i class="fa-solid fa-chevron-right"></i></span>
                <span class="card-glow" aria-hidden="true"></span>
            </a>
        <?php endforeach; ?>
    </div>
    <?php if ($list): ?>
        <p class="empty muted" hidden><?= e(t('services.empty')) ?></p>
    <?php endif;
}

/** Rich UI mock-up thumbnails for portfolio cards. */
function mock_thumb(string $color, string $category, int $variant): string
{
    $v = $variant % 3;
    $h = '<div class="mock mock-' . e($category) . ' v' . $v . '" style="--c:' . e($color) . '" aria-hidden="true">';
    if ($category === 'app') {
        for ($i = 0; $i < 3; $i++) {
            $h .= '<div class="phone"><span class="notch"></span>';
            if (($i + $v) % 3 === 0) {
                $h .= '<span class="ring"></span><b></b><b class="s"></b><span class="tile"></span>';
            } elseif (($i + $v) % 3 === 1) {
                $h .= '<b></b><span class="mini-bars"><i></i><i></i><i></i><i></i><i></i></span><span class="tile"></span><span class="tile"></span>';
            } else {
                $h .= '<span class="tile big"></span><b></b><b class="s"></b><span class="tile"></span>';
            }
            $h .= '</div>';
        }
    } elseif ($category === 'uiux') {
        $h .= '<div class="win dash"><div class="bar"><i></i><i></i><i></i></div><div class="dash-body"><div class="side"><i></i><i></i><i></i><i></i></div>'
            . '<div class="dmain"><div class="kpis"><span></span><span></span><span></span></div><div class="chart-area"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0 34 L15 26 L30 30 L45 16 L60 22 L75 8 L100 14 L100 40 L0 40Z" fill="currentColor" opacity=".25"/><path d="M0 34 L15 26 L30 30 L45 16 L60 22 L75 8 L100 14" fill="none" stroke="currentColor" stroke-width="2"/></svg></div></div></div></div>';
    } elseif ($v !== 1) {
        $h .= '<div class="win shop"><div class="bar"><i></i><i></i><i></i><em></em></div><div class="nav-l"><b></b><span></span><span></span><span></span></div>'
            . '<div class="prods">' . str_repeat('<span><i></i></span>', 8) . '</div></div>';
    } else {
        $h .= '<div class="win land"><div class="bar"><i></i><i></i><i></i><em></em></div><div class="nav-l"><b></b><span></span><span></span><span></span></div>'
            . '<div class="land-hero"><div><b></b><b class="s"></b><span class="cta"></span></div><span class="orb"></span></div><div class="row3"><span></span><span></span><span></span></div></div>';
    }
    return $h . '</div>';
}

function portfolio_grid(array $projects, bool $filters = true): void
{
    if ($filters): ?>
        <div class="chips reveal" role="tablist" data-filter>
            <?php foreach (['all', 'web', 'app', 'uiux'] as $i => $f): ?>
                <button type="button" class="chip<?= $i === 0 ? ' active' : '' ?>" data-f="<?= $f ?>"><?= e(t('portfolio.' . $f)) ?></button>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
    <div class="grid portfolio-grid">
        <?php foreach ($projects as $i => $p): ?>
            <article class="card project-card reveal r-zoom" data-cat="<?= e($p['category']) ?>" style="--d:<?= ($i % 3) * 80 ?>ms" data-tilt>
                <div class="thumb">
                    <?= mock_thumb($p['color'], $p['category'], $i) ?>
                    <div class="thumb-over">
                        <?php if ($p['link']): ?>
                            <a href="<?= e($p['link']) ?>" target="_blank" rel="noopener" class="round-btn" aria-label="<?= e($p['title']) ?>"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                        <?php else: ?>
                            <span class="round-btn"><i class="fa-solid fa-eye"></i></span>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="project-body">
                    <h3><?= e($p['title']) ?></h3>
                    <span class="muted small"><?= e($p['label']) ?></span>
                </div>
            </article>
        <?php endforeach; ?>
    </div>
    <?php
}

function stats_strip(bool $overlap = false): void
{
    $stats = [
        ['stat_clients', '+', 'stat.clients', 'fa-solid fa-users', '#6366f1'],
        ['stat_projects', '+', 'stat.projects', 'fa-solid fa-briefcase', '#f97316'],
        ['stat_years', '+', 'stat.years', 'fa-solid fa-star', '#eab308'],
        ['stat_satisfaction', '%', 'stat.satisfaction', 'fa-solid fa-shield-halved', '#10b981'],
    ];
    ?>
    <div class="stats<?= $overlap ? ' overlap' : '' ?>">
        <?php foreach ($stats as $i => $s): ?>
            <div class="stat card reveal" style="--d:<?= $i * 80 ?>ms;--c:<?= $s[4] ?>">
                <span class="stat-icon"><i class="<?= $s[3] ?>"></i></span>
                <div>
                    <strong><span data-count="<?= (int) setting($s[0], '0') ?>">0</span><?= $s[1] ?></strong>
                    <small class="muted"><?= e(t($s[2])) ?></small>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
}

function why_section(): void
{
    $items = [
        ['fa-solid fa-user-group', 'why.team'],
        ['fa-solid fa-hand-holding-dollar', 'why.price'],
        ['fa-solid fa-truck-fast', 'why.time'],
        ['fa-solid fa-headset', 'why.support'],
    ];
    ?>
    <section class="section band-dark why">
        <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><span class="grid-lines"></span></div>
        <div class="container why-wrap">
            <div>
                <h2 class="reveal"><?= e(t('why.title', ['site' => setting('site_name', 'CodeNexa')])) ?></h2>
                <p class="muted reveal" style="--d:60ms"><?= e(t('why.text')) ?></p>
                <ul class="why-list">
                    <?php foreach ($items as $i => $it): ?>
                        <li class="reveal r-left" style="--d:<?= 100 + $i * 90 ?>ms">
                            <span class="icon-round"><i class="<?= $it[0] ?>"></i></span>
                            <div><strong><?= e(t($it[1])) ?></strong><span class="muted"><?= e(t($it[1] . '_t')) ?></span></div>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <div class="why-art reveal r-zoom" data-parallax><?= why_art() ?></div>
        </div>
    </section>
    <?php
}

function pricing_section(array $plans): void
{
    if (!$plans) {
        return;
    }
    ?>
    <section class="section" id="pricing">
        <div class="container">
            <?php section_head(t('pricing.eyebrow'), t('pricing.title'), t('pricing.text'), '', '', true); ?>
            <div class="billing reveal" data-billing>
                <button type="button" class="active" data-b="monthly"><?= e(t('pricing.monthly')) ?></button>
                <button type="button" data-b="yearly"><?= e(t('pricing.yearly')) ?> <em><?= e(t('pricing.save')) ?></em></button>
                <span class="billing-pill"></span>
            </div>
            <div class="grid pricing-grid">
                <?php foreach ($plans as $i => $p): ?>
                    <div class="card plan reveal<?= $p['popular'] ? ' popular' : '' ?>" style="--d:<?= $i * 90 ?>ms" data-tilt>
                        <?php if ($p['popular']): ?><span class="badge"><i class="fa-solid fa-crown"></i> <?= e(t('pricing.popular')) ?></span><?php endif; ?>
                        <h3><?= e($p['name']) ?></h3>
                        <small class="muted"><?= e($p['tagline']) ?></small>
                        <div class="price">
                            <strong>$<span data-m="<?= (int) $p['monthly'] ?>" data-y="<?= (int) $p['yearly'] ?>"><?= (int) $p['monthly'] ?></span></strong>
                            <span class="muted per" data-m="<?= e(t('pricing.month')) ?>" data-y="<?= e(t('pricing.year')) ?>"><?= e(t('pricing.month')) ?></span>
                        </div>
                        <ul class="checks">
                            <?php foreach (lines((string) $p['features']) as $f): ?>
                                <li><i class="fa-solid fa-check"></i> <?= e($f) ?></li>
                            <?php endforeach; ?>
                        </ul>
                        <a href="<?= e(url('contact')) ?>" class="btn <?= $p['popular'] ? 'btn-primary' : 'btn-outline' ?> btn-block" data-link><?= e(t('pricing.cta')) ?></a>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
    <?php
}

function tech_marquee(): void
{
    $tech = [
        ['fa-brands fa-php', 'PHP', '#777bb4'], ['fa-solid fa-database', 'MySQL', '#00758f'], ['fa-brands fa-node-js', 'Node.js', '#3c873a'],
        ['fa-brands fa-js', 'jQuery / AJAX', '#f7df1e'], ['fa-brands fa-font-awesome', 'Font Awesome', '#538dd7'], ['fa-brands fa-bootstrap', 'Bootstrap', '#7952b3'],
        ['fa-brands fa-laravel', 'Laravel', '#ff2d20'], ['fa-brands fa-react', 'React', '#61dafb'], ['fa-brands fa-html5', 'HTML5', '#e34f26'],
        ['fa-brands fa-css3-alt', 'CSS3', '#1572b6'], ['fa-brands fa-docker', 'Docker', '#2496ed'], ['fa-brands fa-git-alt', 'Git', '#f05032'],
        ['fa-brands fa-aws', 'AWS', '#ff9900'], ['fa-brands fa-android', 'Android', '#3ddc84'], ['fa-brands fa-apple', 'iOS', '#a3aaae'],
    ];
    $row = '';
    foreach ($tech as $t) {
        $row .= '<span class="tech" style="--c:' . $t[2] . '"><i class="' . $t[0] . '"></i>' . e($t[1]) . '</span>';
    }
    ?>
    <section class="section tech-sec">
        <div class="container">
            <?php section_head(t('tech.eyebrow'), t('tech.title'), '', '', '', true); ?>
        </div>
        <div class="marquee reveal" aria-label="Technologies">
            <div class="marquee-track"><?= $row . $row ?></div>
        </div>
        <div class="marquee reverse reveal" aria-hidden="true">
            <div class="marquee-track"><?= $row . $row ?></div>
        </div>
    </section>
    <?php
}

function app_band(): void
{
    ?>
    <section class="section">
        <div class="container">
            <div class="app-wrap band-dark reveal">
                <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span></div>
                <div class="phones" data-parallax aria-hidden="true">
                    <div class="phone-frame back"><div class="phone-ui">
                        <span class="pu-top"><i></i><i></i></span>
                        <span class="ring-big"><b>78%</b></span>
                        <span class="pu-row"></span><span class="pu-row s"></span>
                    </div></div>
                    <div class="phone-frame front"><div class="phone-ui">
                        <span class="pu-top"><i></i><i></i></span>
                        <small>Total Balance</small>
                        <b class="bal">$12,450</b>
                        <span class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
                        <span class="pu-card"><i class="fa-solid fa-arrow-trend-up"></i> +12.5%</span>
                        <span class="pu-row"></span>
                    </div></div>
                </div>
                <div class="app-copy">
                    <span class="eyebrow reveal"><?= e(t('feat.app')) ?></span>
                    <h2 class="reveal"><?= e(t('app.title')) ?></h2>
                    <p class="muted reveal"><?= e(t('app.text')) ?></p>
                    <ul class="checks big">
                        <?php for ($i = 1; $i <= 4; $i++): ?>
                            <li class="reveal r-left" style="--d:<?= $i * 80 ?>ms"><i class="fa-solid fa-circle-check"></i> <?= e(t('app.f' . $i)) ?></li>
                        <?php endfor; ?>
                    </ul>
                    <div class="row gap center-y reveal">
                        <a href="<?= e(url('service', ['slug' => 'mobile-app-development'])) ?>" class="btn btn-primary btn-sm" data-link><?= e(t('hero.cta')) ?> <i class="fa-solid fa-arrow-right"></i></a>
                        <span class="platform"><i class="fa-brands fa-android"></i> Android</span>
                        <span class="platform"><i class="fa-brands fa-apple"></i> iOS</span>
                    </div>
                </div>
            </div>
        </div>
    </section>
    <?php
}

function team_grid(array $team): void
{
    ?>
    <div class="grid team-grid">
        <?php foreach ($team as $i => $m):
            $parts = preg_split('/\s+/', trim($m['name']));
            $ini = mb_strtoupper(mb_substr($parts[0], 0, 1) . (isset($parts[1]) ? mb_substr($parts[1], 0, 1) : ''));
            ?>
            <div class="card member reveal" style="--c:<?= e($m['color']) ?>;--d:<?= ($i % 4) * 80 ?>ms" data-tilt>
                <div class="avatar"><span><?= e($ini) ?></span></div>
                <h3><?= e($m['name']) ?></h3>
                <span class="muted small"><?= e($m['role']) ?></span>
                <div class="m-social"><i class="fa-brands fa-linkedin-in"></i><i class="fa-brands fa-x-twitter"></i><i class="fa-brands fa-github"></i></div>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
}

function contact_section(bool $top = false): void
{
    ?>
    <section class="section band-dark contact<?= $top ? ' top-band' : '' ?>" id="contact">
        <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="grid-lines"></span></div>
        <div class="container contact-wrap">
            <div class="contact-info">
                <?php if ($top): ?><h1 class="reveal"><?= e(t('contact.title')) ?></h1><?php else: ?><h2 class="reveal"><?= e(t('contact.title')) ?></h2><?php endif; ?>
                <p class="muted reveal" style="--d:60ms"><?= e(t('contact.text')) ?></p>
                <ul class="info-list">
                    <li class="reveal r-left" style="--d:100ms"><span class="icon-round"><i class="fa-solid fa-envelope"></i></span><div><small class="muted"><?= e(t('contact.email')) ?></small><a href="mailto:<?= e(setting('email')) ?>"><?= e(setting('email')) ?></a></div></li>
                    <li class="reveal r-left" style="--d:180ms"><span class="icon-round"><i class="fa-solid fa-phone"></i></span><div><small class="muted"><?= e(t('contact.phone')) ?></small><a href="tel:<?= e(preg_replace('/[^\d+]/', '', setting('phone'))) ?>"><?= e(setting('phone')) ?></a></div></li>
                    <li class="reveal r-left" style="--d:260ms"><span class="icon-round"><i class="fa-solid fa-location-dot"></i></span><div><small class="muted"><?= e(t('contact.location')) ?></small><span><?= e(setting('address')) ?></span></div></li>
                </ul>
                <div class="contact-art reveal" aria-hidden="true">
                    <?= mail_art() ?>
                    <p class="script"><?= e(t('contact.tagline')) ?></p>
                </div>
            </div>
            <form class="contact-form card reveal r-right" data-contact novalidate>
                <div class="hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>
                <label class="field"><input type="text" name="name" required maxlength="120" placeholder=" " autocomplete="name"><span><?= e(t('form.name')) ?> *</span><i class="fa-regular fa-user"></i></label>
                <label class="field"><input type="email" name="email" required maxlength="190" placeholder=" " autocomplete="email"><span><?= e(t('form.email')) ?> *</span><i class="fa-regular fa-envelope"></i></label>
                <label class="field"><input type="tel" name="phone" maxlength="40" placeholder=" " autocomplete="tel"><span><?= e(t('form.phone')) ?></span><i class="fa-solid fa-phone"></i></label>
                <label class="field"><textarea name="message" required maxlength="5000" rows="5" placeholder=" "></textarea><span><?= e(t('form.message')) ?> *</span><i class="fa-regular fa-message"></i></label>
                <button type="submit" class="btn btn-primary btn-block" data-sending="<?= e(t('form.sending')) ?>">
                    <span><?= e(t('form.send')) ?></span> <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    </section>
    <?php
}

function cta_band(): void
{
    ?>
    <section class="section">
        <div class="container">
            <div class="cta-band reveal r-zoom">
                <span class="cta-ring r1"></span><span class="cta-ring r2"></span>
                <div>
                    <h2><?= e(t('cta.title')) ?></h2>
                    <p><?= e(t('cta.text')) ?></p>
                </div>
                <a href="<?= e(url('contact')) ?>" class="btn btn-light" data-link><?= e(t('nav.quote')) ?> <i class="fa-solid fa-arrow-right"></i></a>
            </div>
        </div>
    </section>
    <?php
}
