<?php
/**
 * Dependency-free SMTP client (SSL / STARTTLS / plain, AUTH LOGIN/PLAIN).
 * Configured entirely from Admin → SMTP. Works on shared hosting without Composer.
 */
declare(strict_types=1);

final class Mailer
{
    private $sock = null;
    private string $lastReply = '';

    public static function enabled(): bool
    {
        return (string) setting('smtp.is_enabled', '0') === '1' && setting('smtp.host') !== '';
    }

    /** Send a templated email. Never throws: failures are logged. */
    public static function sendTemplate(string $to, string $template, array $vars = []): bool
    {
        require_once ROOT . '/includes/email_templates.php';
        [$subject, $html] = email_template($template, $vars);
        return self::send($to, $subject, $html, $template);
    }

    public static function send(string $to, string $subject, string $html, ?string $template = null): bool
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        if (!self::enabled()) {
            self::log($to, $subject, $template, 'skipped', 'SMTP disabled');
            return false;
        }
        try {
            (new self())->deliver($to, $subject, $html);
            self::log($to, $subject, $template, 'sent', null);
            return true;
        } catch (Throwable $e) {
            Logger::write('MAIL', $e->getMessage(), ['to' => $to]);
            self::log($to, $subject, $template, 'failed', $e->getMessage());
            return false;
        }
    }

    private static function log(string $to, string $subject, ?string $template, string $status, ?string $error): void
    {
        try {
            db()->insert('email_logs', ['to_email' => $to, 'subject' => mb_substr($subject, 0, 255), 'template' => $template, 'status' => $status, 'error' => $error ? mb_substr($error, 0, 500) : null]);
        } catch (Throwable $e) {
            Logger::error($e);
        }
    }

    private function deliver(string $to, string $subject, string $html): void
    {
        $host = (string) setting('smtp.host');
        $port = (int) setting('smtp.port', 587);
        $enc = (string) setting('smtp.encryption', 'tls');
        $user = (string) setting('smtp.username');
        $pass = (string) setting('smtp.password');
        $from = (string) (setting('smtp.from_email') ?: $user);
        $fromName = (string) (setting('smtp.from_name') ?: setting('site_name', 'Probaho'));

        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $this->sock = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$this->sock) {
            throw new RuntimeException("SMTP connect failed: $errstr ($errno)");
        }
        stream_set_timeout($this->sock, 20);
        $this->expect(220);
        $ehloHost = preg_replace('/[^A-Za-z0-9.-]/', '', (string) ($_SERVER['SERVER_NAME'] ?? 'localhost')) ?: 'localhost';
        $this->cmd('EHLO ' . $ehloHost, 250);
        if ($enc === 'tls') {
            $this->cmd('STARTTLS', 220);
            if (!stream_socket_enable_crypto($this->sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('STARTTLS negotiation failed');
            }
            $this->cmd('EHLO ' . $ehloHost, 250);
        }
        if ($user !== '') {
            if (stripos($this->lastReply, 'AUTH') !== false && stripos($this->lastReply, 'LOGIN') === false && stripos($this->lastReply, 'PLAIN') !== false) {
                $this->cmd('AUTH PLAIN ' . base64_encode("\0" . $user . "\0" . $pass), 235);
            } else {
                $this->cmd('AUTH LOGIN', 334);
                $this->cmd(base64_encode($user), 334);
                $this->cmd(base64_encode($pass), 235);
            }
        }
        $this->cmd('MAIL FROM:<' . $from . '>', 250);
        $this->cmd('RCPT TO:<' . $to . '>', [250, 251]);
        $this->cmd('DATA', 354);

        $boundary = 'b' . bin2hex(random_bytes(12));
        $text = html_entity_decode(strip_tags(preg_replace(['~<head>.*?</head>~is', '~<br\s*/?>~i', '~</p>~i', '~</h\d>~i', '~</tr>~i'], ['', "\n", "\n\n", "\n\n", "\n"], $html)), ENT_QUOTES, 'UTF-8');
        $text = trim((string) preg_replace("/\n{3,}/", "\n\n", implode("\n", array_map('trim', explode("\n", $text)))));
        $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
        $headers = [
            'Date: ' . date('r'),
            'From: ' . self::encodeHeader($fromName) . ' <' . $from . '>',
            'To: <' . $to . '>',
            'Subject: ' . self::encodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        $body = implode("\r\n", $headers) . "\r\n\r\n"
            . '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($text)) . "\r\n"
            . '--' . $boundary . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html)) . "\r\n"
            . '--' . $boundary . "--\r\n";
        // Dot-stuffing (base64 never starts a line with '.', headers might).
        $body = preg_replace('/^\./m', '..', $body);
        $this->cmd($body . "\r\n.", 250);
        $this->cmd('QUIT', 221);
        fclose($this->sock);
    }

    private static function encodeHeader(string $value): string
    {
        return preg_match('/[^\x20-\x7e]/', $value) ? '=?UTF-8?B?' . base64_encode($value) . '?=' : $value;
    }

    private function cmd(string $line, $expect): void
    {
        fwrite($this->sock, $line . "\r\n");
        $this->expect($expect);
    }

    private function expect($codes): void
    {
        $codes = (array) $codes;
        $reply = '';
        while (($line = fgets($this->sock, 1024)) !== false) {
            $reply .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        $this->lastReply = $reply;
        if (!in_array((int) substr($reply, 0, 3), $codes, true)) {
            throw new RuntimeException('SMTP error: ' . trim($reply));
        }
    }
}
