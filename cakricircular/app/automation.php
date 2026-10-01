<?php
/* =========================================================
   অটো-পোস্ট অটোমেশন
   সোর্স সাইটের সাইটম্যাপ দেখে নতুন পোস্ট খোঁজে → পাতা থেকে তথ্য নেয় →
   AI দিয়ে সম্পূর্ণ নিজের ভাষায় সাজিয়ে লেখে → "রিভিউ বাকি" অবস্থায় সেভ করে →
   এডমিনকে ইমেইলে জানায়। প্রকাশ হয় শুধু এডমিন অনুমোদন দিলে।
   ========================================================= */
require_once APP_ROOT . '/app/mailer.php';

const AUTO_UA = 'Mozilla/5.0 (compatible; CakriCircularBot/1.0; +https://cakricircular.com)';

/* ---------- লগ ---------- */
function auto_log(string $msg, string $level = 'info'): void
{
    try {
        q("INSERT INTO auto_log (level, msg, created_at) VALUES (?,?,NOW())", [$level, mb_substr($msg, 0, 2000)]);
        /* পুরনো লগ জমে না থাকে */
        if (mt_rand(1, 30) === 1) q("DELETE FROM auto_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
    } catch (Throwable $e) {}
    if (PHP_SAPI === 'cli') echo '[' . date('H:i:s') . "] [$level] $msg\n";
}

/* ---------- HTTP ---------- */
function auto_http(string $url, int $timeout = 20, int $maxBytes = 3000000): array
{
    /* স্ব-পরীক্ষার (self-test) সময় আসল ইন্টারনেটে যাই না — নকল উত্তর */
    if (isset($GLOBALS['__auto_mock_http']) && is_callable($GLOBALS['__auto_mock_http'])) {
        $r = ($GLOBALS['__auto_mock_http'])($url);
        return [(int)($r[0] ?? 0), (string)($r[1] ?? ''), (string)($r[2] ?? ''), (array)($r[3] ?? [])];
    }
    if (!function_exists('curl_init')) {
        $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true,
                                                 'header' => 'User-Agent: ' . AUTO_UA . "\r\n"]]);
        $b = @file_get_contents($url, false, $ctx, 0, $maxBytes);
        $code = 0; $hdr = [];
        foreach ((isset($http_response_header) ? $http_response_header : []) as $line) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})~', $line, $m)) $code = (int)$m[1];
            elseif (($p = strpos($line, ':')) !== false) $hdr[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
        }
        if ($b !== false && $code === 0) $code = 200;
        return [$code, $b === false ? '' : $b, '', $hdr];
    }
    $hdr = [];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 4,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT      => AUTO_UA,
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => true,
        /* REST API-র X-WP-TotalPages পড়ার জন্য হেডারগুলো রাখি */
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$hdr) {
            $p = strpos($line, ':');
            if ($p !== false) $hdr[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
            return strlen($line);
        },
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($body !== false && strlen($body) > $maxBytes) $body = substr($body, 0, $maxBytes);
    return [$code, $body === false ? '' : $body, $err, $hdr];
}

/* ---------- ১. নতুন পোস্ট খোঁজা: ফিড (সাথে সাথে) + সাইটম্যাপ (পুরনো বাকি) ---------- */

/* ISO সময় (UTC) — দুই উৎসের তারিখ এক রকম করে তুলনা করার জন্য */
function auto_iso($t): string
{
    $ts = is_numeric($t) ? (int)$t : strtotime((string)$t);
    return $ts ? gmdate('Y-m-d\TH:i:s', $ts) : '';
}

/* WordPress ফিড — পোস্ট প্রকাশের সাথে সাথেই এখানে আসে (সাইটম্যাপের মতো ক্যাশ হয় না) */
function auto_feed_items(array &$diag): array
{
    $base = rtrim(setting('auto_source', 'https://bdgovtjob.net'), '/');
    $out  = [];
    foreach ([$base . '/feed/', $base . '/feed/?paged=2'] as $i => $u) {
        [$code, $xml] = auto_http($u, 20, 3000000);
        if ($i === 0) $diag[] = 'ফিড: HTTP ' . $code;
        if ($code !== 200 || stripos($xml, '<item') === false) break;
        if (!preg_match_all('~<item\b[^>]*>(.*?)</item>~s', $xml, $m)) break;
        foreach ($m[1] as $b) {
            if (!preg_match('~<link>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)~', $b, $lm)) continue;
            $pub = preg_match('~<pubDate>\s*([^<]+?)\s*</pubDate>~', $b, $pm) ? auto_iso($pm[1]) : '';
            $out[trim($lm[1])] = $pub;
        }
    }
    $diag[] = 'ফিডে পোস্ট ' . count($out) . 'টি';
    return $out;
}

/* সাইটম্যাপের তালিকা (Rank Math / Yoast দুটোই) */
function auto_sitemaps(array &$diag): array
{
    $base  = rtrim(setting('auto_source', 'https://bdgovtjob.net'), '/');
    $start = setting('auto_start_date', '2026-09-22');
    $maps  = [];
    foreach (['/sitemap_index.xml', '/sitemap.xml'] as $idx) {
        [$code, $xml] = auto_http($base . $idx, 20);
        if ($code !== 200 || !preg_match_all('~<sitemap>(.*?)</sitemap>~s', $xml, $bl)) continue;
        foreach ($bl[1] as $b) {
            if (!preg_match('~<loc>\s*([^<]*post-sitemap[^<]*\.xml)\s*</loc>~i', $b, $lm)) continue;
            $mod = preg_match('~<lastmod>\s*([^<]+?)\s*</lastmod>~', $b, $mm) ? substr(auto_iso($mm[1]), 0, 10) : '';
            if ($mod !== '' && $mod < $start) continue;       /* শুরুর তারিখের পরে বদলায়নি — খোলার দরকার নেই */
            $maps[] = trim($lm[1]);
        }
        if ($maps) break;
    }
    if (!$maps) {
        $maps = [$base . '/post-sitemap1.xml', $base . '/post-sitemap2.xml', $base . '/post-sitemap.xml'];
        $diag[] = 'সাইটম্যাপ ইনডেক্স পড়া যায়নি — সরাসরি নাম দিয়ে চেষ্টা';
    }
    return array_values(array_unique($maps));
}

function auto_discover(int $limit, array &$updated): array
{
    $start = setting('auto_start_date', '2026-09-22');
    $diag  = [];

    /* আগে দেখা লিংকগুলো */
    $seen = [];
    try { $rows = all("SELECT url_hash, lastmod, post_id, fails FROM auto_seen"); }
    catch (Throwable $e) { $rows = all("SELECT url_hash, lastmod, post_id, 0 AS fails FROM auto_seen"); }
    foreach ($rows as $r) $seen[$r['url_hash']] = $r;

    /* ক) ফিড — নতুন পোস্ট সবার আগে এখানে ধরা পড়ে */
    $entries = [];                                  /* url => ['mod'=>..., 'src'=>...] */
    foreach (auto_feed_items($diag) as $u => $mod) $entries[$u] = ['mod' => $mod, 'src' => 'feed'];

    /* খ) সাইটম্যাপ — বাকি/পুরনোগুলো আর আপডেটের খবর */
    $smCount = 0;
    foreach (auto_sitemaps($diag) as $map) {
        [$code, $xml] = auto_http($map, 25, 8000000);
        if ($code !== 200 || !preg_match_all('~<url>(.*?)</url>~s', $xml, $blocks)) {
            if ($code !== 404) $diag[] = basename($map) . ': HTTP ' . $code;
            continue;
        }
        foreach ($blocks[1] as $b) {
            if (!preg_match('~<loc>\s*([^<]+?)\s*</loc>~', $b, $lm)) continue;
            $loc = html_entity_decode(trim($lm[1]), ENT_QUOTES, 'UTF-8');
            $mod = preg_match('~<lastmod>\s*([^<]+?)\s*</lastmod>~', $b, $mm) ? auto_iso($mm[1]) : '';
            $smCount++;
            /* ফিডেও থাকলে ফিডেরটাই রাখি, শুধু সাইটম্যাপের সময়টা আপডেট ধরার জন্য নিই */
            if (isset($entries[$loc])) { $entries[$loc]['smod'] = $mod; continue; }
            $entries[$loc] = ['mod' => $mod, 'src' => 'sitemap', 'smod' => $mod];
        }
    }
    $diag[] = 'সাইটম্যাপে লিংক ' . $smCount . 'টি';

    /* গ) কোনটা সত্যিই নতুন */
    $fresh = []; $old = []; $nSeen = 0;
    foreach ($entries as $loc => $e) {
        $h   = sha1($loc);
        $mod = $e['mod'];
        if (isset($seen[$h])) {
            $row = $seen[$h];
            /* একবার দেখা লিংক আর কখনো নতুন হিসেবে ধরি না — AI খরচের কোনো ঝুঁকি নেই */
            if ($row['lastmod'] === 'ALWAYS') { $nSeen++; continue; }
            if ($row['post_id']) {
                $sm = $e['smod'] ?? '';
                if ($sm !== '' && $row['lastmod'] && strlen($row['lastmod']) >= 19 && $sm > substr($row['lastmod'], 0, 19)) {
                    $updated[] = ['url' => $loc, 'lastmod' => $sm, 'post_id' => (int)$row['post_id']];
                }
                $nSeen++; continue;
            }
            if ($row['lastmod'] !== null && $row['lastmod'] !== '') { $nSeen++; continue; }   /* দেখা হয়েছে/বাদ */
            /* শুধু চেষ্টা গোনা আছে (আগে মাঝপথে থেমেছিল) */
            if ((int)$row['fails'] >= 2) {
                auto_skip_forever($loc, 'fail');
                auto_log("২ বার চেষ্টা করেও হয়নি, AI খরচ বাঁচাতে বাদ দিলাম: $loc", 'warn');
                continue;
            }
        } else {
            $day = substr($mod, 0, 10);
            if ($day !== '' && $day < $start) { $old[] = [$h, $loc, $mod]; continue; }
        }
        $fresh[] = ['url' => $loc, 'lastmod' => $mod ?: gmdate('Y-m-d\TH:i:s'), 'hash' => $h, 'src' => $e['src']];
    }

    /* শুরুর তারিখের আগের পোস্ট একবারেই "দেখা" করে রাখি */
    foreach (array_chunk($old, 200) as $chunk) {
        $ph = []; $args = [];
        foreach ($chunk as [$h, $loc, $mod]) { $ph[] = "(?,?,?,NOW())"; array_push($args, $h, mb_substr($loc, 0, 500), $mod ?: 'OLD'); }
        try {
            q("INSERT INTO auto_seen (url_hash, url, lastmod, seen_at) VALUES " . implode(',', $ph)
              . " ON DUPLICATE KEY UPDATE lastmod = COALESCE(lastmod, VALUES(lastmod))", $args);
        } catch (Throwable $e) {}
    }

    $diag[] = 'নতুন ' . count($fresh) . 'টি, আগে দেখা ' . $nSeen . 'টি';
    auto_log('উৎস যাচাই — ' . implode(' | ', $diag));

    /* পুরনো থেকে নতুন ক্রমে */
    usort($fresh, function ($a, $b) { return strcmp($a['lastmod'], $b['lastmod']); });
    return array_slice($fresh, 0, $limit);
}

function auto_mark_seen(string $url, string $lastmod, ?int $postId): void
{
    try {
        q("INSERT INTO auto_seen (url_hash, url, lastmod, post_id, seen_at) VALUES (?,?,?,?,NOW())
           ON DUPLICATE KEY UPDATE lastmod = VALUES(lastmod), post_id = COALESCE(VALUES(post_id), post_id), seen_at = NOW()",
          [sha1($url), mb_substr($url, 0, 500), $lastmod, $postId]);
    } catch (Throwable $e) {}
}

/* এই লিংক আর কখনো দেখব না (সোর্সে আপডেট হলেও) */
function auto_skip_forever(string $url, string $why = ''): void
{
    try {
        q("INSERT INTO auto_seen (url_hash, url, lastmod, note, seen_at) VALUES (?,?,'ALWAYS',?,NOW())
           ON DUPLICATE KEY UPDATE lastmod = 'ALWAYS', note = VALUES(note), seen_at = NOW()",
          [sha1($url), mb_substr($url, 0, 500), $why ?: null]);
    } catch (Throwable $e) {
        try { q("INSERT INTO auto_seen (url_hash, url, lastmod, seen_at) VALUES (?,?,'ALWAYS',NOW())
                 ON DUPLICATE KEY UPDATE lastmod = 'ALWAYS', seen_at = NOW()", [sha1($url), mb_substr($url, 0, 500)]); }
        catch (Throwable $e2) {}
    }
}

/* প্রসেস শুরুর আগেই একটি চেষ্টা গুনে রাখি।
   হোস্টিং মাঝপথে কেটে দিলে পরের রানে বোঝা যাবে, ৩ বারের পর আর সারি আটকে থাকবে না */
function auto_attempt(string $url): int
{
    try {
        q("INSERT INTO auto_seen (url_hash, url, lastmod, fails, seen_at) VALUES (?,?,NULL,1,NOW())
           ON DUPLICATE KEY UPDATE fails = fails + 1, seen_at = NOW()", [sha1($url), mb_substr($url, 0, 500)]);
        return (int)col("SELECT fails FROM auto_seen WHERE url_hash = ?", [sha1($url)]);
    } catch (Throwable $e) { return 1; }
}

/* ---------- ২. পাতা থেকে কাঁচা তথ্য ---------- */
function auto_scrape(string $url): ?array
{
    [$code, $html, $err] = auto_http($url, 25);
    if ($code !== 200 || $html === '') { auto_log("পাতা খোলা যায়নি: $url (HTTP $code $err)", 'warn'); return null; }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    $xp = new DOMXPath($dom);

    /* শিরোনাম */
    $title = '';
    $h1 = $xp->query('//h1')->item(0);
    if ($h1) $title = trim($h1->textContent);
    if ($title === '') {
        $og = $xp->query('//meta[@property="og:title"]/@content')->item(0);
        if ($og) $title = trim($og->nodeValue);
    }

    /* মূল লেখার অংশ */
    $node = null;
    foreach (['//*[contains(concat(" ",normalize-space(@class)," ")," entry-content ")]',
              '//article', '//main', '//body'] as $q) {
        $node = $xp->query($q)->item(0);
        if ($node) break;
    }
    if (!$node) return null;

    /* অপ্রয়োজনীয় অংশ বাদ */
    foreach (['.//script', './/style', './/noscript', './/nav', './/form', './/iframe', './/aside', './/footer',
              './/*[contains(@class,"share")]', './/*[contains(@class,"related")]', './/*[contains(@class,"comment")]',
              './/*[contains(@class,"adsbygoogle")]', './/*[contains(@class,"sharedaddy")]'] as $q) {
        foreach (iterator_to_array($xp->query($q, $node)) as $n) { if ($n->parentNode) $n->parentNode->removeChild($n); }
    }

    /* লিংক ও পিডিএফ */
    $links = []; $pdf = '';
    foreach ($xp->query('.//a[@href]', $node) as $a) {
        $href = trim($a->getAttribute('href'));
        if (!preg_match('~^https?://~i', $href)) continue;
        if ($pdf === '' && preg_match('~\.pdf(\?|$)~i', $href)) $pdf = $href;
        $host = parse_url($href, PHP_URL_HOST) ?: '';
        if (stripos($host, 'bdgovtjob') !== false && !preg_match('~\.pdf(\?|$)~i', $href)) continue; // সোর্সের ভেতরের লিংক বাদ
        $txt = trim(preg_replace('/\s+/u', ' ', $a->textContent));
        $links[$href] = mb_substr($txt, 0, 80);
        if (count($links) >= 15) break;
    }

    /* লাইন ভাঙা ঠিক রেখে লেখা বের করা */
    $inner = '';
    foreach ($node->childNodes as $c) $inner .= $dom->saveHTML($c);
    $inner = preg_replace('~<br\s*/?>~i', "\n", $inner);
    $inner = preg_replace('~</(p|div|li|h[1-6]|tr|table|ul|ol)>~i', "\n", $inner);
    $inner = preg_replace('~</t[dh]>~i', " | ", $inner);
    $text  = html_entity_decode(strip_tags($inner), ENT_QUOTES, 'UTF-8');
    $text  = preg_replace('/[ \t\x{00A0}]+/u', ' ', $text);
    $text  = preg_replace('/\n\s*\n+/u', "\n", $text);
    $text  = trim($text);
    if (mb_strlen($text) < 150) { auto_log("পাতায় যথেষ্ট লেখা নেই: $url", 'warn'); return null; }
    $text = mb_substr($text, 0, 9000);          /* বেশি লম্বা হলে AI অনেক সময় নেয় */

    return ['title' => $title, 'text' => $text, 'links' => $links, 'pdf' => $pdf];
}

/* ---------- ২.৫ আমাদের সাইটে আগে আছে কিনা — AI ডাকার আগেই ----------
   শিরোনামের মূল শব্দগুলো মিলিয়ে দেখি (হাতে দেওয়া পোস্টসহ)। AI শিরোনাম নতুন করে লেখে,
   তাই হুবহু মিল খুঁজি না — প্রতিষ্ঠান/পদের নামের শব্দগুলো মিললেই ধরে নিই একই পোস্ট। */
function auto_title_words(string $t): array
{
    $t = mb_strtolower(auto_en_digits($t), 'UTF-8');
    /* "অঞ্চল-১" আর "অঞ্চল-৫" আলাদা চাকরি — নম্বরটা শব্দের সাথে জুড়ে রাখি */
    $t = preg_replace('/[-‐–]\s*(\d+)/u', '$1', $t);
    $t = preg_replace('/[^\p{L}\p{M}\p{N}\s]/u', ' ', $t);
    /* এই শব্দগুলো প্রায় সব বিজ্ঞপ্তিতে থাকে — এগুলো মিললে কিছুই প্রমাণ হয় না */
    $stop = ['নিয়োগ','বিজ্ঞপ্তি','বিজ্ঞপ্তিতে','সার্কুলার','চাকরি','চাকরির','চাকুরি','প্রকাশ','প্রকাশিত','পদে','পদের','পদ',
             'জন','টি','ও','এবং','এর','এ','সহ','মোট','নতুন','আবেদন','শুরু','২০২৫','২০২৬','২০২৭','বিভিন্ন','একাধিক',
             'মন্ত্রণালয়','মন্ত্রণালয়ে','মন্ত্রণালয়ের','অধিদপ্তর','অধিদপ্তরে','অধিদপ্তরের','পরিদপ্তর','বিভাগ','বিভাগে',
             'কার্যালয়','কার্যালয়ে','কার্যালয়ের','অফিস','অফিসে','লিমিটেড','লিমিটেডে','কোম্পানি','গ্রুপ','গ্রুপে',
             'সরকারি','বেসরকারি','বিষয়ক','জেলা','প্রশাসক','প্রশাসকের','কর্পোরেশন','কর্পোরেশনে','কর্তৃপক্ষ',
             'ইনস্টিটিউট','ফাউন্ডেশন','বোর্ড','কমিশন','সংস্থা','প্রকল্প','প্রকল্পে',
             'job','jobs','circular','recruitment','notice','new','apply','online','the','of','and','in','for','bd','bangladesh','বাংলাদেশ',
             'ministry','directorate','office','limited','ltd','company','group','department','govt','government','board','project'];
    $out = [];
    foreach (preg_split('/\s+/u', $t, -1, PREG_SPLIT_NO_EMPTY) as $w) {
        if (preg_match('/^\d+$/', $w)) continue;                              // সংখ্যা/সাল বাদ
        if (in_array($w, $stop, true)) continue;
        /* বিভক্তি ছেঁটে মূল শব্দ: বাহিনীতে→বাহিনী, অধিদপ্তরের→অধিদপ্তর, মন্ত্রণালয়ে→মন্ত্রণালয় */
        /* ছোট শব্দে (কর, ঢাকা) হাত দিই না — নইলে "কর" হয়ে যেত "ক" */
        if (mb_strlen($w, 'UTF-8') > 3) $w = preg_replace('/(তে|ের|েরা|কে|য়ে|র|ে)$/u', '', $w);
        if (mb_strlen($w, 'UTF-8') < 2 || in_array($w, $stop, true)) continue;
        $out[$w] = true;
    }
    return array_keys($out);
}

/* সারসংক্ষেপ পাতা (অনেক চাকরির তালিকা, বারবার আপডেট হয়) — এগুলো কখনো আনব না */
function auto_is_roundup(string $title, string $url): bool
{
    $t = mb_strtolower($title, 'UTF-8') . ' ' . mb_strtolower(rawurldecode($url), 'UTF-8');
    $pat = ['চাকরির খবর', 'চাকুরির খবর', 'সকল নিয়োগ', 'সকল চাকরি', 'সব চাকরি', 'সাপ্তাহিক', 'আজকের চাকরি',
            'চাকরির পত্রিকা', 'জব নিউজ', 'চাকরির তালিকা', 'সরকারি চাকরির', 'বেসরকারি চাকরির',
            'weekly', 'all job', 'all-job', 'all govt', 'job news', 'jobs-news', 'chakrir-khobor', 'chakrir khobor',
            'bd govt job circular', 'govt job circular 2', 'today job', 'job-list', 'job list'];
    foreach ($pat as $p) if (mb_strpos($t, $p) !== false) return true;
    return false;
}

/* উৎসের লেখায় "আবেদনের শেষ তারিখ: ১৭ অক্টোবর ২০২৬" থাকলে সেটা বের করি — AI লাগে না */
function auto_extract_deadline(string $text): ?string
{
    $t = auto_en_digits($text);
    if (!preg_match('/(শেষ তারিখ|শেষ সময়|Deadline|Last Date|Application Deadline)\s*[:：]?\s*(.{0,70})/iu', $t, $m)) return null;
    $seg = $m[2];
    $mon = ['জানুয়ারি'=>1,'জানুয়ারী'=>1,'ফেব্রুয়ারি'=>2,'ফেব্রুয়ারী'=>2,'মার্চ'=>3,'এপ্রিল'=>4,'মে'=>5,'জুন'=>6,'জুলাই'=>7,
            'আগস্ট'=>8,'আগষ্ট'=>8,'সেপ্টেম্বর'=>9,'অক্টোবর'=>10,'নভেম্বর'=>11,'ডিসেম্বর'=>12,
            'january'=>1,'february'=>2,'march'=>3,'april'=>4,'may'=>5,'june'=>6,'july'=>7,'august'=>8,
            'september'=>9,'october'=>10,'november'=>11,'december'=>12,
            'jan'=>1,'feb'=>2,'mar'=>3,'apr'=>4,'jun'=>6,'jul'=>7,'aug'=>8,'sep'=>9,'sept'=>9,'oct'=>10,'nov'=>11,'dec'=>12];
    /* ১৭ অক্টোবর ২০২৬ / 17 October 2026 */
    if (preg_match('/(\d{1,2})\s*([\p{L}\p{M}]+)[,\s]+(\d{4})/u', $seg, $d)) {
        $k = mb_strtolower($d[2], 'UTF-8');
        if (isset($mon[$k]) && checkdate($mon[$k], (int)$d[1], (int)$d[3])) return sprintf('%04d-%02d-%02d', $d[3], $mon[$k], $d[1]);
    }
    /* ১৭/১০/২০২৬ বা ১৭-১০-২০২৬ */
    if (preg_match('/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/', $seg, $d) && checkdate((int)$d[2], (int)$d[1], (int)$d[3])) {
        return sprintf('%04d-%02d-%02d', $d[3], $d[2], $d[1]);
    }
    /* ২০২৬-১০-১৭ */
    if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $seg, $d) && checkdate((int)$d[2], (int)$d[3], (int)$d[1])) return $d[0];
    return null;
}

function auto_find_duplicate(string $srcTitle, ?string $srcDeadline = null): ?array
{
    $a = auto_title_words($srcTitle);
    if (count($a) < 2) return null;                    /* চেনার মতো শব্দ কম — ঝুঁকি না নিয়ে "নতুন" ধরি */
    $rows = all("SELECT id, title, company, deadline FROM posts
                 WHERE deleted_at IS NULL AND published_at > DATE_SUB(NOW(), INTERVAL 60 DAY)
                 ORDER BY id DESC LIMIT 400");
    foreach ($rows as $r) {
        $b = auto_title_words($r['title'] . ' ' . (string)$r['company']);
        if (!$b) continue;
        $common = count(array_intersect($a, $b));
        if ($common < 1) continue;
        $score  = $common / max(1, min(count($a), count($b)));

        /* দুই দিকেই শেষ তারিখ জানা থাকলে — সেটাই চূড়ান্ত প্রমাণ */
        if ($srcDeadline && !empty($r['deadline'])) {
            if ($srcDeadline !== $r['deadline']) continue;   /* নাম মিললেও তারিখ আলাদা — আলাদা বিজ্ঞপ্তি */
            /* একই তারিখ + মূল শব্দ মিলেছে (আমাদের পোস্টের নাম একটাই শব্দে হলে সেটাই যথেষ্ট) */
            if (($common >= 2 && $score >= 0.6) || ($common >= 1 && count($b) === 1)) return $r;
            continue;
        }
        if ($common < 2 || $score < 0.6) continue;
        /* তারিখ জানা না থাকলে আরও কড়া নিয়ম */
        if ($common >= 3 && $score >= 0.75) return $r;
        if ($common >= 2 && $score >= 0.99 && min(count($a), count($b)) <= 2) return $r;
    }
    return null;
}

/* ---------- AI-এর ত্রুটি বাংলায় ব্যাখ্যা ও সমাধানসহ ---------- */
class AutoAIError extends RuntimeException
{
    public $hint = '';
    public $fatal = false;          /* true = সেটিংস/অ্যাকাউন্টের সমস্যা, পোস্টের নয় — বাকিগুলোও হবে না, থামি */
    public function __construct(string $msg, string $hint = '', bool $fatal = false)
    {
        parent::__construct($msg);
        $this->hint = $hint; $this->fatal = $fatal;
    }
}

function auto_ai_error(int $code, string $raw, string $curlErr): AutoAIError
{
    $j    = json_decode($raw, true);
    $emsg = (string)($j['error']['message'] ?? '');
    $type = (string)($j['error']['type'] ?? '') . ' ' . (string)($j['error']['code'] ?? '');

    if ($code === 0) {
        if (stripos($curlErr, 'timed out') !== false || stripos($curlErr, 'timeout') !== false)
            return new AutoAIError('AI সময়মতো উত্তর দেয়নি', 'পোস্টটি হয়তো অনেক লম্বা। পরের রানে আবার চেষ্টা হবে — কিছু করতে হবে না।');
        return new AutoAIError('OpenAI-এর সাথে সংযোগ হয়নি', 'সার্ভারের ইন্টারনেট সংযোগে সমস্যা হতে পারে। কিছুক্ষণ পরে নিজেই চেষ্টা করবে।', true);
    }
    if ($code === 401)
        return new AutoAIError('OpenAI API key ভুল বা বাতিল', 'OpenAI ড্যাশবোর্ড থেকে নতুন key বানিয়ে অটোমেশন সেটিংসে বসিয়ে সেভ করুন।', true);
    if ($code === 429 && (stripos($type, 'insufficient_quota') !== false || stripos($emsg, 'quota') !== false || stripos($emsg, 'billing') !== false))
        return new AutoAIError('OpenAI অ্যাকাউন্টে ক্রেডিট শেষ', 'platform.openai.com → Billing-এ গিয়ে টাকা যোগ করুন। তারপর আবার চালান।', true);
    if ($code === 429)
        return new AutoAIError('OpenAI-তে অল্প সময়ে বেশি অনুরোধ গেছে', 'কিছুক্ষণ অপেক্ষা করুন — পরের রানে নিজেই চলবে।', true);
    if ($code === 404 || stripos($type, 'model_not_found') !== false || (stripos($emsg, 'model') !== false && stripos($emsg, 'exist') !== false))
        return new AutoAIError('মডেলের নাম ভুল বা এই key-তে ব্যবহারের অনুমতি নেই', 'অটোমেশন সেটিংসে "মডেলের নাম" মিলিয়ে দেখুন (যেমন gpt-5.6-luna)।', true);
    if ($code === 403)
        return new AutoAIError('এই key দিয়ে OpenAI ব্যবহারের অনুমতি নেই', 'OpenAI অ্যাকাউন্টের project/permission সেটিং দেখুন, অথবা নতুন key দিন।', true);
    if ($code === 400 && (stripos($type, 'context_length') !== false || stripos($emsg, 'context length') !== false || stripos($emsg, 'maximum context') !== false))
        return new AutoAIError('বিজ্ঞপ্তিটি AI-এর জন্য বেশি লম্বা', 'এই পোস্টটি হাতে দিতে হবে — অন্যগুলো স্বাভাবিকভাবে চলবে।');
    if ($code >= 500)
        return new AutoAIError('OpenAI-এর সার্ভারে সাময়িক সমস্যা', 'আপনার কিছু করার নেই — পরের রানে নিজেই আবার চেষ্টা করবে।', true);
    return new AutoAIError('AI ত্রুটি (HTTP ' . $code . ')' . ($emsg ? ': ' . mb_substr($emsg, 0, 140) : ''),
                           'সমস্যা থেকে গেলে এই বার্তার স্ক্রিনশট দিন।');
}

/* ---------- ৩. AI দিয়ে নিজের ভাষায় সাজানো ---------- */
function auto_system_prompt(array $catNames, array $divisions): string
{
    $cats = implode(' | ', $catNames);
    $divs = implode(' | ', $divisions);
    return <<<TXT
তুমি একজন অভিজ্ঞ বাংলা কনটেন্ট এডিটর। একটি চাকরি ও শিক্ষা-বিষয়ক বাংলা ওয়েবসাইটের জন্য পোস্ট তৈরি করো।

তোমাকে একটি বিজ্ঞপ্তির কাঁচা লেখা (অন্য সাইট থেকে সংগ্রহ) দেওয়া হবে। নিয়ম:
১. শুধু কাঁচা লেখায় থাকা তথ্য (পদের নাম, পদ সংখ্যা, প্রতিষ্ঠান, যোগ্যতা, বয়সসীমা, বেতন, আবেদনের তারিখ ও পদ্ধতি, ফি, ঠিকানা) ব্যবহার করবে।
২. মূল লেখার কোনো বাক্য হুবহু কপি করবে না — পুরোটা সম্পূর্ণ নিজের ভাষায়, সহজ ও সাবলীল বাংলায় নতুন করে লিখবে।
৩. কাঁচা লেখায় নেই এমন কোনো তথ্য অনুমান করে বানাবে না।
৪. অন্য সাইটের নাম, তাদের প্রচার, "আমাদের সাইটে চোখ রাখুন", টেলিগ্রাম/ফেসবুক গ্রুপে যোগ দিন — এ জাতীয় কিছুই লিখবে না।
৫. পদ সংখ্যা স্পষ্ট না থাকলে বা একাধিক পদে ভিন্ন সংখ্যা থাকলে "vacancy" তে মোট সংখ্যা দেবে; মোট বের করা না গেলে "একাধিক" লিখবে।
৬. "content_html" হবে সুন্দর করে সাজানো HTML — শুধু এই ট্যাগগুলো: <p> <h3> <ul> <li> <b> <table> <tr> <th> <td> <a>।
   আবেদনের লিংক বা অফিসিয়াল ওয়েবসাইট "আবেদনের নিয়ম" অংশে ক্লিকযোগ্য লিংক হিসেবে দেবে —
   <a href="পূর্ণ লিংক">সংক্ষিপ্ত ঠিকানা</a> (যেমন teletalk.com.bd)। লিংক শুধু দেওয়া তালিকা থেকে নেবে,
   অন্য সাইটের (বিশেষত যেখান থেকে লেখা নেওয়া হয়েছে) লিংক কখনো দেবে না।
   ক্রম: শুরুতে ১-২ লাইনের পরিচিতি (<p>), তারপর যা যা আছে সেই অনুযায়ী <h3> শিরোনামসহ অংশ —
   "এক নজরে", "পদের বিবরণ" (একাধিক পদ হলে <table>: পদের নাম | পদ সংখ্যা | বেতন/গ্রেড),
   "শিক্ষাগত যোগ্যতা", "বয়সসীমা", "আবেদনের নিয়ম", "আবেদন ফি", "গুরুত্বপূর্ণ তারিখ"। যে তথ্য নেই সেই অংশ বাদ দেবে।
   "এক নজরে" অংশে <ul> দিয়ে প্রতিষ্ঠান, পদ সংখ্যা, আবেদনের শুরু ও শেষ তারিখ, আবেদনের মাধ্যম।
   টেবিল শুধু তখনই দেবে যখন আলাদা আলাদা পদের নাম জানা আছে। কোনো ঘরের তথ্য না থাকলে "বিজ্ঞপ্তিতে উল্লেখিত"
   জাতীয় ফাঁকা কথা লিখবে না — সেই কলাম বাদ দেবে।
৭. ঠিক নিচের JSON কাঠামোয় উত্তর দেবে — অন্য কোনো লেখা, ব্যাখ্যা বা ```json ছাড়া:

{
  "title": "আকর্ষণীয় বাংলা শিরোনাম, প্রতিষ্ঠান ও পদসহ, ৯০ অক্ষরের মধ্যে, সাল থাকলে সাল দিয়ে",
  "category": "ঠিক এর একটি: {$cats}",
  "company": "প্রতিষ্ঠানের পূর্ণ নাম (বাংলায়), না থাকলে খালি",
  "vacancy": "মোট পদ সংখ্যা বাংলা অঙ্কে যেমন ১২৫, অস্পষ্ট হলে একাধিক",
  "division": "ঠিক এর একটি: {$divs} — নির্দিষ্ট না থাকলে সারাদেশ",
  "district": "নির্দিষ্ট জেলা থাকলে জেলার নাম, সারাদেশ হলে সারাদেশ, একাধিক জেলা হলে একাধিক",
  "salary": "বেতন/গ্রেড সংক্ষেপে যেমন ১২৫০০-৩০২৩০ টাকা বা ৯ম গ্রেড, না থাকলে খালি",
  "employment_type": "ঠিক এর একটি: FULL_TIME | PART_TIME | CONTRACTOR | TEMPORARY | INTERN",
  "application_start": "YYYY-MM-DD বা খালি",
  "deadline": "আবেদনের শেষ তারিখ YYYY-MM-DD। একাধিক শেষ তারিখ থাকলে (যেমন বিভিন্ন প্রতিষ্ঠান/পদের জন্য আলাদা) সবচেয়ে শেষের তারিখটি দেবে। না থাকলে খালি",
  "apply_url": "অনলাইন আবেদনের লিংক (দেওয়া লিংক তালিকা থেকে), না থাকলে খালি",
  "official_url": "প্রতিষ্ঠানের অফিসিয়াল ওয়েবসাইট (দেওয়া লিংক তালিকা থেকে), না থাকলে খালি",
  "content_html": "উপরের ৬ নম্বর নিয়মে সাজানো পূর্ণ বিবরণ",
  "meta_title": "৬০ অক্ষরের কম",
  "meta_description": "১৫৫ অক্ষরের কম — পদ, প্রতিষ্ঠান, পদ সংখ্যা ও শেষ তারিখ",
  "keywords": "৫-৮টি, কমা দিয়ে",
  "confidence_note": "কোনো তথ্য অস্পষ্ট বা পরস্পরবিরোধী হলে সংক্ষেপে এখানে লেখো, নাহলে খালি"
}
TXT;
}

function auto_ai(array $scr, array $catNames, array $divisions): array
{
    /* স্ব-পরীক্ষার নকল AI — আসল OpenAI-তে কখনো যায় না, টাকা খরচ হয় না */
    if (isset($GLOBALS['__auto_mock_ai']) && is_callable($GLOBALS['__auto_mock_ai'])) return ($GLOBALS['__auto_mock_ai'])($scr);
    if (!empty($GLOBALS['__auto_test'])) throw new AutoAIError('স্ব-পরীক্ষায় আসল AI ডাকা নিষেধ', '', true);

    $key   = trim(setting('auto_openai_key', ''));
    $model = trim(setting('auto_model', 'gpt-5.6-luna')) ?: 'gpt-5.6-luna';
    if ($key === '') throw new AutoAIError('OpenAI API key সেট করা হয়নি', 'অটোমেশন সেটিংসে OpenAI API key বসিয়ে সেভ করুন।', true);

    $linkList = '';
    foreach ($scr['links'] as $u => $t) $linkList .= "- $t: $u\n";

    $user = "উৎসের শিরোনাম: {$scr['title']}\n\n"
          . "লেখায় থাকা লিংকগুলো:\n" . ($linkList ?: "- (নেই)\n")
          . "\nনিচের কাঁচা লেখা থেকে JSON বানাও:\n---\n{$scr['text']}\n---";

    $payload = [
        'model'    => $model,
        'messages' => [
            ['role' => 'system', 'content' => auto_system_prompt($catNames, $divisions)],
            ['role' => 'user',   'content' => $user],
        ],
        'response_format'       => ['type' => 'json_object'],
        /* নতুন মডেলগুলো আগে "চিন্তা" করে — এই কাজে বেশি চিন্তা লাগে না, দ্রুত হয় */
        'reasoning_effort'      => 'low',
        'max_completion_tokens' => 7000,
    ];

    $call = function (array $payload) use ($key): array {
        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_TIMEOUT        => 110,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Authorization: Bearer ' . $key],
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
        $raw  = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        return [$code, (string)$raw, $err];
    };

    [$code, $raw, $err] = $call($payload);
    /* কোনো মডেল বাড়তি সেটিং না মানলে সেটা বাদ দিয়ে আবার চেষ্টা (সর্বোচ্চ ৩ বার) */
    for ($k = 0; $k < 3 && $code === 400; $k++) {
        $dropped = false;
        foreach (['reasoning_effort', 'max_completion_tokens', 'response_format'] as $opt) {
            if (isset($payload[$opt]) && stripos($raw, $opt) !== false) { unset($payload[$opt]); $dropped = true; }
        }
        if (!$dropped) break;
        [$code, $raw, $err] = $call($payload);
    }
    if ($code !== 200) throw auto_ai_error($code, $raw, $err);

    $resp = json_decode($raw, true);
    $txt  = trim((string)($resp['choices'][0]['message']['content'] ?? ''));
    $txt  = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', $txt);
    $data = json_decode($txt, true);
    $finish = (string)($resp['choices'][0]['finish_reason'] ?? '');
    if (!is_array($data) || empty($data['title'])) {
        if ($finish === 'length') throw new AutoAIError('AI-এর লেখা মাঝপথে কেটে গেছে (বেশি লম্বা)', 'পরের রানে আবার চেষ্টা হবে; বারবার হলে পোস্টটি হাতে দিন।');
        throw new AutoAIError('AI-এর উত্তর বোঝা যায়নি', 'সাধারণত একবারের সমস্যা — পরের রানে আবার চেষ্টা হবে।');
    }
    /* কত টোকেন খরচ হলো — লগে দেখানোর জন্য */
    $data['_usage'] = is_array($resp['usage'] ?? null) ? $resp['usage'] : [];
    $data['_model'] = $model;
    return $data;
}

/* ---------- ৪. সাইটের ঘরে গুছিয়ে সেভ ---------- */
function auto_bn_digits(string $s): string
{
    return strtr($s, ['0'=>'০','1'=>'১','2'=>'২','3'=>'৩','4'=>'৪','5'=>'৫','6'=>'৬','7'=>'৭','8'=>'৮','9'=>'৯']);
}
function auto_en_digits(string $s): string
{
    return strtr($s, ['০'=>'0','১'=>'1','২'=>'2','৩'=>'3','৪'=>'4','৫'=>'5','৬'=>'6','৭'=>'7','৮'=>'8','৯'=>'9']);
}
function auto_date(string $d): ?string
{
    /* একাধিক তারিখ এলে (যেমন "2026-09-24, 2026-10-07") সবচেয়ে শেষেরটি নিই */
    $d = auto_en_digits($d);
    if (!preg_match_all('/(\d{4})-(\d{2})-(\d{2})/', $d, $mm, PREG_SET_ORDER)) return null;
    $best = null;
    foreach ($mm as $m) {
        if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) continue;
        if ($best === null || $m[0] > $best) $best = $m[0];
    }
    return $best;
}
function auto_url(string $u): string
{
    $u = trim($u);
    return (preg_match('~^https?://~i', $u) && filter_var($u, FILTER_VALIDATE_URL)) ? mb_substr($u, 0, 500) : '';
}

/* posts টেবিলে কোনো কলাম আছে কিনা (নতুন কলাম না থাকলেও যেন সেভ ভাঙে না) */
function auto_posts_has_col(string $c): bool
{
    static $cols = null;
    if ($cols === null) {
        $cols = [];
        try { foreach (all("SHOW COLUMNS FROM posts") as $r) $cols[strtolower($r['Field'])] = true; } catch (Throwable $e) {}
    }
    return isset($cols[strtolower($c)]);
}

/* AI-এর উত্তর থেকে পোস্টের ঘরগুলো গুছিয়ে নেওয়া — নতুন পোস্ট ও খসড়া আপডেট দুটোতেই লাগে */
function auto_post_fields(array $ai, array $cats, array $divisions): ?array
{
    /* ক্যাটাগরি মেলানো — নামে না মিললে চাকরি */
    $catId = 0; $catSlug = '';
    $want  = trim((string)($ai['category'] ?? ''));
    foreach ($cats as $c) if ($c['name'] === $want) { $catId = (int)$c['id']; $catSlug = $c['slug']; break; }
    if (!$catId) foreach ($cats as $c) if ($want !== '' && mb_strpos($want, $c['name']) !== false) { $catId = (int)$c['id']; $catSlug = $c['slug']; break; }
    if (!$catId) foreach ($cats as $c) if (in_array($c['slug'], ['chakri', 'job'], true)) { $catId = (int)$c['id']; $catSlug = $c['slug']; break; }
    if (!$catId && $cats) { $catId = (int)$cats[0]['id']; $catSlug = $cats[0]['slug']; }

    $title = mb_substr(trim(strip_tags((string)($ai['title'] ?? ''))), 0, 250);
    if ($title === '') return null;

    $division = trim((string)($ai['division'] ?? ''));
    if (!in_array($division, $divisions, true)) $division = 'সারাদেশ';

    $vacancy = trim(auto_bn_digits(auto_en_digits((string)($ai['vacancy'] ?? ''))));
    if ($vacancy === '' || $vacancy === '০' || mb_stripos($vacancy, 'অনির্দিষ্ট') !== false) $vacancy = 'একাধিক';
    $vacancy = mb_substr($vacancy, 0, 30);

    $etype = strtoupper(trim((string)($ai['employment_type'] ?? 'FULL_TIME')));
    if (!in_array($etype, ['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN'], true)) $etype = 'FULL_TIME';

    $content = (string)($ai['content_html'] ?? '');
    $content = preg_replace('#<(script|style|iframe)\b[^>]*>.*?</\1>#is', '', $content);
    /* সোর্স সাইটের লিংক থাকলে সেটা লিংক না রেখে শুধু লেখা রাখি */
    $content = preg_replace('#<a\b[^>]*href="[^"]*bdgovtjob[^"]*"[^>]*>(.*?)</a>#is', '$1', $content);
    /* বাকি লিংক নতুন ট্যাবে খুলবে */
    $content = preg_replace_callback('#<a\b([^>]*)>#i', function ($m) {
        $a = preg_replace('#\s(target|rel)="[^"]*"#i', '', $m[1]);
        return '<a' . $a . ' target="_blank" rel="nofollow noopener">';
    }, $content);

    return [
        'cat_id'            => $catId,
        'cat_slug'          => $catSlug,
        'title'             => $title,
        'content'           => $content,
        'division'          => $division,
        'district'          => mb_substr(trim((string)($ai['district'] ?? '')), 0, 60) ?: null,
        'vacancy'           => $vacancy,
        'salary'            => mb_substr(trim((string)($ai['salary'] ?? '')), 0, 100) ?: null,
        'company'           => mb_substr(trim((string)($ai['company'] ?? '')), 0, 160) ?: null,
        'employment_type'   => $etype,
        'deadline'          => auto_date((string)($ai['deadline'] ?? '')),
        'application_start' => auto_date((string)($ai['application_start'] ?? '')),
        'is_job'            => in_array($catSlug, ['chakri', 'job', 'chakri-circular', 'chakrir-khobor'], true) ? 1 : 0,
        'keywords'          => mb_substr(trim((string)($ai['keywords'] ?? '')), 0, 300) ?: null,
        'meta_title'        => mb_substr(trim((string)($ai['meta_title'] ?? '')), 0, 190) ?: null,
        'meta_desc'         => mb_substr(trim((string)($ai['meta_description'] ?? '')), 0, 300) ?: null,
        'note'              => trim((string)($ai['confidence_note'] ?? '')),
    ];
}

/* আবেদন/অফিসিয়াল লিংক আর পিডিএফ */
function auto_save_links(int $id, array $ai, array $scr, bool $replace = false): void
{
    if ($replace) { try { q("DELETE FROM post_links WHERE post_id = ?", [$id]); } catch (Throwable $e) {} }
    $order = 0;
    if ($u = auto_url((string)($ai['apply_url'] ?? ''))) {
        q("INSERT INTO post_links (post_id, label, url, is_apply, sort_order) VALUES (?,?,?,1,?)", [$id, 'অনলাইনে আবেদন করুন', $u, $order++]);
    }
    if ($u = auto_url((string)($ai['official_url'] ?? ''))) {
        q("INSERT INTO post_links (post_id, label, url, is_apply, sort_order) VALUES (?,?,?,0,?)", [$id, 'অফিসিয়াল ওয়েবসাইট', $u, $order++]);
    }

    /* মূল বিজ্ঞপ্তির পিডিএফ (থাকলে, আর আগে থেকে না থাকলে) */
    if (!empty($scr['pdf']) && !col("SELECT pdf FROM posts WHERE id = ?", [$id])) {
        [$code, $bin] = auto_http($scr['pdf'], 25, 10 * 1024 * 1024);
        if ($code === 200 && strncmp($bin, '%PDF', 4) === 0) {
            @mkdir(UPLOAD_PATH . '/pdf', 0755, true);
            $name = 'auto-' . $id . '-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.pdf';
            if (@file_put_contents(UPLOAD_PATH . '/pdf/' . $name, $bin) !== false) {
                q("UPDATE posts SET pdf = ? WHERE id = ?", [$name, $id]);
            }
        } else {
            auto_log("পিডিএফ নামানো যায়নি: {$scr['pdf']}", 'warn');
        }
    }
}

/* নতুন খসড়া পোস্ট (রিভিউ বাকি) — কখনো নিজে প্রকাশ হয় না।
   আগের মতো এখানে AI লেখার পরে পোস্ট ফেলে দিই না (টাকা তো খরচ হয়েই গেছে) —
   মিল পেলে শুধু নোট দিই, সিদ্ধান্ত এডমিনের।
   $opt: note => বাড়তি নোট, skip_guard => মিল খোঁজা বাদ */
function auto_save(array $ai, array $scr, string $srcUrl, string $lastmod, array $cats, array $divisions, array $opt = []): ?int
{
    $f = auto_post_fields($ai, $cats, $divisions);
    if (!$f) return null;

    $notes = [];
    if ($f['note'] !== '') $notes[] = $f['note'];
    if (!empty($opt['note'])) $notes[] = (string)$opt['note'];
    if (empty($opt['skip_guard']) && function_exists('auto_sp_match_my_post')) {
        try {
            $m = auto_sp_match_my_post($f['title']);
            if ($m) $notes[] = "সম্ভাব্য ডুপ্লিকেট: #{$m['id']} «" . mb_substr($m['title'], 0, 60) . "» — প্রকাশের আগে মিলিয়ে দেখুন।";
        } catch (Throwable $e) {}
    }

    $cols = ['cat_id', 'title', 'slug', 'content', 'division', 'district', 'vacancy', 'salary', 'company', 'employment_type',
             'deadline', 'is_job', 'keywords', 'meta_title', 'meta_desc', 'status',
             'is_auto', 'review_pending', 'source_url', 'source_lastmod', 'auto_note'];
    $vals = [$f['cat_id'], $f['title'], next_cat_slug($f['cat_id'], $f['title']), $f['content'], $f['division'], $f['district'],
             $f['vacancy'], $f['salary'], $f['company'], $f['employment_type'], $f['deadline'], $f['is_job'],
             $f['keywords'], $f['meta_title'], $f['meta_desc'], 0,
             1, 1, mb_substr($srcUrl, 0, 500), $lastmod, $notes ? implode("\n", $notes) : null];
    if (auto_posts_has_col('application_start')) { $cols[] = 'application_start'; $vals[] = $f['application_start']; }

    /* প্রকাশ/হালনাগাদের সময় আগের মতোই ডেটাবেজের NOW() — বাংলাদেশ সময় */
    q("INSERT INTO posts (" . implode(',', $cols) . ", published_at, updated_at) VALUES ("
      . implode(',', array_fill(0, count($cols), '?')) . ", NOW(), NOW())", $vals);
    $id = (int)db()->lastInsertId();
    if ($id <= 0) return null;

    auto_save_links($id, $ai, $scr);
    return $id;
}

/* এখনো খসড়া (প্রকাশ হয়নি) এমন পোস্টের লেখা নতুন করে বসানো — সোর্সে আপডেট হলে "আপডেট করুন" চাপলে।
   প্রকাশিত পোস্ট এখানে কখনো আসে না (WHERE status = 0), স্লাগও বদলায় না। */
function auto_update_post(int $postId, array $ai, array $scr, string $lastmod, array $cats, array $divisions): bool
{
    $f = auto_post_fields($ai, $cats, $divisions);
    if (!$f) return false;
    $note = "[" . date('d/m H:i') . "] সোর্সে আপডেট হওয়ায় লেখা নতুন করে তৈরি হয়েছে — প্রকাশের আগে দেখুন।"
          . ($f['note'] !== '' ? "\n" . $f['note'] : '');
    $set  = ['title = ?', 'content = ?', 'division = ?', 'district = ?', 'vacancy = ?', 'salary = ?', 'company = ?',
             'employment_type = ?', 'deadline = ?', 'keywords = ?', 'meta_title = ?', 'meta_desc = ?',
             'updated_at = NOW()', 'review_pending = 1', 'source_lastmod = ?', "auto_note = CONCAT(COALESCE(auto_note,''), ?)"];
    $vals = [$f['title'], $f['content'], $f['division'], $f['district'], $f['vacancy'], $f['salary'], $f['company'],
             $f['employment_type'], $f['deadline'], $f['keywords'], $f['meta_title'], $f['meta_desc'], $lastmod, "\n" . $note];
    if (auto_posts_has_col('application_start')) { $set[] = 'application_start = ?'; $vals[] = $f['application_start']; }
    $vals[] = $postId;
    $n = q("UPDATE posts SET " . implode(', ', $set) . " WHERE id = ? AND status = 0 AND deleted_at IS NULL", $vals)->rowCount();
    if ($n < 1) return false;
    auto_save_links($postId, $ai, $scr, true);
    return true;
}

/* ---------- ৫. এডমিনকে ইমেইল ---------- */
function auto_notify(array $ids): void
{
    if (!$ids) return;
    $to = trim(setting('auto_notify_email', 'support.cakricircular@gmail.com'));
    if ($to === '') return;

    $site = setting('site_name', 'চাকরি সার্কুলার');
    $in   = implode(',', array_fill(0, count($ids), '?'));
    $rows = all("SELECT id, title, company, vacancy, deadline, meta_desc, auto_note FROM posts WHERE id IN ($in) ORDER BY id", $ids);

    /* প্রতিটি পোস্টের জন্য আলাদা মেইল — ইনবক্সে সবগুলো আলাদা করে সামনে থাকবে */
    foreach ($rows as $i => $r) {
        if ($i > 0) sleep(1);
        $edit = url(setting('admin_slug', DEFAULT_ADMIN_SLUG) . '/post?id=' . (int)$r['id']);

        $meta = [];
        if ($r['company'])  $meta[] = e($r['company']);
        if ($r['vacancy'])  $meta[] = 'পদ: ' . e($r['vacancy']);
        if ($r['deadline']) $meta[] = 'শেষ: ' . e(auto_bn_digits(date('d/m/Y', strtotime($r['deadline']))));

        $html = '<div style="font-family:Hind Siliguri,Arial,sans-serif;background:#f3f7f6;padding:18px">'
              . '<div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #e4eae8;border-radius:14px;overflow:hidden">'
              . '<div style="background:#0f766e;color:#fff;padding:12px 16px;font-size:13px;font-weight:700">🤖 নতুন পোস্ট রিভিউর অপেক্ষায়</div>'
              . '<div style="padding:16px">'
              . '<div style="font-weight:700;font-size:16px;color:#13211f;line-height:1.5;margin-bottom:6px">' . e($r['title']) . '</div>'
              . ($meta ? '<div style="font-size:12.5px;color:#64757a;margin-bottom:10px">' . implode(' · ', $meta) . '</div>' : '')
              . ($r['meta_desc'] ? '<div style="font-size:13.5px;color:#33443f;line-height:1.65">' . e($r['meta_desc']) . '</div>' : '')
              . ($r['auto_note'] ? '<div style="margin-top:10px;font-size:12.5px;color:#8a5a08;background:#fff7e8;border-radius:8px;padding:7px 10px">⚠️ যাচাই করুন: ' . e($r['auto_note']) . '</div>' : '')
              . '<a href="' . e($edit) . '" style="display:inline-block;margin-top:14px;background:#0f766e;color:#fff;text-decoration:none;'
              . 'border-radius:999px;padding:9px 18px;font-weight:700;font-size:13.5px">রিভিউ করে প্রকাশ করুন</a>'
              . '</div></div>'
              . '<p style="text-align:center;font-size:11.5px;color:#94a3a0;margin-top:10px">' . e($site) . ' — স্বয়ংক্রিয় বার্তা</p></div>';

        /* বিষয়ে শিরোনামটাই — ইনবক্সে দেখেই বোঝা যাবে */
        [$ok, $why] = send_mail($to, '🆕 ' . mb_substr($r['title'], 0, 90), $html);
        auto_log($ok ? "ইমেইল গেছে: #{$r['id']}" : "ইমেইল যায়নি (#{$r['id']}): $why", $ok ? 'info' : 'error');
    }
}

function auto_short_url(string $u): string
{
    $p = parse_url($u);
    return ($p['host'] ?? '') . mb_substr(rawurldecode($p['path'] ?? ''), 0, 50);
}

/* শেষ রানের বিস্তারিত — এডমিন পাতায় দেখানোর জন্য জমা রাখি */
function auto_save_detail(array $sum): void
{
    $sum['events'] = array_slice($sum['events'] ?? [], 0, 15);
    $sum['at'] = date('Y-m-d H:i:s');
    set_setting('auto_last_detail', json_encode($sum, JSON_UNESCAPED_UNICODE));
}

/* সত্যিই কোনো রান চলছে কিনা (তালা কেউ ধরে আছে কিনা) */
function auto_lock_path(): string { return sys_get_temp_dir() . '/cc_auto_' . md5(APP_ROOT) . '.lock'; }
function auto_is_running(): bool
{
    $f = @fopen(auto_lock_path(), 'c');
    if (!$f) return false;
    $free = flock($f, LOCK_EX | LOCK_NB);
    if ($free) flock($f, LOCK_UN);
    fclose($f);
    if (!$free) return true;
    /* ডেটাবেজ তালাও দেখি (v61) */
    return function_exists('auto_sp_db_lock_free') && !auto_sp_db_lock_free();
}

/* ---------- পুরনো প্রক্রিয়া (v60, URL/সাইটম্যাপ ভিত্তিক) — আর ডাকা হয় না, দরকারে ফিরে যাওয়ার জন্য রাখা ----------
   নতুন প্রক্রিয়া: app/automation_sp.php → auto_sp_run() */
function auto_run_v60(bool $manual = false, int $limitOverride = 0): array
{
    $sum = ['found' => 0, 'created' => 0, 'skipped' => 0, 'failed' => 0, 'updated' => 0, 'msg' => '',
            'events' => [], 'stop' => '', 'hint' => '', 'fatal' => false];
    /* ঘটনা যোগ করার ছোট সাহায্যকারী — নিচের "শেষ রানের ফলাফল" এ দেখাবে */
    $ev = function (string $type, string $text, string $hint = '') use (&$sum) {
        $sum['events'][] = ['type' => $type, 'text' => $text, 'hint' => $hint];
    };

    if (!$manual && setting('auto_enabled', '0') !== '1') { $sum['msg'] = $sum['stop'] = 'অটোমেশন বন্ধ আছে'; return $sum; }
    if (trim(setting('auto_openai_key', '')) === '') {
        $sum['msg'] = $sum['stop'] = 'OpenAI API key সেট করা হয়নি';
        $sum['hint'] = 'অটোমেশন সেটিংসে key বসিয়ে সেভ করুন।'; $sum['fatal'] = true;
        auto_log($sum['msg'], 'error');
        auto_save_detail($sum);
        return $sum;
    }
    if (!function_exists('curl_init')) {
        $sum['msg'] = $sum['stop'] = 'সার্ভারে cURL নেই'; $sum['hint'] = 'hPanel → PHP Configuration-এ curl এক্সটেনশন চালু করুন।'; $sum['fatal'] = true;
        auto_log($sum['msg'], 'error'); auto_save_detail($sum); return $sum;
    }

    /* একসাথে দুবার চললে ডুপ্লিকেট হয় — তালা দিই */
    $lock = @fopen(auto_lock_path(), 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
        $sum['msg'] = $sum['stop'] = 'আগের রান এখনো চলছে'; $sum['hint'] = 'একটু পরে আবার চেষ্টা করুন।'; return $sum;
    }
    register_shutdown_function(function () use ($lock) {
        if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
    });

    /* হঠাৎ থেমে গেলে (সময়সীমা/মেমরি) কারণটা লগে রেখে যাই — নইলে কিছুই বোঝা যেত না */
    $GLOBALS['__auto_stage'] = 'শুরু';
    register_shutdown_function(function () {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE], true)) {
            $why = $err['message'];
            if (stripos($why, 'Maximum execution time') !== false) $why = 'হোস্টিংয়ের সময়সীমা পেরিয়ে গেছে';
            elseif (stripos($why, 'memory') !== false)             $why = 'মেমরি শেষ';
            auto_log('হঠাৎ থেমে গেছে (' . ($GLOBALS['__auto_stage'] ?? '') . '): ' . mb_substr($why, 0, 200), 'error');
        }
    });

    /* চলার সময় লগইন সেশন আটকে রাখলে একই ব্রাউজারে অন্য কোনো পাতা খোলে না — আগেই ছেড়ে দিই */
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    @set_time_limit(300);
    ignore_user_abort(true);
    $lim = (int)ini_get('max_execution_time');
    auto_log(($manual ? 'হাতে চালানো শুরু' : 'নির্ধারিত রান শুরু') . ($lim > 0 ? " (সার্ভারের সময়সীমা {$lim} সেকেন্ড)" : ''));

    $cats      = all("SELECT id, name, slug FROM categories ORDER BY sort_order, id");
    $catNames  = array_column($cats, 'name');
    $divisions = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'সারাদেশ'];
    $limit     = $limitOverride > 0 ? $limitOverride : max(1, min(5, (int)setting('auto_batch', '1')));

    $updated = [];
    $GLOBALS['__auto_stage'] = 'সাইটম্যাপ পড়া';
    $t0 = microtime(true);
    $list = auto_discover(max(8, $limit * 4), $updated);
    $sum['found'] = count($list);
    auto_log('সাইটম্যাপ পড়া শেষ (' . round(microtime(true) - $t0) . ' সেকেন্ড) — যাচাইয়ের অপেক্ষায় ' . count($list) . 'টি');

    /* আগে আনা পোস্ট সোর্সে বদলালে শুধু জানিয়ে রাখি, নতুন পোস্ট বানাই না */
    foreach ($updated as $u) {
        auto_mark_seen($u['url'], $u['lastmod'], $u['post_id']);
        q("UPDATE posts SET auto_note = CONCAT(COALESCE(auto_note,''), ?) WHERE id = ?",
          ["\n[" . date('d/m H:i') . "] সোর্সে পোস্টটি আপডেট হয়েছে — মিলিয়ে দেখুন।", $u['post_id']]);
        $sum['updated']++;
    }
    if ($sum['updated']) auto_log("সোর্সে আপডেট হয়েছে {$sum['updated']}টি পুরনো পোস্ট — নোট যোগ করা হলো");

    $newIds = []; $checked = 0;
    foreach ($list as $i => $it) {
        /* এই রানের কোটা (নতুন পোস্ট) পূর্ণ হলে থামি */
        if ($sum['created'] >= $limit) break;
        /* একবারে বেশি পাতা ঘাঁটব না — সোর্স ও আমাদের সার্ভার দুটোরই সুবিধা */
        if (++$checked > 8) break;
        if ($checked > 1) sleep(2);
        $url = $it['url'];

        /* ১) একই উৎস আগেই আনা হয়েছে */
        if ($prev = one("SELECT id, title FROM posts WHERE source_url = ? LIMIT 1", [$url])) {
            auto_mark_seen($url, $it['lastmod'], null);
            $sum['skipped']++;
            $ev('skip', 'আগেই আনা হয়েছে — বাদ: ' . mb_substr($prev['title'], 0, 70));
            continue;
        }

        $GLOBALS['__auto_stage'] = 'পাতা পড়া';
        $scr = auto_scrape($url);
        if (!$scr) {                                                          // পাতা খোলেনি — AI খরচ হয়নি
            auto_attempt($url); $sum['failed']++;
            $ev('fail', 'উৎসের পাতা খোলা যায়নি: ' . auto_short_url($url), 'পরের রানে আবার চেষ্টা হবে। দুবার না হলে বাদ পড়বে।');
            continue;
        }

        /* ২ক) সারসংক্ষেপ/তালিকা পাতা — এগুলোতে অনেক চাকরি, বারবার আপডেট হয়; কখনো নয় */
        if (auto_is_roundup($scr['title'], $url)) {
            auto_skip_forever($url, 'roundup');
            auto_log('সারসংক্ষেপ পাতা, চিরতরে বাদ: ' . mb_substr($scr['title'], 0, 70));
            $sum['skipped']++;
            $ev('skip', 'সারসংক্ষেপ/তালিকা পাতা — চিরতরে বাদ: ' . mb_substr($scr['title'], 0, 70),
                'এ ধরনের পাতায় অন্য চাকরিগুলোর সারাংশ থাকে, তাই আনলে ডুপ্লিকেট হয়।');
            continue;
        }

        /* ২) আমাদের সাইটে একই পোস্ট আগে থেকেই আছে (হাতে দেওয়াসহ) — AI ডাকব না
              শিরোনাম দিয়ে, আর না মিললে লেখার শুরুর অংশ দিয়েও মেলাই */
        $srcDeadline = auto_extract_deadline($scr['text']);
        $dup = auto_find_duplicate($scr['title'], $srcDeadline);
        if ($dup) {
            auto_skip_forever($url, 'dup');
            auto_log("আগে থেকেই আছে (#{$dup['id']} " . mb_substr($dup['title'], 0, 60) . ")"
                     . ($srcDeadline && !empty($dup['deadline']) ? " — শেষ তারিখও একই ($srcDeadline)" : '') . " — AI ছাড়াই বাদ");
            $sum['skipped']++;
            $ev('skip', 'সাইটে আগে থেকেই আছে — বাদ দিয়ে পরেরটা খুঁজেছে: ' . mb_substr($dup['title'], 0, 70),
                'মিলেছে: ' . mb_substr($scr['title'], 0, 70));
            continue;
        }

        /* ৩) নিশ্চিত নতুন পোস্ট — এখনই শুধু AI ডাকি */
        $try = auto_attempt($url);
        auto_log("নতুন পোস্ট পাওয়া গেছে, AI লিখছে (চেষ্টা $try/2): " . mb_substr($scr['title'], 0, 80));
        try {
            $GLOBALS['__auto_stage'] = 'AI লিখছে';
            $t1 = microtime(true);
            $ai = auto_ai($scr, $catNames, $divisions);
            auto_log('AI লেখা শেষ (' . round(microtime(true) - $t1) . ' সেকেন্ড)');
        } catch (Throwable $e) {
            $hint  = $e instanceof AutoAIError ? $e->hint : 'পরের রানে আবার চেষ্টা হবে।';
            $fatal = $e instanceof AutoAIError && $e->fatal;
            auto_log('AI: ' . $e->getMessage() . ($hint ? " — সমাধান: $hint" : ''), 'error');
            $sum['failed']++;
            $ev($fatal ? 'stop' : 'fail', 'AI সমস্যা: ' . $e->getMessage() . ' (' . mb_substr($scr['title'], 0, 50) . ')', $hint);
            /* সেটিংস/অ্যাকাউন্টের সমস্যা হলে পোস্টের দোষ নয় — গুনব না, বাকিগুলোও হবে না বলে থামি */
            if ($fatal) {
                try { q("UPDATE auto_seen SET fails = GREATEST(fails - 1, 0) WHERE url_hash = ?", [sha1($url)]); } catch (Throwable $e2) {}
                $sum['stop'] = 'AI সমস্যার কারণে থামানো হয়েছে: ' . $e->getMessage();
                $sum['hint'] = $hint; $sum['fatal'] = true;
                break;
            }
            continue;
        }

        try {
            $GLOBALS['__auto_stage'] = 'সেভ ও পিডিএফ';
            $id = auto_save($ai, $scr, $url, $it['lastmod'], $cats, $divisions);
        } catch (Throwable $e) {
            auto_log('সেভ ব্যর্থ: ' . $e->getMessage() . " — $url", 'error');
            $sum['failed']++;
            $ev('fail', 'সাইটে সেভ করা যায়নি: ' . mb_substr($scr['title'], 0, 60), 'ডেটাবেজের সমস্যা — বার্তাটির স্ক্রিনশট দিন: ' . mb_substr($e->getMessage(), 0, 120));
            continue;
        }

        if ($id === null) { $sum['failed']++; $ev('fail', 'AI শিরোনাম দেয়নি — বাদ: ' . mb_substr($scr['title'], 0, 60)); continue; }
        if ($id < 0)     {
            auto_skip_forever($url, 'dup'); $sum['skipped']++;
            $ev('skip', 'AI লেখার পর মিলিয়ে দেখা গেছে সাইটে আগে থেকেই আছে — সেভ করা হয়নি', mb_substr($scr['title'], 0, 70));
            continue;
        }

        auto_mark_seen($url, $it['lastmod'], $id);
        try { q("UPDATE auto_seen SET fails = 0 WHERE url_hash = ?", [sha1($url)]); } catch (Throwable $e) {}
        $newIds[] = $id;
        $sum['created']++;
        auto_log("নতুন পোস্ট তৈরি (রিভিউ বাকি): #$id — " . mb_substr($ai['title'], 0, 80));
        $ev('new', 'নতুন পোস্ট তৈরি: ' . mb_substr($ai['title'], 0, 80));
    }

    /* কেন থামল — এক লাইনে */
    if ($sum['stop'] === '') {
        if (!$list)                              $sum['stop'] = 'নতুন কোনো পোস্ট নেই — সব আনা হয়ে গেছে';
        elseif ($sum['created'] >= $limit)        $sum['stop'] = 'এই রানের কাজ শেষ (' . $limit . 'টি নতুন পোস্ট) — বাকিগুলো পরের রানে';
        elseif ($checked > 8)                     $sum['stop'] = 'একবারে ৮টির বেশি পাতা দেখা হয় না — বাকিগুলো পরের রানে';
        else                                      $sum['stop'] = 'যাচাইয়ের মতো আর কোনো পোস্ট নেই';
    }

    if ($newIds) { bump_ver(); auto_notify($newIds); }

    $sum['msg'] = "পাওয়া গেছে {$sum['found']}, নতুন {$sum['created']}, বাদ {$sum['skipped']}, ব্যর্থ {$sum['failed']}";
    auto_log('রান শেষ — ' . $sum['msg']);
    set_setting('auto_last_run', date('Y-m-d H:i:s'));
    set_setting('auto_last_sum', $sum['msg']);
    auto_save_detail($sum);

    return $sum;
}

/* ---------- নতুন প্রক্রিয়া: সোর্স পোস্ট ID ধরে (WordPress REST API) ---------- */
require_once __DIR__ . '/automation_sp.php';

function auto_run(bool $manual = false, int $limitOverride = 0): array
{
    return auto_sp_run($manual, $limitOverride);
}
