<?php
/**
 * Admin API — every action checks its own permission and is audit-logged.
 * GET:  user_search, media_list, support_poll
 * POST: CRUD, settings, users, payments, orders, notifications, media, support…
 */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
define('ADMIN_API', true);

$me = require_login();
if (!is_staff($me)) fail(t('err.forbidden'), 403);
$action = input('action');
$need = fn(string $perm) => can($perm) || fail(t('err.forbidden'), 403);

/** Swap a media path everywhere it is referenced. */
function replace_media_refs(string $old, string $new): void
{
    q('UPDATE settings SET v = ? WHERE v = ?', [$new, $old]);
    foreach (['services' => ['image', 'icon_image'], 'products' => ['image'], 'news' => ['image'], 'team_members' => ['photo', 'cv_file'], 'payment_methods' => ['logo'], 'users' => ['avatar']] as $t => $cols) {
        foreach ($cols as $c) q('UPDATE ' . ident($t) . ' SET ' . ident($c) . ' = ? WHERE ' . ident($c) . ' = ?', [$new, $old]);
    }
    foreach (['news' => ['content_en', 'content_bn'], 'services' => ['description_en', 'description_bn'], 'products' => ['description_en', 'description_bn']] as $t => $cols) {
        foreach ($cols as $c) q('UPDATE ' . ident($t) . ' SET ' . ident($c) . ' = REPLACE(' . ident($c) . ', ?, ?) WHERE ' . ident($c) . ' LIKE ?', ['/' . $old, '/' . $new, '%' . $old . '%']);
    }
    q("UPDATE payment_methods SET details = REPLACE(details, ?, ?) WHERE details LIKE ?", [json_encode($old, JSON_UNESCAPED_SLASHES), json_encode($new, JSON_UNESCAPED_SLASHES), '%' . $old . '%']);
    @unlink(ROOT . '/storage/cache/settings.php');
}

function admin_target_user(): array
{
    $u = row('SELECT * FROM users WHERE id = ?', [input_int('id')]);
    if (!$u) fail('User not found', 404);
    return $u;
}

/** Prevent removing the last active administrator. */
function guard_last_admin(array $u): void
{
    if ($u['role'] === 'admin' && (int)val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'") <= 1) fail('This is the only active administrator.', 422);
}

// =====================================================================
// GET endpoints
// =====================================================================
if (!is_post()) {
    switch ($action) {
    case 'user_search':
        $need('notifications');
        $q = mb_substr(input('q'), 0, 80);
        if (mb_strlen($q) < 2) json_out(['ok' => true, 'users' => []]);
        $l = '%' . addcslashes($q, '%_\\') . '%';
        json_out(['ok' => true, 'users' => rows("SELECT id, name, email FROM users WHERE status <> 'deleted' AND (name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 10", [$l, $l])]);
    case 'media_list':
        $need('media');
        $q = mb_substr(input('q'), 0, 80);
        $l = '%' . addcslashes($q, '%_\\') . '%';
        $items = rows("SELECT id, path, thumb, original_name, size FROM media WHERE mime LIKE 'image/%' AND (? = '' OR original_name LIKE ? OR path LIKE ?) ORDER BY id DESC LIMIT 60", [$q, $l, $l]);
        json_out(['ok' => true, 'items' => array_map(fn($m) => ['id' => (int)$m['id'], 'path' => $m['path'], 'url' => media_url($m['path']), 'thumb' => media_url($m['thumb'] ?: $m['path']), 'name' => $m['original_name']], $items)]);
    case 'support_poll':
        $need('support');
        session_write_close();
        $cid = input_int('c');
        $msgs = rows('SELECT m.id, m.sender, m.message, m.created_at, a.name AS admin FROM support_messages m LEFT JOIN users a ON a.id = m.admin_id WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id', [$cid, input_int('after')]);
        if ($msgs) q('UPDATE support_conversations SET unread_admin = 0 WHERE id = ?', [$cid]);
        json_out(['ok' => true, 'messages' => array_map(fn($m) => ['id' => (int)$m['id'], 'mine' => $m['sender'] === 'admin', 'message' => $m['message'],
            'meta' => ($m['sender'] === 'admin' ? ($m['admin'] ?: 'Staff') : 'Customer') . ' · ' . date('M j, H:i', strtotime($m['created_at']))], $msgs)]);
    }
    fail(t('err.bad_request'), 400);
}

// =====================================================================
// POST endpoints
// =====================================================================
switch ($action) {

// ---------------- generic CRUD ----------------
case 'crud_save': crud_save();
case 'crud_delete': crud_delete();
case 'crud_toggle': crud_toggle();

// ---------------- settings ----------------
case 'settings_save':
    $need('settings');
    $tab = input('__tab');
    $schema = settings_schema();
    if (!isset($schema[$tab])) fail(t('err.bad_request'));
    if ($tab === 'ai') $need('ai');
    $vals = [];
    $errors = [];
    foreach ($schema[$tab]['fields'] as $key => $f) {
        if (!empty($f['readonly']) || $f['type'] === 'info') continue;
        [$v, $err] = admin_field_value($key, $f, setting($key));
        if ($err) { $errors[$key] = $err; continue; }
        if (!empty($f['required']) && ($v === null || $v === '')) { $errors[$key] = 'Required'; continue; }
        $vals[$key] = $v === null ? '' : (string)(is_float($v) && floor($v) == $v ? (int)$v : $v);
    }
    if ($errors) fail('Please fix the highlighted fields.', 422, $errors);
    if ($tab === 'maintenance' && $vals['maintenance.enabled'] === '1' && !setting_bool('maintenance.enabled') && $vals['maintenance.ends_at'] === '') {
        $vals['maintenance.ends_at'] = date('Y-m-d H:i:s', time() + max(1, (int)$vals['maintenance.duration']) * 60);
    }
    settings_save($vals);
    bump_content_version();
    audit('settings_change', 'settings', null, 'Updated ' . $tab . ' settings: ' . implode(', ', array_map(fn($k) => in_array($k, SECRET_SETTINGS, true) ? $k . ' (secret)' : $k, array_keys($vals))));
    ok('Settings saved', ['redirect' => url($tab === 'ai' && str_contains((string)($_SERVER['HTTP_REFERER'] ?? ''), '/admin/ai') ? '/admin/ai' : '/admin/settings?tab=' . $tab), 'full' => in_array($tab, ['theme', 'general'], true)]);

case 'vapid_generate':
    $need('settings');
    require_once ROOT . '/core/push.php';
    $k = vapid_generate();
    settings_save(['pwa.vapid_public' => $k['public'], 'pwa.vapid_private' => $k['private']]);
    q('DELETE FROM push_subscriptions');
    audit('security_change', 'settings', null, 'Generated new VAPID keys');
    ok('VAPID keys generated — push is ready', ['reload' => true]);

case 'smtp_test':
    $need('settings');
    rate_limit('smtp-test:' . $me['id'], 10, 600);
    [$subject, $html] = render_mail('test', ['name' => $me['name']], lang());
    if (!smtp_send($me['email'], $subject, $html, $err)) fail('SMTP test failed: ' . $err, 502);
    ok('Test email sent to ' . $me['email']);

case 'ai_test':
    $need('ai');
    rate_limit('ai-test:' . $me['id'], 20, 600);
    require_once ROOT . '/core/ai.php';
    session_write_close();
    $q = mb_substr(input('message'), 0, 500) ?: 'Hello';
    if (ai_remote_ready()) {
        $r = ai_complete([['role' => 'user', 'content' => $q]]);
        if (!$r['ok']) fail('AI error: ' . $r['error'] . ' (visitors get the built-in assistant as fallback)', 502);
        ok('External model responded (' . (int)$r['tokens'] . ' tokens)', ['reply' => $r['reply']]);
    }
    $r = ai_local_reply($q);
    $extra = $r['cards'] ? "\n\n" . implode("\n", array_map(fn($c) => '▸ ' . $c['title'] . (isset($c['price']) ? ' — ' . $c['price'] : ''), $r['cards'])) : '';
    ok('Built-in assistant responded', ['reply' => $r['reply'] . $extra]);

case 'maintenance_restart':
    $need('settings');
    settings_save(['maintenance.ends_at' => date('Y-m-d H:i:s', time() + max(1, (int)setting('maintenance.duration', 60)) * 60)]);
    audit('settings_change', 'settings', null, 'Maintenance countdown restarted');
    ok('Countdown restarted', ['reload' => true]);

// ---------------- users ----------------
case 'user_update':
    $need('users');
    $u = admin_target_user();
    $name = input('name');
    $email = mb_strtolower(input('email'));
    if (mb_strlen($name) < 2) fail('Name is too short', 422, ['name' => 'Too short']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Invalid email', 422, ['email' => 'Invalid']);
    if (val('SELECT 1 FROM users WHERE email = ? AND id <> ?', [$email, $u['id']])) fail('Email already used', 422, ['email' => 'Already used']);
    $data = ['name' => $name, 'email' => $email, 'phone' => mb_substr(input('phone'), 0, 40) ?: null, 'is_vip' => input_bool('is_vip') ? 1 : 0];
    $role = input('role');
    if ($role !== '' && $role !== $u['role']) {
        if (!is_admin()) fail('Only administrators can change roles', 403);
        if ((int)$u['id'] === (int)$me['id']) fail('You cannot change your own role', 422);
        if (!in_array($role, ['user', 'support', 'editor', 'admin'], true)) fail(t('err.bad_request'));
        if ($u['role'] === 'admin') guard_last_admin($u);
        $data['role'] = $role;
        audit('role_change', 'user', (int)$u['id'], $u['role'] . ' → ' . $role);
    }
    update('users', $data, 'id = ?', [$u['id']]);
    audit('user_update', 'user', (int)$u['id'], $email);
    ok('User saved', ['reload' => true]);

case 'user_status':
    $need('users');
    $u = admin_target_user();
    if ((int)$u['id'] === (int)$me['id']) fail('You cannot change your own status', 422);
    $status = input('status');
    $reason = mb_substr(input('reason'), 0, 255) ?: null;
    if ($status === 'active') {
        update('users', ['status' => 'active', 'suspended_until' => null, 'status_reason' => null], 'id = ?', [$u['id']]);
        audit('user_activate', 'user', (int)$u['id'], $u['email']);
        ok('Account activated', ['reload' => true]);
    }
    if (!in_array($status, ['banned', 'suspended'], true)) fail(t('err.bad_request'));
    guard_last_admin($u);
    $days = input_int('days');
    $until = $status === 'suspended' ? ($days > 0 ? date('Y-m-d H:i:s', time() + $days * 86400) : '2099-12-31 23:59:59') : null;
    update('users', ['status' => $status, 'suspended_until' => $until, 'status_reason' => $reason], 'id = ?', [$u['id']]);
    q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']]);
    audit($status === 'banned' ? 'user_ban' : 'user_suspend', 'user', (int)$u['id'], $u['email'] . ($until ? ' until ' . $until : '') . ($reason ? ' — ' . $reason : ''));
    ok($status === 'banned' ? 'User banned' : 'User suspended', ['reload' => true]);

case 'user_delete':
    $need('users');
    $u = admin_target_user();
    if ((int)$u['id'] === (int)$me['id']) fail('You cannot delete yourself', 422);
    guard_last_admin($u);
    update('users', ['status' => 'deleted', 'deleted_at' => date('Y-m-d H:i:s')], 'id = ?', [$u['id']]);
    q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']]);
    audit('user_delete', 'user', (int)$u['id'], $u['email']);
    ok('User deleted (restorable)', ['reload' => true]);

case 'user_restore':
    $need('users');
    $u = admin_target_user();
    update('users', ['status' => 'active', 'deleted_at' => null, 'suspended_until' => null], 'id = ?', [$u['id']]);
    audit('user_restore', 'user', (int)$u['id'], $u['email']);
    ok('User restored', ['reload' => true]);

case 'user_balance':
    $need('users');
    $u = admin_target_user();
    $type = input('type') === 'debit' ? 'debit' : 'credit';
    $amount = round((float)input('amount'), 2);
    $reason = mb_substr(input('reason'), 0, 255);
    if ($amount <= 0 || $amount > 1000000) fail('Enter a valid amount', 422, ['amount' => 'Invalid']);
    if (mb_strlen($reason) < 3) fail('A reason is required', 422, ['reason' => 'Required']);
    $after = transaction(function () use ($u, $type, $amount, $reason, $me) {
        $bal = (float)val('SELECT balance FROM users WHERE id = ? FOR UPDATE', [$u['id']]);
        $after = round($type === 'credit' ? $bal + $amount : $bal - $amount, 2);
        if ($after < 0) return null;
        q('UPDATE users SET balance = ? WHERE id = ?', [$after, $u['id']]);
        insert('balance_transactions', ['user_id' => $u['id'], 'admin_id' => $me['id'], 'type' => $type, 'amount' => $amount, 'balance_after' => $after, 'reason' => $reason]);
        return $after;
    });
    if ($after === null) fail('Balance cannot go below zero', 422);
    audit('balance_' . $type, 'user', (int)$u['id'], ($type === 'credit' ? '+' : '-') . $amount . ' → ' . $after . ' · ' . $reason);
    notify_users([(int)$u['id']], ['type' => 'payment', 'icon' => 'fa-wallet', 'link' => '/profile',
        'title_en' => ($type === 'credit' ? 'Balance added: +$' : 'Balance deducted: −$') . number_format($amount, 2), 'title_bn' => ($type === 'credit' ? 'ব্যালেন্স যোগ হয়েছে: +$' : 'ব্যালেন্স কাটা হয়েছে: −$') . number_format($amount, 2),
        'body_en' => $reason, 'body_bn' => $reason]);
    ok('Balance updated: $' . number_format($after, 2), ['reload' => true]);

case 'user_verify':
    $need('users');
    $u = admin_target_user();
    q('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [$u['id']]);
    audit('user_verify_email', 'user', (int)$u['id'], $u['email']);
    ok('Email marked verified', ['reload' => true]);

case 'user_reset_password':
    $need('users');
    $u = admin_target_user();
    $token = create_email_token((int)$u['id'], 'reset', 60 * 24);
    $sent = send_mail($u['email'], 'reset', ['name' => $u['name'], 'link' => abs_url('/reset-password?token=' . $token)], $u['lang'] ?: null, true);
    audit('user_reset_password', 'user', (int)$u['id'], $u['email']);
    $sent ? ok('Reset link sent to ' . $u['email']) : fail('Could not send email — check SMTP settings', 502);

case 'user_logout_all':
    $need('users');
    $u = admin_target_user();
    $n = q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']])->rowCount();
    audit('user_logout_all', 'user', (int)$u['id'], "$n session(s)");
    ok("Logged out of $n session(s)", ['reload' => true]);

case 'user_message':
    $need('users');
    $u = admin_target_user();
    $title = mb_substr(input('title'), 0, 190);
    $body = mb_substr(input('body'), 0, 2000);
    if ($title === '' || $body === '') fail('Title and message are required', 422);
    if (input('kind') === 'email') {
        $ok = send_mail($u['email'], 'admin_message', ['name' => $u['name'], 'subject' => $title, 'heading' => $title, 'body' => $body, 'link' => abs_url('/notifications')], $u['lang'] ?: null, true);
        audit('admin_email', 'user', (int)$u['id'], $title);
        $ok ? ok('Email sent') : fail('Email failed — check SMTP settings', 502);
    }
    notify_users([(int)$u['id']], ['type' => 'admin', 'icon' => 'fa-bullhorn', 'title_en' => $title, 'title_bn' => $title, 'body_en' => $body, 'body_bn' => $body], ['created_by' => $me['id']]);
    audit('notification_send', 'user', (int)$u['id'], $title);
    ok('Notification sent');

case 'session_revoke':
    $need('security');
    q('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ?', [input_int('id')]);
    audit('session_revoke', 'session', input_int('id'));
    ok('Session revoked', ['reload' => true]);

// ---------------- payments & orders ----------------
case 'payment_approve':
case 'payment_reject':
    $need('payments');
    $approve = $action === 'payment_approve';
    $p = row("SELECT p.*, o.code, o.product_name, u.email, u.name, u.lang FROM payments p JOIN orders o ON o.id = p.order_id JOIN users u ON u.id = p.user_id WHERE p.id = ?", [input_int('id')]);
    if (!$p) fail('Payment not found', 404);
    if ($p['status'] !== 'pending') fail('This payment was already reviewed', 409);
    $note = mb_substr(input('note'), 0, 1000) ?: null;
    transaction(function () use ($p, $approve, $note, $me) {
        q('UPDATE payments SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND status = ?', [$approve ? 'approved' : 'rejected', $note, $me['id'], $p['id'], 'pending']);
        q('UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note) WHERE id = ?', [$approve ? 'approved' : 'rejected', $note, $p['order_id']]);
    });
    $l = $p['lang'] ?: null;
    notify_users([(int)$p['user_id']], ['type' => 'payment', 'icon' => $approve ? 'fa-circle-check' : 'fa-circle-xmark', 'link' => '/payment/' . $p['code'],
        'title_en' => ($approve ? 'Payment approved — #' : 'Payment rejected — #') . $p['code'], 'title_bn' => ($approve ? 'পেমেন্ট অনুমোদিত — #' : 'পেমেন্ট বাতিল — #') . $p['code'],
        'body_en' => $note ?: $p['product_name'], 'body_bn' => $note ?: $p['product_name']]);
    send_mail($p['email'], $approve ? 'payment_approved' : 'payment_rejected', ['name' => $p['name'], 'link' => abs_url('/payment/' . $p['code']),
        'detail' => '#' . $p['code'] . ' · ' . $p['product_name'] . ' · ' . money($p['amount'], $p['currency']) . ($note ? "\n" . $note : '')], $l);
    audit($approve ? 'payment_approve' : 'payment_reject', 'payment', (int)$p['id'], '#' . $p['code'] . ' ' . money($p['amount'], $p['currency']) . ($note ? ' — ' . $note : ''));
    ok($approve ? 'Payment approved' : 'Payment rejected', ['reload' => true]);

case 'payment_note':
    $need('payments');
    q('UPDATE payments SET admin_note = ? WHERE id = ?', [mb_substr(input('note'), 0, 1000) ?: null, input_int('id')]);
    audit('payment_note', 'payment', input_int('id'), mb_substr(input('note'), 0, 200));
    ok('Note saved', ['reload' => true]);

case 'order_status':
    $need('orders');
    $o = row('SELECT o.*, u.email, u.name, u.lang FROM orders o JOIN users u ON u.id = o.user_id WHERE o.code = ?', [strtoupper(input('code'))]);
    if (!$o) fail('Order not found', 404);
    $status = input('status');
    if (!in_array($status, ['pending_payment', 'payment_submitted', 'under_review', 'approved', 'rejected', 'completed', 'cancelled'], true)) fail(t('err.bad_request'));
    $note = mb_substr(input('note'), 0, 1000);
    q('UPDATE orders SET status = ?, admin_note = ? WHERE id = ?', [$status, $note !== '' ? $note : null, $o['id']]);
    if ($status !== $o['status']) {
        $label = t('status.' . $status, [], $o['lang'] ?: null);
        notify_users([(int)$o['user_id']], ['type' => 'order', 'icon' => 'fa-bag-shopping', 'link' => '/payment/' . $o['code'],
            'title_en' => 'Order #' . $o['code'] . ': ' . t('status.' . $status, [], 'en'), 'title_bn' => 'অর্ডার #' . $o['code'] . ': ' . t('status.' . $status, [], 'bn'),
            'body_en' => $note ?: $o['product_name'], 'body_bn' => $note ?: $o['product_name']]);
        send_mail($o['email'], 'order_update', ['name' => $o['name'], 'link' => abs_url('/payment/' . $o['code']), 'detail' => '#' . $o['code'] . ' · ' . $o['product_name'] . "\n" . $label . ($note ? "\n" . $note : '')], $o['lang'] ?: null);
    }
    audit('order_status', 'order', (int)$o['id'], '#' . $o['code'] . ': ' . $o['status'] . ' → ' . $status);
    ok('Order updated', ['reload' => true]);

// ---------------- notifications ----------------
case 'notify_send':
    $need('notifications');
    rate_limit('notify-send:' . $me['id'], 30, 3600);
    $target = input('target');
    $titleEn = mb_substr(input('title_en'), 0, 190);
    $titleBn = mb_substr(input('title_bn'), 0, 190);
    if ($titleEn === '' && $titleBn === '') fail('Enter a title', 422, ['title_en' => 'Required']);
    $link = input('link');
    if ($link !== '' && !preg_match('~^(/[^\s]*|https://[^\s]+)$~', $link)) fail('Link must start with / or https://', 422, ['link' => 'Invalid']);
    $type = in_array(input('type'), NOTIFY_TYPES, true) ? input('type') : 'admin';
    if ($type === 'promotion' && !setting_bool('notify.promotions_enabled')) fail('Promotion notifications are disabled in settings', 422);
    $n = ['type' => $type, 'icon' => fa(input('icon'), 'fa-solid fa-bullhorn'), 'link' => $link ?: null,
        'title_en' => $titleEn ?: $titleBn, 'title_bn' => $titleBn ?: $titleEn, 'body_en' => input('body_en') ?: input('body_bn'), 'body_bn' => input('body_bn') ?: input('body_en')];
    $opts = ['push' => input_bool('push'), 'email' => input_bool('email'), 'sound' => input_bool('sound'), 'created_by' => $me['id']];
    if ($target === 'users') {
        $ids = array_filter(array_map('intval', (array)($_POST['users'] ?? [])));
        if (!$ids) fail('Select at least one user', 422);
        $count = notify_dispatch('users', $ids, $n, $opts);
    } else {
        if (!notify_target_sql($target)) fail(t('err.bad_request'));
        $count = notify_dispatch($target, [], $n, $opts);
    }
    audit('notification_send', 'notification', null, "$target · $count recipient(s) · " . $n['title_en']);
    ok("Sent to $count user(s)", ['reload' => true]);

// ---------------- media ----------------
case 'media_delete':
    $need('media');
    $m = row('SELECT * FROM media WHERE id = ?', [input_int('id')]);
    if (!$m) fail('Not found', 404);
    delete_public_file($m['path']);
    delete_public_file($m['thumb']);
    q('DELETE FROM media WHERE id = ?', [$m['id']]);
    audit('media_delete', 'media', (int)$m['id'], $m['path']);
    ok('Deleted', ['reload' => true]);

case 'media_set':
    $need('settings');
    $m = row('SELECT * FROM media WHERE id = ?', [input_int('id')]);
    $key = input('key');
    if (!$m || !in_array($key, ['logo', 'favicon', 'og_image', 'banner', 'app_icon', 'email_logo', 'home.about_image'], true)) fail(t('err.bad_request'));
    settings_save([$key => $m['path']]);
    bump_content_version();
    audit('settings_change', 'settings', null, "$key set to {$m['path']}");
    ok('Saved as ' . str_replace('_', ' ', $key));

case 'media_recompress':
    $need('media');
    $m = row('SELECT * FROM media WHERE id = ?', [input_int('id')]);
    if (!$m || !str_starts_with($m['mime'], 'image/')) fail(t('err.bad_request'));
    $src = ROOT . '/' . $m['path'];
    if (!is_file($src)) fail('File missing on disk', 404);
    $dir = dirname($src);
    $r = process_image($src, $dir . '/' . bin2hex(random_bytes(16)), $m['mime'], ['compress' => true, 'target_percent' => max(1, min(100, input_int('target', (int)setting('media.target_percent', 10)))),
        'max_dim' => (int)setting('media.max_dimension', 1920), 'webp' => function_exists('imagewebp'), 'thumb' => (int)setting('media.thumb_width', 480)]);
    $newPath = 'assets/uploads/' . substr($r['file'], strlen(ROOT . '/assets/uploads/'));
    $newThumb = $r['thumb'] ? 'assets/uploads/' . substr($r['thumb'], strlen(ROOT . '/assets/uploads/')) : null;
    update('media', ['path' => $newPath, 'thumb' => $newThumb, 'mime' => $r['mime'], 'size' => filesize($r['file']), 'original_size' => $m['original_size'] ?: $m['size'], 'width' => $r['width'], 'height' => $r['height']], 'id = ?', [$m['id']]);
    replace_media_refs($m['path'], $newPath);
    delete_public_file($m['path']);
    delete_public_file($m['thumb']);
    bump_content_version();
    audit('media_compress', 'media', (int)$m['id'], human_bytes((int)$m['size']) . ' → ' . human_bytes(filesize($r['file'])));
    ok('Compressed: ' . human_bytes((int)$m['size']) . ' → ' . human_bytes(filesize($r['file'])), ['reload' => true]);

case 'media_replace':
    $need('media');
    $m = row('SELECT * FROM media WHERE id = ?', [input_int('id')]);
    if (!$m || empty($_FILES['file'])) fail(t('err.bad_request'));
    try {
        $f = store_upload($_FILES['file'], 'image', ['compress' => input_bool('compress')]);
    } catch (RuntimeException $e) {
        fail($e->getMessage(), 422);
    }
    update('media', ['path' => $f['path'], 'thumb' => $f['thumb'], 'mime' => $f['mime'], 'size' => $f['size'], 'width' => $f['width'], 'height' => $f['height'], 'original_size' => $m['original_size'] ?: $m['size']], 'id = ?', [$m['id']]);
    replace_media_refs($m['path'], $f['path']);
    delete_public_file($m['path']);
    delete_public_file($m['thumb']);
    bump_content_version();
    audit('media_replace', 'media', (int)$m['id'], $m['path'] . ' → ' . $f['path']);
    ok('Image replaced everywhere it was used', ['media' => ['url' => media_url($f['path'])]]);

// ---------------- support ----------------
case 'support_reply':
    $need('support');
    $c = row('SELECT c.*, u.email, u.name, u.lang FROM support_conversations c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?', [input_int('id')]);
    $msg = trim(mb_substr(input('message'), 0, 2000));
    if (!$c || $msg === '') fail(t('err.bad_request'));
    insert('support_messages', ['conversation_id' => $c['id'], 'sender' => 'admin', 'admin_id' => $me['id'], 'message' => $msg]);
    q("UPDATE support_conversations SET unread_user = unread_user + 1, unread_admin = 0, last_message_at = NOW(), status = 'open',
       first_reply_seconds = COALESCE(first_reply_seconds, TIMESTAMPDIFF(SECOND, created_at, NOW())) WHERE id = ?", [$c['id']]);
    if ($c['user_id']) notify_users([(int)$c['user_id']], ['type' => 'admin', 'icon' => 'fa-headset', 'link' => '/contact', 'title_en' => 'Support replied', 'title_bn' => 'সাপোর্ট উত্তর দিয়েছে', 'body_en' => mb_substr($msg, 0, 140), 'body_bn' => mb_substr($msg, 0, 140)]);
    $to = $c['email'] ?: $c['guest_email'];
    if ($to) send_mail($to, 'support_reply', ['name' => $c['name'] ?: $c['guest_name'], 'detail' => $msg], $c['lang'] ?: null);
    ok('', ['sent' => true]);

case 'support_status':
    $need('support');
    q('UPDATE support_conversations SET status = ? WHERE id = ?', [input('status') === 'closed' ? 'closed' : 'open', input_int('id')]);
    ok('Updated', ['reload' => true]);

case 'contact_status':
    $need('support');
    q('UPDATE contact_messages SET status = ? WHERE id = ?', [in_array(input('status'), ['new', 'read', 'replied', 'archived'], true) ? input('status') : 'read', input_int('id')]);
    ok('Updated', ['reload' => true]);

case 'contact_delete':
    $need('support');
    $m = row('SELECT * FROM contact_messages WHERE id = ?', [input_int('id')]);
    if ($m && $m['attachment']) @unlink(ROOT . '/storage/private/' . $m['attachment']);
    q('DELETE FROM contact_messages WHERE id = ?', [input_int('id')]);
    audit('contact_delete', 'contact', input_int('id'));
    ok('Deleted', ['reload' => true]);

case 'contact_reply':
    $need('support');
    $m = row('SELECT * FROM contact_messages WHERE id = ?', [input_int('id')]);
    $msg = trim(mb_substr(input('message'), 0, 5000));
    if (!$m || $msg === '') fail('Write a reply first', 422);
    $ok = send_mail($m['email'], 'support_reply', ['name' => $m['name'], 'subject' => 'Re: ' . $m['subject'], 'detail' => $msg], null, true);
    if (!$ok) fail('Email failed — check SMTP settings', 502);
    q("UPDATE contact_messages SET status = 'replied' WHERE id = ?", [$m['id']]);
    audit('contact_reply', 'contact', (int)$m['id'], $m['email']);
    ok('Reply sent', ['reload' => true]);

default:
    fail(t('err.bad_request'), 400);
}
