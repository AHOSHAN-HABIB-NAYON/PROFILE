<?php
/**
 * /v2admin page router (included from index.php). Separate auth from users.
 */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';

$section = $route['admin'] ?? ($params['section'] ?? 'dashboard');
$id = $params['id'] ?? null;
$admin = AdminAuth::user();

if ($section === 'login') {
    if ($admin) {
        redirect('/v2admin');
    }
    View::render(ROOT . '/v2admin/pages/login.php', ['admin' => null], 'admin', 'admin-login', 'login');
}
if (!$admin) {
    redirect('/v2admin/login');
}

if (setting_on('security_admin_2fa') && !(int) $admin['totp_enabled'] && $section !== 'admins') {
    redirect('/v2admin/admins');
}

$resources = admin_resources();
$map = [
    'dashboard' => ['dashboard', null], 'users' => ['users', 'users'], 'wallets' => ['wallets', 'finance'],
    'transactions' => ['transactions', 'finance'], 'payments' => ['payments', 'finance'], 'binance' => ['binance', 'finance'],
    'reports' => ['reports', 'support'], 'notifications' => ['notifications', 'support'], 'chat-logs' => ['chat_logs', 'support'],
    'support' => ['settings_page', 'settings'], 'smtp' => ['settings_page', 'settings'], 'push' => ['settings_page', 'settings'],
    'pwa' => ['settings_page', 'settings'], 'security' => ['settings_page', 'settings'], 'settings' => ['settings_page', 'settings'],
    'admins' => ['admins', null], 'logs' => ['logs', 'settings'],
];

if (isset($resources[$section])) {
    $page = 'crud';
    $ability = $resources[$section]['ability'];
} elseif (isset($map[$section])) {
    [$page, $ability] = $map[$section];
} else {
    http_response_code(404);
    View::render(ROOT . '/v2admin/pages/denied.php', ['admin' => $admin, 'notFound' => true], 'admin', 'admin-denied', '');
}
if ($ability && !AdminAuth::can($ability)) {
    View::render(ROOT . '/v2admin/pages/denied.php', ['admin' => $admin, 'notFound' => false], 'admin', 'admin-denied', $section);
}

View::render(ROOT . '/v2admin/pages/' . $page . '.php', [
    'admin' => $admin, 'section' => $section, 'id' => $id, 'resources' => $resources,
], 'admin', 'admin-' . $page, $section);
