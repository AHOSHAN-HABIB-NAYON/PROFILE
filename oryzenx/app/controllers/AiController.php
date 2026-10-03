<?php
/** AI assistant endpoints. All provider calls happen server-side. */
final class AiController
{
    private function sessionKey(): string
    {
        if (empty($_SESSION['ai_key'])) $_SESSION['ai_key'] = bin2hex(random_bytes(32));
        return hash('sha256', $_SESSION['ai_key']);
    }

    private function conversation(bool $create): ?array
    {
        $uid = Auth::id();
        $c = $uid
            ? DB::row('SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$uid])
            : DB::row('SELECT * FROM ai_conversations WHERE session_key = ? AND user_id IS NULL ORDER BY id DESC LIMIT 1', [$this->sessionKey()]);
        if (!$c && $create) {
            $id = DB::insert('ai_conversations', ['user_id' => $uid, 'session_key' => $this->sessionKey()]);
            $c = DB::row('SELECT * FROM ai_conversations WHERE id = ?', [$id]);
        }
        return $c;
    }

    public function history(): void
    {
        $c = $this->conversation(false);
        $msgs = $c ? DB::all('SELECT role, content FROM (SELECT id, role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 30) x ORDER BY id', [$c['id']]) : [];
        json_out(['ok' => true, 'messages' => $msgs]);
    }

    public function chat(): void
    {
        if (setting('ai_enabled') !== '1') json_out(['ok' => false, 'message' => t('chat.disabled')], 403);
        $msg = trim(mb_substr((string)(json_body()['message'] ?? ''), 0, 1000));
        if ($msg === '') json_out(['ok' => false, 'message' => t('valid.required')], 422);
        $limit = max(1, (int)setting('ai_rate_limit'));
        $who = Auth::id() ? 'u' . Auth::id() : 'ip' . client_ip();
        if (!RateLimit::hit('ai|' . $who, $limit, 600)) json_out(['ok' => false, 'message' => t('chat.limit', ['n' => num($limit)])], 429);

        $c = $this->conversation(true);
        DB::insert('ai_messages', ['conversation_id' => $c['id'], 'role' => 'user', 'content' => $msg]);
        $history = DB::all('SELECT role, content FROM (SELECT id, role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 10) x ORDER BY id', [$c['id']]);
        $reply = Assistant::reply($history, $source);
        DB::insert('ai_messages', ['conversation_id' => $c['id'], 'role' => 'assistant', 'content' => $reply, 'source' => $source]);
        DB::q('UPDATE ai_conversations SET updated_at = NOW() WHERE id = ?', [$c['id']]);
        json_out(['ok' => true, 'reply' => $reply, 'source' => $source]);
    }

    public function clear(): void
    {
        $c = $this->conversation(false);
        // Start a fresh conversation; old messages stay for admin logs.
        if ($c) DB::insert('ai_conversations', ['user_id' => Auth::id(), 'session_key' => $this->sessionKey()]);
        json_out(['ok' => true]);
    }
}
