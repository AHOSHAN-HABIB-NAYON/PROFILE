<?php
/** Small dependency-free SMTP client (SSL, STARTTLS or plain) with AUTH LOGIN. */
final class Mailer
{
    private $sock;
    private array $log = [];

    public static function configured(): bool { return setting('smtp_host') !== '' && setting('smtp_user') !== ''; }

    /** Sends a branded HTML email. Returns true on success; failures are logged, never shown to visitors. */
    public static function send(string $to, string $subject, string $bodyHtml, ?string &$error = null): bool
    {
        if (!self::configured()) { $error = 'SMTP is not configured'; return false; }
        try {
            (new self())->deliver($to, $subject, self::wrap($subject, $bodyHtml));
            return true;
        } catch (Throwable $e) {
            $error = $e->getMessage();
            ErrorHandler::log('mail', $error, ['to' => $to]);
            return false;
        }
    }

    private static array $queue = [];

    /** Sends after the response is flushed, so emails never slow a page down. */
    public static function queue(string $to, string $subject, string $bodyHtml): void
    {
        if (!self::configured() || $to === '') return;
        if (!self::$queue) register_shutdown_function([self::class, 'flushQueue']);
        self::$queue[] = [$to, $subject, $bodyHtml];
    }

    public static function flushQueue(): void
    {
        // Save the session first so the user's next request is never blocked while mail is being sent.
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        ignore_user_abort(true);
        @set_time_limit(60);
        $q = self::$queue; self::$queue = [];
        foreach ($q as [$to, $subject, $body]) self::send($to, $subject, $body);
    }

    /** Security / account alert for a user action (login, password, 2FA, passkeys…). */
    public static function alert(int $userId, string $action, string $details = ''): void
    {
        $map = [
            'register' => 'welcome', 'login' => 'login', 'password_changed' => 'pw_changed', 'password_reset' => 'pw_reset',
            'email_changed' => 'email_changed', 'email_verified' => 'email_verified', '2fa_enabled' => 'tfa_on', '2fa_disabled' => 'tfa_off',
            '2fa_reset_by_email' => 'tfa_off', '2fa_recovery_regenerated' => 'tfa_codes', 'passkey_added' => 'passkey_added',
            'passkey_removed' => 'passkey_removed', 'sessions_revoked_all' => 'sessions_revoked', 'payment_submitted' => 'payment_submitted',
        ];
        if (!isset($map[$action]) || !self::configured() || str_ends_with($details, '(balance)')) return;
        $u = DB::row('SELECT name, email FROM users WHERE id = ? AND deleted_at IS NULL', [$userId]);
        if (!$u) return;
        $k = $map[$action];
        $site = setting('site_name');
        $rows = '';
        foreach ([t('mail.when') => date('Y-m-d H:i') . ' (' . date_default_timezone_get() . ')', t('mail.ip') => client_ip(), t('mail.device') => UA::summary(user_agent())] as $l => $v) {
            $rows .= '<tr><td style="padding:4px 10px 4px 0;color:#64748b">' . e($l) . '</td><td style="padding:4px 0;font-weight:600">' . e($v) . '</td></tr>';
        }
        $body = '<p>' . e(t('mail.hi', ['name' => $u['name']])) . '</p><p>' . e(t('mail.act_' . $k, ['site' => $site, 'details' => $details])) . '</p>'
            . '<table style="font-size:13px;margin:12px 0;border-collapse:collapse">' . $rows . '</table>';
        if ($k === 'welcome') $body .= self::button(abs_url(url('/services')), t('mail.explore'));
        elseif ($k !== 'email_verified' && $k !== 'payment_submitted') $body .= '<p style="color:#b91c1c;font-size:13px">' . e(t('mail.not_you')) . '</p>' . self::button(abs_url(url('/profile/security')), t('mail.review_security'));
        self::queue($u['email'], t('mail.act_' . $k . '_subject', ['site' => $site]), $body);
    }

    public static function wrap(string $title, string $body): string
    {
        $site = e(setting('site_name'));
        $logo = setting('email_logo') ?: setting('logo');
        $logoHtml = $logo ? '<img src="' . e(abs_url(upload_url($logo))) . '" alt="' . $site . '" height="32" style="height:32px">' : '<strong style="font-size:18px;color:#2563eb">' . $site . '</strong>';
        $color = e(setting('color_primary'));
        return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
            . '<body style="margin:0;background:#f5f7fb;font-family:Segoe UI,Hind Siliguri,Arial,sans-serif;color:#0f172a">'
            . '<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="padding:8px 0 16px">' . $logoHtml . '</div>'
            . '<div style="background:#fff;border:1px solid #e5e9f2;border-radius:12px;padding:22px;font-size:14px;line-height:1.6">'
            . '<h2 style="margin:0 0 12px;font-size:17px;color:' . $color . '">' . e($title) . '</h2>' . $body . '</div>'
            . '<p style="font-size:12px;color:#64748b;text-align:center;margin-top:16px">© ' . date('Y') . ' ' . $site . '</p></div></body></html>';
    }

    public static function button(string $href, string $label): string
    {
        return '<p style="margin:18px 0"><a href="' . e($href) . '" style="background:' . e(setting('color_primary')) . ';color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600">' . e($label) . '</a></p>';
    }

    private function deliver(string $to, string $subject, string $html): void
    {
        $host = setting('smtp_host');
        $port = (int)setting('smtp_port');
        $enc = setting('smtp_encryption');
        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
        $this->sock = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$this->sock) throw new RuntimeException("SMTP connect failed: $errstr ($errno)");
        stream_set_timeout($this->sock, 20);
        $this->expect(220);
        $ehlo = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? 'localhost') ?: 'localhost';
        $this->cmd("EHLO $ehlo", 250);
        if ($enc === 'tls') {
            $this->cmd('STARTTLS', 220);
            if (!stream_socket_enable_crypto($this->sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('STARTTLS failed');
            }
            $this->cmd("EHLO $ehlo", 250);
        }
        $this->cmd('AUTH LOGIN', 334);
        $this->cmd(base64_encode(setting('smtp_user')), 334);
        $this->cmd(base64_encode(setting('smtp_pass')), 235);
        $from = setting('smtp_from_email') ?: setting('smtp_user');
        $this->cmd('MAIL FROM:<' . $from . '>', 250);
        $this->cmd('RCPT TO:<' . $to . '>', [250, 251]);
        $this->cmd('DATA', 354);
        $fromName = '=?UTF-8?B?' . base64_encode(setting('smtp_from_name') ?: setting('site_name')) . '?=';
        $headers = [
            'Date: ' . date('r'), "From: $fromName <$from>", "To: <$to>",
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (explode('@', $from)[1] ?? 'localhost') . '>',
            'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64',
        ];
        $data = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n.";
        $this->cmd($data, 250);
        $this->cmd('QUIT', 221);
        fclose($this->sock);
    }

    private function cmd(string $line, int|array $code): void
    {
        fwrite($this->sock, $line . "\r\n");
        $this->expect($code);
    }

    private function expect(int|array $code): void
    {
        $resp = '';
        while (($l = fgets($this->sock, 515)) !== false) {
            $resp .= $l;
            if (strlen($l) < 4 || $l[3] === ' ') break;
        }
        $got = (int)substr($resp, 0, 3);
        if (!in_array($got, (array)$code, true)) throw new RuntimeException('SMTP error: ' . trim($resp));
    }
}
