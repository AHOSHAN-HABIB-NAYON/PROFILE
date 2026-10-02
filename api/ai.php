<?php
/** AI chatbot endpoint – server-side only, rate limited per visitor. */
defined('APP') || exit;
require_once ROOT . '/core/ai.php';
require_once ROOT . '/core/analytics.php';

if (!is_post()) fail(t('err.bad_request'), 405);
if (!setting_bool('ai.enabled')) fail(t('ai.disabled'), 403);
$msg = trim(mb_substr(input('message'), 0, 1000));
if ($msg === '') fail(t('ai.empty'));

$vh = visitor_hash();
$uid = user()['id'] ?? null;
$limit = max(1, (int)setting('ai.rate_limit', 10));
$window = max(1, (int)setting('ai.rate_window', 10));
if (!rate_hit('ai:' . $vh, $limit, $window * 60) || !rate_hit('ai-ip:' . client_ip(), $limit * 3, $window * 60)) {
    fail(t('ai.rate_limited', ['n' => num($limit), 'm' => num($window)]), 429);
}
if (!ai_ready()) fail(t('ai.not_configured'), 503);

// conversation memory (last messages of this visitor, within 2 hours)
$history = array_reverse(rows('SELECT role, message AS content FROM ai_conversations WHERE visitor_hash = ? AND created_at > NOW() - INTERVAL 2 HOUR ORDER BY id DESC LIMIT 10', [$vh]));
$history[] = ['role' => 'user', 'content' => $msg];
session_write_close(); // the model call can take seconds – release the session lock

$r = ai_complete($history);
insert('ai_conversations', ['visitor_hash' => $vh, 'user_id' => $uid, 'role' => 'user', 'message' => $msg]);
if (!$r['ok']) fail(t('ai.error'), 502);
insert('ai_conversations', ['visitor_hash' => $vh, 'user_id' => $uid, 'role' => 'assistant', 'message' => $r['reply'], 'tokens' => $r['tokens']]);
json_out(['ok' => true, 'reply' => $r['reply']]);
