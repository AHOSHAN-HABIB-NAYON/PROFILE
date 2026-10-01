<?php
/* =========================================================
   ছোট SMTP মেইলার — বাইরের কোনো লাইব্রেরি লাগে না
   Hostinger ইমেইল (465 SSL / 587 TLS) আর Gmail App Password দুটোতেই চলে।
   SMTP সেট করা না থাকলে PHP-র নিজস্ব mail() দিয়ে চেষ্টা করে।
   ========================================================= */

function smtp_configured(): bool
{
    return setting('smtp_host', '') !== '' && setting('smtp_user', '') !== '' && setting('smtp_pass', '') !== '';
}

/* ফেরত: [true, ''] সফল হলে, [false, 'কারণ'] ব্যর্থ হলে */
function send_mail(string $to, string $subject, string $html): array
{
    $fromEmail = setting('smtp_from', '') ?: setting('smtp_user', '') ?: ('no-reply@' . parse_url(BASE_URL, PHP_URL_HOST));
    $fromName  = setting('smtp_from_name', '') ?: setting('site_name', 'চাকরি সার্কুলার');

    $subjectEnc = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $nameEnc    = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $body       = chunk_split(base64_encode($html));

    $headers = [
        'Date: ' . date('r'),
        'From: ' . $nameEnc . ' <' . $fromEmail . '>',
        'To: <' . $to . '>',
        'Subject: ' . $subjectEnc,
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (parse_url(BASE_URL, PHP_URL_HOST) ?: 'localhost') . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];

    if (!smtp_configured()) {
        /* SMTP নেই — হোস্টিংয়ের mail() দিয়ে চেষ্টা (স্প্যামে যেতে পারে) */
        $h  = "From: {$nameEnc} <{$fromEmail}>\r\nMIME-Version: 1.0\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n";
        $ok = @mail($to, $subjectEnc, $body, $h);
        return $ok ? [true, ''] : [false, 'SMTP সেট করা নেই, আর হোস্টিংয়ের mail() ব্যর্থ হয়েছে'];
    }

    $host   = setting('smtp_host');
    $port   = (int)setting('smtp_port', '465');
    $secure = strtolower(setting('smtp_secure', $port === 465 ? 'ssl' : 'tls'));
    $user   = setting('smtp_user');
    $pass   = setting('smtp_pass');

    $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $ctx    = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp     = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) return [false, "SMTP সার্ভারে সংযোগ হয়নি ({$host}:{$port}) — {$errstr}"];
    stream_set_timeout($fp, 20);

    /* সার্ভারের উত্তর পড়া (বহু লাইনের উত্তরও) */
    $read = function () use ($fp): string {
        $data = '';
        while (($line = fgets($fp, 515)) !== false) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function (string $c, array $okCodes) use ($fp, $read): array {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $r = $read();
        $code = (int)substr($r, 0, 3);
        return [in_array($code, $okCodes, true), $r];
    };

    $ehloHost = parse_url(BASE_URL, PHP_URL_HOST) ?: 'localhost';
    $steps = [];
    [$ok, $r] = $cmd('', [220]);                           if (!$ok) { fclose($fp); return [false, 'সার্ভার সাড়া দেয়নি: ' . trim($r)]; }
    [$ok, $r] = $cmd('EHLO ' . $ehloHost, [250]);          if (!$ok) { fclose($fp); return [false, 'EHLO ব্যর্থ: ' . trim($r)]; }

    if ($secure === 'tls') {
        [$ok, $r] = $cmd('STARTTLS', [220]);               if (!$ok) { fclose($fp); return [false, 'STARTTLS ব্যর্থ: ' . trim($r)]; }
        if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($fp); return [false, 'TLS চালু করা যায়নি'];
        }
        [$ok, $r] = $cmd('EHLO ' . $ehloHost, [250]);      if (!$ok) { fclose($fp); return [false, 'EHLO (TLS) ব্যর্থ: ' . trim($r)]; }
    }

    [$ok, $r] = $cmd('AUTH LOGIN', [334]);                 if (!$ok) { fclose($fp); return [false, 'AUTH ব্যর্থ: ' . trim($r)]; }
    [$ok, $r] = $cmd(base64_encode($user), [334]);         if (!$ok) { fclose($fp); return [false, 'ইউজারনেম গ্রহণ হয়নি: ' . trim($r)]; }
    [$ok, $r] = $cmd(base64_encode($pass), [235]);         if (!$ok) { fclose($fp); return [false, 'পাসওয়ার্ড ভুল বা লগইন ব্যর্থ: ' . trim($r)]; }
    [$ok, $r] = $cmd('MAIL FROM:<' . $fromEmail . '>', [250]); if (!$ok) { fclose($fp); return [false, 'প্রেরক গ্রহণ হয়নি: ' . trim($r)]; }
    [$ok, $r] = $cmd('RCPT TO:<' . $to . '>', [250, 251]); if (!$ok) { fclose($fp); return [false, 'প্রাপক গ্রহণ হয়নি: ' . trim($r)]; }
    [$ok, $r] = $cmd('DATA', [354]);                       if (!$ok) { fclose($fp); return [false, 'DATA ব্যর্থ: ' . trim($r)]; }

    $msg = implode("\r\n", $headers) . "\r\n\r\n" . $body;
    $msg = preg_replace('/^\./m', '..', $msg);            // লাইনের শুরুর বিন্দু নিরাপদ করা
    [$ok, $r] = $cmd($msg . "\r\n.", [250]);               if (!$ok) { fclose($fp); return [false, 'মেইল পাঠানো যায়নি: ' . trim($r)]; }
    $cmd('QUIT', [221]);
    fclose($fp);
    return [true, ''];
}
