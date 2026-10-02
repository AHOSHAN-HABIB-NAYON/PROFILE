<?php
/** Live customer support chat (visitor side). Polling-based, shared-hosting friendly. */
defined('APP') || exit;

$action = input('action');
$u = user();

/** Find the visitor's conversation (logged-in user or guest cookie). */
function support_conversation(?array $u): ?array
{
    if ($u) return row('SELECT * FROM support_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$u['id']]);
    $tok = (string)($_COOKIE['sup'] ?? '');
    if (!preg_match('~^[A-Za-z0-9_-]{32,64}$~', $tok)) return null;
    return row('SELECT * FROM support_conversations WHERE guest_token = ? ORDER BY id DESC LIMIT 1', [token_hash($tok)]);
}

function staff_online(): bool
{
    return (bool)val("SELECT 1 FROM users WHERE role IN ('admin','support') AND status = 'active' AND last_seen_at > NOW() - INTERVAL 5 MINUTE LIMIT 1");
}

if (!is_post()) {
    if ($action !== 'messages') fail(t('err.bad_request'), 400);
    session_write_close();
    $c = support_conversation($u);
    $msgs = [];
    if ($c) {
        $msgs = rows('SELECT id, sender, message, created_at FROM support_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 100', [$c['id'], max(0, input_int('after'))]);
        if ($c['unread_user']) q('UPDATE support_conversations SET unread_user = 0 WHERE id = ?', [$c['id']]);
    }
    json_out(['ok' => true, 'online' => staff_online(), 'has_thread' => (bool)$c,
        'messages' => array_map(fn($m) => ['id' => (int)$m['id'], 'sender' => $m['sender'], 'message' => $m['message'], 'time' => time_ago($m['created_at'])], $msgs)]);
}

if ($action !== 'send') fail(t('err.bad_request'), 400);
if (!setting_bool('live_chat.enabled')) fail(t('err.forbidden'), 403);
rate_limit('support:' . client_ip(), 20, 600);
$msg = trim(mb_substr(input('message'), 0, 2000));
if ($msg === '') fail(t('chat.empty'));

$c = support_conversation($u);
$isNew = false;
if (!$c) {
    $data = ['user_id' => $u['id'] ?? null];
    if (!$u) {
        $name = mb_substr(input('guest_name'), 0, 120);
        $email = mb_strtolower(input('guest_email'));
        if (mb_strlen($name) < 2 || !filter_var($email, FILTER_VALIDATE_EMAIL)) fail(t('chat.guest_required'), 422);
        $tok = b64url_encode(random_bytes(32));
        setcookie('sup', $tok, ['expires' => time() + 180 * 86400, 'path' => '/', 'secure' => IS_HTTPS, 'httponly' => true, 'samesite' => 'Lax']);
        $data += ['guest_name' => $name, 'guest_email' => $email, 'guest_token' => token_hash($tok)];
    }
    $cid = insert('support_conversations', $data);
    $c = row('SELECT * FROM support_conversations WHERE id = ?', [$cid]);
    $isNew = true;
}
$prevUserMsg = val("SELECT created_at FROM support_messages WHERE conversation_id = ? AND sender = 'user' ORDER BY id DESC LIMIT 1", [$c['id']]);
insert('support_messages', ['conversation_id' => $c['id'], 'sender' => 'user', 'message' => $msg]);
q("UPDATE support_conversations SET unread_admin = unread_admin + 1, last_message_at = NOW(), status = 'open' WHERE id = ?", [$c['id']]);

if ($isNew || !$prevUserMsg || strtotime($prevUserMsg) < time() - 600) {
    $who = $u['name'] ?? $c['guest_name'] ?? 'Guest';
    notify_staff('support', ['type' => 'admin', 'icon' => 'fa-headset', 'link' => '/admin/support?c=' . $c['id'],
        'title_en' => 'Support message from ' . $who, 'title_bn' => $who . ' এর সাপোর্ট মেসেজ', 'body_en' => mb_substr($msg, 0, 140), 'body_bn' => mb_substr($msg, 0, 140)]);
}
ok('', ['conversation' => (int)$c['id']]);
