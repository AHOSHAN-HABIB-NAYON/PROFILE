<?php
/**
 * Reusable UI fragments shared by several pages.
 */
declare(strict_types=1);

function tx_item(array $t): string
{
    $credit = $t['direction'] === 'credit';
    $sign = $credit ? '+' : '−';
    return '<a href="' . e(url('/transaction/' . $t['uid'])) . '" class="list-item" data-link>'
        . '<span class="tx-ic ' . ($credit ? 'credit' : 'debit') . '">' . icon(tx_type_icon($t['type'], $t['direction'])) . '</span>'
        . '<span class="li-main"><span class="li-title">' . e($t['description'] ?: tx_type_label($t['type'], $t['direction'])) . '</span>'
        . '<span class="li-sub">' . e(tx_type_label($t['type'], $t['direction'])) . ' · ' . e(time_ago($t['created_at'])) . '</span></span>'
        . '<span class="li-end"><span class="tx-amt ' . ($credit ? 'credit' : '') . '">' . $sign . e(money($t['net_amount'])) . '</span><br>' . status_badge($t['status']) . '</span>'
        . '</a>';
}

function service_tile(array $s): string
{
    $href = $s['action_url'] && str_starts_with((string) $s['action_url'], '/') ? $s['action_url'] : '/services/' . $s['slug'];
    return '<a href="' . e(url($href)) . '" class="service-tile" data-link>'
        . ($s['badge'] ? '<span class="s-badge">' . e($s['badge']) . '</span>' : '')
        . '<span class="s-ic" style="--c:' . e($s['color'] ?: '#5b4bff') . '">' . media_icon($s['icon']) . '</span>'
        . '<b>' . e($s['title']) . '</b>' . ($s['subtitle'] ? '<small>' . e($s['subtitle']) . '</small>' : '')
        . '</a>';
}

function product_card(array $p): string
{
    $cover = $p['cover_image'] ? '<img src="' . e(upload_url($p['cover_image'])) . '" alt="" loading="lazy" decoding="async">' : icon('package');
    return '<a href="' . e(url('/products/' . $p['slug'])) . '" class="card product-card" data-link>'
        . '<div class="product-cover">' . $cover . '</div><div class="product-body"><div class="product-meta">'
        . ($p['is_featured'] ? '<span class="badge badge-warn">' . icon('star') . ' ফিচার্ড</span>' : '')
        . ($p['category'] ? '<span class="badge badge-brand">' . e($p['category']) . '</span>' : '')
        . '<span>' . e(bn_date($p['release_date'], false)) . '</span></div>'
        . '<h3>' . e($p['title_bn']) . '</h3><p>' . e($p['summary'] ?: mb_substr(strip_tags((string) $p['description']), 0, 140)) . '</p></div></a>';
}

function empty_state(string $iconName, string $title, string $text = '', string $ctaHtml = ''): string
{
    return '<div class="empty"><div class="empty-ic">' . icon($iconName) . '</div><b>' . e($title) . '</b>'
        . ($text !== '' ? '<p class="small" style="margin:4px 0 14px">' . e($text) . '</p>' : '') . $ctaHtml . '</div>';
}

function method_style(array $m): string
{
    return 'background:' . e($m['color'] ?: '#5b4bff');
}
