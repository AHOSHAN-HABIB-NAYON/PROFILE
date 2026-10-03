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
