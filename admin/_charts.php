<?php
/**
 * Tiny server-rendered SVG charts (no JS library).
 * Single series → brand primary, no legend; thin rounded bars anchored to
 * the baseline with a surface gap; every bar has a hover tooltip (<title>)
 * and the values are also available as text for screen readers.
 */
defined('APP') || exit;

/** Vertical bar chart. $data = [[label, value], ...] */
function chart_bars(array $data, string $name): string
{
    $w = 640; $h = 200; $padL = 34; $padB = 24; $padT = 10;
    $max = max(1, ...array_map(fn($d) => (int)$d[1], $data ?: [[0, 1]]));
    $nice = (int)(10 ** floor(log10($max)));
    $top = (int)(ceil($max / $nice) * $nice);
    $n = max(1, count($data));
    $slot = ($w - $padL) / $n;
    $bw = max(4, min(28, $slot - 6));
    $svg = '<svg class="chart" viewBox="0 0 ' . $w . ' ' . $h . '" role="img" aria-label="' . e($name) . '">';
    foreach ([0, .5, 1] as $g) {
        $y = $padT + ($h - $padT - $padB) * (1 - $g);
        $svg .= '<line x1="' . $padL . '" x2="' . $w . '" y1="' . $y . '" y2="' . $y . '" stroke="var(--border)" stroke-width="1"/>'
            . '<text x="' . ($padL - 6) . '" y="' . ($y + 4) . '" text-anchor="end" font-size="10" fill="var(--muted)">' . number_format($top * $g) . '</text>';
    }
    $desc = [];
    foreach ($data as $i => [$label, $v]) {
        $bh = ($h - $padT - $padB) * ((int)$v / $top);
        $x = $padL + $i * $slot + ($slot - $bw) / 2;
        $y = $h - $padB - $bh;
        $r = min(4, $bw / 2, $bh / 2);
        // rounded top, square baseline
        $path = $bh > 0 ? 'M' . round($x, 1) . ',' . ($h - $padB) . 'V' . round($y + $r, 1) . 'Q' . round($x, 1) . ',' . round($y, 1) . ' ' . round($x + $r, 1) . ',' . round($y, 1)
            . 'H' . round($x + $bw - $r, 1) . 'Q' . round($x + $bw, 1) . ',' . round($y, 1) . ' ' . round($x + $bw, 1) . ',' . round($y + $r, 1) . 'V' . ($h - $padB) . 'Z' : '';
        $svg .= '<g><rect x="' . round($x - 3, 1) . '" y="' . $padT . '" width="' . round($bw + 6, 1) . '" height="' . ($h - $padT - $padB) . '" fill="transparent"><title>' . e($label . ': ' . number_format((int)$v)) . '</title></rect>'
            . ($path ? '<path d="' . $path . '" fill="var(--primary)" pointer-events="none"/>' : '') . '</g>';
        if ($n <= 16 && ($i % 2 === 0 || $n <= 8)) $svg .= '<text x="' . round($x + $bw / 2, 1) . '" y="' . ($h - 8) . '" text-anchor="middle" font-size="10" fill="var(--muted)">' . e($label) . '</text>';
        $desc[] = $label . ' ' . (int)$v;
    }
    return $svg . '</svg><p class="sr-only">' . e($name . ': ' . implode(', ', $desc)) . '</p>';
}

/** Horizontal labelled bars for "top N" lists. $data = [[label, value, extra?], ...] */
function chart_hbars(array $data, string $empty = 'No data yet'): string
{
    if (!$data) return '<p class="muted small">' . e($empty) . '</p>';
    $max = max(1, ...array_map(fn($d) => (int)$d[1], $data));
    $h = '<div class="bars">';
    foreach ($data as $d) {
        $pct = round((int)$d[1] / $max * 100, 1);
        $h .= '<div class="bar-row" title="' . e($d[0] . ': ' . number_format((int)$d[1])) . '"><span class="truncate">' . ($d[2] ?? '') . e($d[0]) . '</span>'
            . '<span class="track"><span class="fill" style="display:block;width:' . $pct . '%"></span></span><b class="small">' . number_format((int)$d[1]) . '</b></div>';
    }
    return $h . '</div>';
}
