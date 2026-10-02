<?php
/** Global instant search. Staff also get users, orders and payments. */
defined('APP') || exit;

session_write_close();
$q = mb_substr(trim(input('q')), 0, 80);
if (mb_strlen($q) < 2) json_out(['ok' => true, 'groups' => []]);
rate_limit('search:' . client_ip(), 120, 600);
$like = '%' . addcslashes($q, '%_\\') . '%';
$groups = [];

$svc = rows('SELECT slug, title_en, title_bn, short_en, short_bn, icon FROM services WHERE status = 1 AND (title_en LIKE ? OR title_bn LIKE ? OR short_en LIKE ? OR short_bn LIKE ?) ORDER BY is_featured DESC, sort LIMIT 6', [$like, $like, $like, $like]);
if ($svc) $groups[] = ['label' => t('nav.services'), 'items' => array_map(fn($s) => ['title' => loc($s, 'title'), 'sub' => loc($s, 'short'), 'icon' => fa($s['icon'], 'fa-solid fa-code'), 'url' => url('/services/' . $s['slug'])], $svc)];

$prod = rows('SELECT p.name_en, p.name_bn, p.price_usd, p.price_bdt, p.discount_percent, p.icon, s.slug FROM products p JOIN services s ON s.id = p.service_id
              WHERE p.status = 1 AND s.status = 1 AND (p.name_en LIKE ? OR p.name_bn LIKE ? OR p.short_en LIKE ?) LIMIT 6', [$like, $like, $like]);
if ($prod) $groups[] = ['label' => t('search.products'), 'items' => array_map(fn($p) => ['title' => loc($p, 'name'), 'icon' => fa($p['icon'], 'fa-solid fa-box'), 'url' => url('/services/' . $p['slug']), 'meta' => money(product_price($p, 'USD'))], $prod)];

$news = rows("SELECT id, title_en, title_bn, emoji, publish_at FROM news WHERE status = 'published' AND publish_at <= NOW() AND (title_en LIKE ? OR title_bn LIKE ? OR tags LIKE ?) ORDER BY publish_at DESC LIMIT 6", [$like, $like, $like]);
if ($news) $groups[] = ['label' => t('nav.news'), 'items' => array_map(fn($n) => ['title' => ($n['emoji'] ? $n['emoji'] . ' ' : '') . loc($n, 'title'), 'sub' => time_ago($n['publish_at']), 'icon' => 'fa-regular fa-newspaper', 'url' => url('/news/' . $n['id'])], $news)];

$u = user();
if ($u && can('users', $u)) {
    $users = rows('SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 5', [$like, $like]);
    if ($users) $groups[] = ['label' => t('search.users'), 'items' => array_map(fn($x) => ['title' => $x['name'], 'sub' => $x['email'], 'icon' => 'fa-solid fa-user', 'url' => url('/admin/users?id=' . $x['id']), 'admin' => true], $users)];
}
if ($u && can('orders', $u)) {
    $orders = rows('SELECT o.code, o.product_name, o.status, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.code LIKE ? OR o.product_name LIKE ? ORDER BY o.id DESC LIMIT 5', [$like, $like]);
    if ($orders) $groups[] = ['label' => t('search.orders'), 'items' => array_map(fn($o) => ['title' => '#' . $o['code'], 'sub' => $o['product_name'] . ' · ' . $o['name'], 'icon' => 'fa-solid fa-receipt', 'meta' => t('status.' . $o['status']), 'url' => url('/admin/orders?q=' . $o['code']), 'admin' => true], $orders)];
}
if ($u && can('payments', $u)) {
    $pays = rows('SELECT p.id, p.txid, p.amount, p.currency, p.status, o.code FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.txid LIKE ? OR o.code LIKE ? ORDER BY p.id DESC LIMIT 5', [$like, $like]);
    if ($pays) $groups[] = ['label' => t('search.payments'), 'items' => array_map(fn($p) => ['title' => $p['txid'], 'sub' => '#' . $p['code'] . ' · ' . money($p['amount'], $p['currency']), 'icon' => 'fa-solid fa-wallet', 'meta' => t('status.' . $p['status']), 'url' => url('/admin/payments?q=' . rawurlencode($p['txid'])), 'admin' => true], $pays)];
}
json_out(['ok' => true, 'groups' => $groups]);
