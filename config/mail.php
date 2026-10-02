<?php
/**
 * Email: bilingual templates, dependency-free SMTP client (SSL/STARTTLS),
 * and a small queue for bulk mail (processed after the response is sent
 * and by the cron endpoint).
 */
defined('APP') || exit;

/** Template definitions — texts live in core/lang/*.php under mail.* */
function mail_templates(): array
{
    return [
        'welcome' => ['button' => ['mail.btn_explore', '{site_url}/services']],
        'verify' => ['button' => ['mail.btn_verify', '{link}']],
        'reset' => ['button' => ['mail.btn_reset', '{link}']],
        'login_code' => ['code' => '{code}'],
        '2fa_recovery' => ['button' => ['mail.btn_disable_2fa', '{link}']],
        'payment_received' => ['button' => ['mail.btn_view_order', '{link}']],
        'payment_approved' => ['button' => ['mail.btn_view_order', '{link}']],
        'payment_rejected' => ['button' => ['mail.btn_view_order', '{link}']],
        'order_update' => ['button' => ['mail.btn_view_order', '{link}']],
        'notification' => ['button' => ['mail.btn_open', '{link}']],
        'security_alert' => ['button' => ['mail.btn_review_security', '{site_url}/profile/security']],
        'admin_message' => ['button' => ['mail.btn_open', '{link}']],
        'support_reply' => ['button' => ['mail.btn_open', '{site_url}/contact']],
        'admin_alert' => ['button' => ['mail.btn_open', '{link}']],
        'test' => [],
    ];
}

/**
 * Send (or queue) a templated email.
 * $immediate = true for things the user is waiting for (verification, codes).
 */
function send_mail(string $to, string $template, array $vars = [], ?string $lang = null, bool $immediate = false): bool
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    if (!$immediate && !setting_bool('notify.email_enabled') && !in_array($template, ['verify', 'reset', 'login_code', '2fa_recovery', 'security_alert'], true)) return false;
    $lang = isset(LANGS[$lang ?? '']) ? $lang : lang();
    [$subject, $html] = render_mail($template, $vars, $lang);
    if ($immediate) {
        if (smtp_send($to, $subject, $html, $err)) return true;
        log_error("Mail to $to failed: $err");
        return false;
    }
    insert('email_queue', ['to_email' => $to, 'subject' => $subject, 'html' => $html]);
    schedule_queue_processing();
    return true;
}

function render_mail(string $template, array $vars, string $lang): array
{
    $site = (string)setting('site_name');
    $vars += ['site' => $site, 'site_url' => BASE_URL, 'name' => ''];
    $tpl = mail_templates()[$template] ?? [];
    $sub = fn(string $s) => preg_replace_callback('~\{(\w+)\}~', fn($m) => (string)($vars[$m[1]] ?? $m[0]), $s);
    $tr = fn(string $k) => $sub(t($k, [], $lang));

    $subject = $vars['subject'] ?? $tr("mail.{$template}_subject");
    $heading = $vars['heading'] ?? $tr("mail.{$template}_heading");
    $body = $vars['body'] ?? $tr("mail.{$template}_body");
    $logo = setting('email_logo') ?: setting('logo');
    $primary = (string)setting('theme.primary', '#3045d8');

    $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
        . '<body style="margin:0;background:#f3f5fb;font-family:\'Noto Sans Bengali\',\'Noto Sans\',Segoe UI,Arial,sans-serif;color:#13203a">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;padding:24px 12px"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e9f2">'
        . '<tr><td style="padding:24px 28px 8px">'
        . ($logo ? '<img src="' . $h(abs_url($logo)) . '" alt="' . $h($site) . '" height="36" style="height:36px">' : '<strong style="font-size:18px;color:' . $h($primary) . '">' . $h($site) . '</strong>')
        . '</td></tr><tr><td style="padding:8px 28px 4px"><h1 style="font-size:20px;margin:8px 0 12px;line-height:1.4">' . $h($heading) . '</h1>'
        . '<p style="font-size:15px;line-height:1.7;margin:0 0 12px;color:#3a465c">' . ($vars['name'] ? $h(t('mail.hello', ['name' => $vars['name']], $lang)) . '<br>' : '') . nl2br($h($body)) . '</p>';
    if (!empty($vars['detail'])) $html .= '<p style="font-size:14px;background:#f5f7fc;border-radius:10px;padding:12px 14px;color:#3a465c">' . nl2br($h($vars['detail'])) . '</p>';
    if (!empty($tpl['code'])) $html .= '<p style="font-size:30px;letter-spacing:8px;font-weight:700;text-align:center;margin:18px 0;color:' . $h($primary) . '">' . $h($sub($tpl['code'])) . '</p>';
    if (!empty($tpl['button'])) {
        $link = $sub($tpl['button'][1]);
        if (!str_contains($link, '{')) {
            $html .= '<p style="margin:20px 0"><a href="' . $h($link) . '" style="display:inline-block;background:' . $h($primary) . ';color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600">' . $h($tr($tpl['button'][0])) . '</a></p>'
                . '<p style="font-size:12px;color:#69758b;word-break:break-all">' . $h($link) . '</p>';
        }
    }
    $html .= '</td></tr><tr><td style="padding:16px 28px 24px;border-top:1px solid #eef1f7;font-size:12px;color:#69758b">'
        . $h(t('mail.footer', ['site' => $site], $lang)) . '<br><a href="' . $h(BASE_URL) . '" style="color:#69758b">' . $h(BASE_URL) . '</a></td></tr>'
        . '</table></td></tr></table></body></html>';
    return [$subject, $html];
}

function mail_clean_header(string $s): string
{
    return trim(preg_replace('~[\r\n]+~', ' ', $s));
}

function mail_encode_header(string $s): string
{
    return preg_match('~[^\x20-\x7e]~', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/** Build a multipart (text + HTML) RFC 5322 message. */
function build_mime(string $from, string $fromName, string $to, string $subject, string $html): string
{
    $boundary = 'b_' . bin2hex(random_bytes(12));
    $text = html_entity_decode(trim(preg_replace('~[ \t]+~', ' ', strip_tags(preg_replace('~<(br|/p|/h1|/tr)[^>]*>~i', "\n", $html)))), ENT_QUOTES, 'UTF-8');
    $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
    $headers = [
        'Date: ' . date('r'),
        'From: ' . mail_encode_header(mail_clean_header($fromName)) . ' <' . $from . '>',
        'To: <' . $to . '>',
        'Subject: ' . mail_encode_header(mail_clean_header($subject)),
        'Message-ID: <' . bin2hex(random_bytes(10)) . '@' . $domain . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];
    return implode("\r\n", $headers) . "\r\n\r\n"
        . "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) . "\r\n"
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n"
        . "--$boundary--\r\n";
}

function smtp_send(string $to, string $subject, string $html, ?string &$error = null): bool
{
    $to = mail_clean_header($to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) { $error = 'Invalid recipient'; return false; }
    $host = (string)setting('smtp.host');
    $user = (string)setting('smtp.username');
    $from = (string)(setting('smtp.from_email') ?: $user);
    $fromName = (string)(setting('smtp.from_name') ?: setting('site_name'));
    if (!filter_var($from, FILTER_VALIDATE_EMAIL)) $from = 'no-reply@' . (parse_url(BASE_URL, PHP_URL_HOST) ?: 'localhost');
    $message = build_mime($from, $fromName, $to, $subject, $html);

    if ($host === '' || $user === '') {
        // No SMTP configured – fall back to PHP mail()
        [$head, $body] = explode("\r\n\r\n", $message, 2);
        $head = preg_replace('~^(To|Subject):.*\r\n~mi', '', $head . "\r\n");
        $ok = @mail($to, mail_encode_header(mail_clean_header($subject)), $body, trim($head));
        if (!$ok) $error = 'mail() failed (configure SMTP in Admin → Settings)';
        return $ok;
    }

    $port = (int)setting('smtp.port', 465);
    $enc = (string)setting('smtp.encryption', 'ssl');
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
    $fp = @stream_socket_client(($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) { $error = "Connect failed: $errstr ($errno)"; return false; }
    stream_set_timeout($fp, 20);

    $read = function () use ($fp): string {
        $data = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function (?string $c, array $expect) use ($fp, $read, &$error): bool {
        if ($c !== null) fwrite($fp, $c . "\r\n");
        $resp = $read();
        if (!in_array((int)substr($resp, 0, 3), $expect, true)) {
            $error = 'SMTP: ' . trim($resp ?: 'no response') . ($c !== null && !str_starts_with($c, 'AUTH') ? " (after " . strtok($c, ' ') . ")" : '');
            return false;
        }
        return true;
    };
    $ehlo = 'EHLO ' . (parse_url(BASE_URL, PHP_URL_HOST) ?: 'localhost');
    $ok = $cmd(null, [220]) && $cmd($ehlo, [250]);
    if ($ok && $enc === 'tls') {
        $ok = $cmd('STARTTLS', [220])
            && stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)
            && $cmd($ehlo, [250]);
        if (!$ok && !$error) $error = 'STARTTLS failed';
    }
    $ok = $ok && $cmd('AUTH LOGIN', [334]) && $cmd(base64_encode($user), [334]) && $cmd(base64_encode((string)setting('smtp.password')), [235])
        && $cmd('MAIL FROM:<' . $from . '>', [250]) && $cmd('RCPT TO:<' . $to . '>', [250, 251]) && $cmd('DATA', [354]);
    if ($ok) {
        $data = preg_replace('~^\.~m', '..', str_replace(["\r\n", "\r"], "\n", $message));
        $ok = $cmd(str_replace("\n", "\r\n", $data) . "\r\n.", [250]);
    }
    @fwrite($fp, "QUIT\r\n");
    fclose($fp);
    return $ok;
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------
function schedule_queue_processing(): void
{
    static $scheduled = false;
    if ($scheduled) return;
    $scheduled = true;
    register_shutdown_function(function () {
        finish_response();
        try { process_mail_queue(15); } catch (Throwable $e) { log_error($e); }
    });
}

function process_mail_queue(int $limit = 20): int
{
    $sent = 0;
    foreach (rows('SELECT * FROM email_queue WHERE sent_at IS NULL AND attempts < 3 ORDER BY id LIMIT ' . (int)$limit) as $m) {
        // claim the row so parallel workers don't double-send
        if (!q('UPDATE email_queue SET attempts = attempts + 1 WHERE id = ? AND attempts = ?', [$m['id'], $m['attempts']])->rowCount()) continue;
        if (smtp_send($m['to_email'], $m['subject'], $m['html'], $err)) {
            q('UPDATE email_queue SET sent_at = NOW(), last_error = NULL WHERE id = ?', [$m['id']]);
            $sent++;
        } else {
            q('UPDATE email_queue SET last_error = ? WHERE id = ?', [mb_substr((string)$err, 0, 255), $m['id']]);
        }
    }
    return $sent;
}
