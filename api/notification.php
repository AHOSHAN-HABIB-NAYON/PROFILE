<?php
/**
 * Notifications API: polling, read state, push subscriptions,
 * sound preference, news reactions.
 */
defined('APP') || exit;
require_once ROOT . '/core/analytics.php';

$action = input('action');
$u = user();

// --------------------------- GET ---------------------------
if (!is_post()) {
    if ($action === 'poll') {
        session_write_close(); // never hold the session lock while polling
        $out = ['ok' => true, 'unread' => 0, 'latest' => [], 'chat_unread' => 0, 'version' => (string)setting('content_version', '1')];
        if (setting_bool('analytics.enabled')) touch_visitor();
        if ($u) {
            $since = max(0, input_int('since'));
            $out['unread'] = unread_count((int)$u['id']);
            $rows = rows('SELECT n.id, n.type, n.title_en, n.title_bn, n.body_en, n.body_bn, n.icon, n.link, n.play_sound FROM notification_targets t
                          JOIN notifications n ON n.id = t.notification_id WHERE t.user_id = ? AND t.read_at IS NULL AND n.id > ? ORDER BY n.id DESC LIMIT 5', [$u['id'], $since]);
            if (!$since && !$rows) $rows = rows('SELECT n.id, n.type, n.title_en, n.title_bn, n.body_en, n.body_bn, n.icon, n.link, n.play_sound FROM notification_targets t JOIN notifications n ON n.id = t.notification_id WHERE t.user_id = ? ORDER BY n.id DESC LIMIT 1', [$u['id']]);
            $out['latest'] = array_map(fn($n) => ['id' => (int)$n['id'], 'title' => loc($n, 'title'), 'body' => loc($n, 'body'), 'icon' => fa($n['icon'], 'fa-solid ' . notify_type_icon($n['type'])),
                'link' => $n['link'] ? url($n['link']) : '', 'sound' => (bool)$n['play_sound']], $rows);
            $out['chat_unread'] = (int)val('SELECT COALESCE(SUM(unread_user), 0) FROM support_conversations WHERE user_id = ?', [$u['id']]);
        } elseif (!empty($_COOKIE['sup'])) {
            $out['chat_unread'] = (int)val('SELECT COALESCE(SUM(unread_user), 0) FROM support_conversations WHERE guest_token = ?', [token_hash((string)$_COOKIE['sup'])]);
        }
        json_out($out);
    }
    if ($action === 'latest') {
        // used by the service worker after a push "tickle"
        $n = $u
            ? row('SELECT n.* FROM notification_targets t JOIN notifications n ON n.id = t.notification_id WHERE t.user_id = ? ORDER BY n.id DESC LIMIT 1', [$u['id']])
            : row('SELECT * FROM notifications WHERE is_broadcast = 1 ORDER BY id DESC LIMIT 1');
        json_out(['ok' => true, 'notification' => $n ? ['id' => (int)$n['id'], 'title' => loc($n, 'title'), 'body' => loc($n, 'body'), 'link' => abs_url($n['link'] ?: '/notifications')] : null]);
    }
    fail(t('err.bad_request'), 400);
}

// --------------------------- POST ---------------------------
switch ($action) {
case 'read':
    $u = require_login();
    q('UPDATE notification_targets SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL', [input_int('id'), $u['id']]);
    ok('', ['unread' => unread_count((int)$u['id'])]);

case 'read_all':
    $u = require_login();
    q('UPDATE notification_targets SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
    ok(t('notif.all_read'), ['unread' => 0]);

case 'prefs':
    $u = require_login();
    q('UPDATE user_security SET notify_sound = ? WHERE user_id = ?', [input_bool('sound') ? 1 : 0, $u['id']]);
    ok();

case 'subscribe':
    rate_limit('push-sub:' . client_ip(), 20, 3600);
    $endpoint = input('endpoint');
    $p256 = input('p256dh');
    $auth = input('auth');
    if (!preg_match('~^https://[^\s]{10,590}$~', $endpoint) || !preg_match('~^[A-Za-z0-9_-]{20,200}$~', $p256) || !preg_match('~^[A-Za-z0-9_-]{8,100}$~', $auth)) fail(t('err.bad_request'));
    q('INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)',
        [$u['id'] ?? null, $endpoint, hash('sha256', $endpoint), $p256, $auth, user_agent()]);
    ok(t('notif.push_enabled'));

case 'unsubscribe':
    q('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [hash('sha256', input('endpoint'))]);
    ok();

case 'react':
    rate_limit('react:' . client_ip(), 60, 600);
    $nid = input_int('news');
    $r = input('reaction');
    if (!in_array($r, ['like', 'love', 'fire', 'wow', 'sad'], true) || !val("SELECT 1 FROM news WHERE id = ? AND status = 'published'", [$nid])) fail(t('err.bad_request'));
    $vh = visitor_hash();
    $cur = val('SELECT reaction FROM news_reactions WHERE news_id = ? AND visitor_hash = ?', [$nid, $vh]);
    if ($cur === $r) {
        q('DELETE FROM news_reactions WHERE news_id = ? AND visitor_hash = ?', [$nid, $vh]);
        $mine = null;
    } else {
        q('INSERT INTO news_reactions (news_id, visitor_hash, user_id, reaction) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), user_id = VALUES(user_id)',
            [$nid, $vh, $u['id'] ?? null, $r]);
        $mine = $r;
    }
    $counts = array_map('intval', array_column(rows('SELECT reaction, COUNT(*) c FROM news_reactions WHERE news_id = ? GROUP BY reaction', [$nid]), 'c', 'reaction'));
    ok('', ['mine' => $mine, 'counts' => (object)$counts]);

default:
    fail(t('err.bad_request'), 400);
}
