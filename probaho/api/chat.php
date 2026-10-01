<?php
/** /api/chat/send — AI assistant grounded in the site knowledge base. */
declare(strict_types=1);

require_post();
if ($action !== 'send') {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
if (!AI::enabled()) {
    fail('AI সহকারী এই মুহূর্তে বন্ধ আছে।');
}
$message = input_str('message', 500);
if ($message === '') {
    fail('আপনার প্রশ্ন লিখুন।');
}
if (!RateLimit::hit('chat:' . client_ip(), 25, 300)) {
    fail('অনেক বেশি প্রশ্ন করা হয়েছে। কয়েক মিনিট পর আবার চেষ্টা করুন।', 429);
}
$history = [];
foreach (array_slice((array) input('history', []), -8) as $h) {
    if (is_array($h) && isset($h['role'], $h['content']) && in_array($h['role'], ['user', 'assistant'], true)) {
        $history[] = ['role' => $h['role'], 'content' => mb_substr((string) $h['content'], 0, 1500)];
    }
}
$reply = AI::reply($message, $history);
if (setting_on('ai_log_chats')) {
    if (empty($_SESSION['chat_key'])) {
        $_SESSION['chat_key'] = bin2hex(random_bytes(16));
    }
    $userId = Auth::id() ?: null;
    db()->insert('ai_chat_logs', ['user_id' => $userId, 'session_key' => $_SESSION['chat_key'], 'role' => 'user', 'message' => $message]);
    db()->insert('ai_chat_logs', ['user_id' => $userId, 'session_key' => $_SESSION['chat_key'], 'role' => 'assistant', 'message' => $reply['answer'], 'source' => $reply['source']]);
}
ok(['answer' => $reply['answer']]);
