<?php
/* =========================================================
   অটোমেশন v61 — সোর্স পোস্টের ID ধরে কাজ (WordPress REST API)

   কেন: সোর্স সাইট পুরনো পোস্ট প্রতিদিন আবার সেভ করে, এমনকি প্রকাশের তারিখও বদলে দেয়।
   তাই URL/তারিখ দেখে নতুন-পুরনো বোঝা যায় না। প্রতিটি পোস্টের একটা স্থায়ী ID আছে —
   সেটাই আমাদের চাবি।

   মূল নিয়ম:
   ১. প্রথম রান = বেসলাইন: সোর্সের সব পোস্ট শুধু তালিকায় ওঠে, AI একবারও ডাকা হয় না।
   ২. তালিকায় নেই এমন ID = "নতুন" — কোনো তারিখের শর্ত নেই। শুধু এগুলোই AI পর্যন্ত যেতে পারে।
      (সোর্স পুরনো পোস্টের তারিখ বদলালেও ID একই থাকে, তাই পুরনো পোস্ট কখনো "নতুন" হয় না।)
   ৩. চেনা ID-র প্রকাশের তারিখ এগিয়ে গেলে = সোর্স ওই পুরনো পাতায় নতুন বিজ্ঞপ্তি দিয়েছে (এটাই ওদের
      সাধারণ নিয়ম, যেমন "bcs-circular" পাতায় প্রতি বছরের বিসিএস)। তখন আবার সারিতে তোলা হয়:
      লেখা একই → AI নয়; আমাদের আগের পোস্টের সাথে তথ্য এক → AI নয়; তথ্য আলাদা → নতুন পোস্ট।
      মেয়াদ শেষ হয়ে যাওয়া বিজ্ঞপ্তি → AI নয়।
      শুধু modified বদলালে (তারিখ একই) — লেখা সত্যিই বদলালে "সোর্সে আপডেট" তালিকায়, এডমিন ঠিক করে।
   ৪. শিরোনাম আমাদের কোনো পোস্টের সাথে মিললে: পদ সংখ্যা / আবেদন শুরু / শেষ তারিখ মেলাই।
      সব এক → ডুপ্লিকেট; কোনোটা আলাদা → নতুন; বোঝা না গেলে → রিভিউ (AI নয়)।
      প্রতিষ্ঠানের নাম বা আবেদনের লিংক কখনো ডুপ্লিকেটের চাবি নয়।
   ৫. একই পোস্টে দুবার AI নয়: সারা রানে তালা + প্রতিটি পোস্ট "processing" করে দখল।
   ৬. দিনে সর্বোচ্চ AI কল (সেটিং), প্রতি রানে সীমা, ৩ বার ব্যর্থ হলে থামে ও মেইল।
   ৭. খসড়া সত্যিই সেভ হওয়ার পরেই "done"। প্রকাশ কখনো নিজে হয় না।
   ========================================================= */

const AUTO_SP_PER_PAGE     = 50;   /* REST তালিকার প্রতি পাতায় পোস্ট */
const AUTO_SP_SCAN_PAGES   = 3;    /* প্রতি রানে নতুন/বদলানো খুঁজতে সর্বোচ্চ কত পাতা */
const AUTO_SP_MAX_DETAIL   = 6;    /* প্রতি রানে "বদলেছে কিনা" যাচাইয়ে সর্বোচ্চ কত পোস্ট খুলব */
const AUTO_SP_MAX_CHECKS   = 8;    /* প্রতি রানে সর্বোচ্চ কতটি পোস্ট প্রসেস (AI ছাড়া সিদ্ধান্তসহ) */
const AUTO_SP_MAX_TRIES    = 3;    /* ব্যর্থ হলে সর্বোচ্চ কতবার চেষ্টা */
const AUTO_SP_STALE_MIN    = 10;   /* এর বেশি মিনিট "processing" আটকে থাকলে ছেড়ে দিই */
const AUTO_SP_SIMILAR      = 0.85; /* শিরোনাম কতটা মিললে "একই" ধরে বাকি তথ্য মেলাব */

/* ---------- ছোট সাহায্যকারী ---------- */

/* সেটিং — স্ব-পরীক্ষার সময় আলাদা মান বসানো যায় */
function auto_sp_setting(string $k, string $default = ''): string
{
    if (isset($GLOBALS['__auto_test_set'][$k])) return (string)$GLOBALS['__auto_test_set'][$k];
    return setting($k, $default);
}

/* চলমান অবস্থা (বেসলাইন কোথায় থামল ইত্যাদি) — সরাসরি ডেটাবেজ থেকে, ক্যাশ নয় */
function auto_sp_state(string $k): array
{
    try { $v = col("SELECT v FROM settings WHERE k = ?", [$k]); } catch (Throwable $e) { $v = null; }
    $j = $v ? json_decode((string)$v, true) : null;
    return is_array($j) ? $j : [];
}
function auto_sp_state_set(string $k, array $v): void
{
    try { set_setting($k, json_encode($v, JSON_UNESCAPED_UNICODE)); } catch (Throwable $e) {}
}

function auto_sp_base(): string { return rtrim(auto_sp_setting('auto_source', 'https://bdgovtjob.net'), '/'); }
function auto_sp_cap(): int     { return max(1, min(200, (int)auto_sp_setting('auto_daily_cap', '10'))); }
function auto_sp_start(): string
{
    $d = auto_sp_setting('auto_start_date', '2026-09-22');
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : '2026-09-22';
}

/* সোর্সে একটার পর একটা অনুরোধের মাঝে বিরতি — সোর্সের সার্ভারে চাপ না পড়ে */
function auto_sp_throttle(): void
{
    static $last = 0.0;
    if (!empty($GLOBALS['__auto_test'])) return;
    $gap = microtime(true) - $last;
    if ($last > 0 && $gap < 1.5) usleep((int)((1.5 - $gap) * 1000000));
    $last = microtime(true);
}

/* WordPress তারিখ "2026-09-24T17:15:59" → "2026-09-24 17:15:59" */
function auto_sp_dt($v): ?string
{
    $v = trim((string)$v);
    if (!preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/', $v, $m)) return null;
    return $m[1] . ' ' . $m[2];
}

function auto_sp_plain(string $html): string
{
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/u', ' ', $t));
}

/* লিংক মেলানোর জন্য একই রকম করা: ডিকোড, ছোট হাতের, শেষের / ছাড়া, http/https একই */
function auto_sp_norm_link(string $u): string
{
    $u = mb_strtolower(rawurldecode(trim($u)), 'UTF-8');
    $u = preg_replace('~^https?://(www\.)?~', '', $u);
    return rtrim(preg_replace('~[?#].*$~', '', $u), '/');
}

/* শিরোনাম তুলনার জন্য: ছোট হাতের, বাংলা অঙ্ক → ইংরেজি, যতিচিহ্ন বাদ, একটা করে ফাঁকা */
function auto_sp_norm_title(string $t): string
{
    $t = mb_strtolower(auto_en_digits(auto_sp_plain($t)), 'UTF-8');
    $t = preg_replace('/[^\p{L}\p{M}\p{N}]+/u', ' ', $t);
    return mb_substr(trim(preg_replace('/\s+/u', ' ', $t)), 0, 500);
}

function auto_sp_chars(string $s): array
{
    return function_exists('mb_str_split') ? mb_str_split($s, 1, 'UTF-8') : preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
}

/* দুই শিরোনাম কতটা এক (০-১) — অক্ষর ধরে, বাংলাতেও ঠিক (PHP-র similar_text বাংলায় বাইট গোনে, তাই নিজেরটা) */
function auto_sp_similarity(string $a, string $b): float
{
    if ($a === '' || $b === '') return 0.0;
    if ($a === $b) return 1.0;
    $x = auto_sp_chars(mb_substr($a, 0, 220));
    $y = auto_sp_chars(mb_substr($b, 0, 220));
    $n = count($x); $m = count($y); $max = max($n, $m);
    if ($max === 0 || min($n, $m) / $max < AUTO_SP_SIMILAR) return 0.0;      /* দৈর্ঘ্যেই এত পার্থক্য — ৮৫% হতেই পারে না */
    $prev = range(0, $m);
    for ($i = 1; $i <= $n; $i++) {
        $cur = [$i];
        $best = $i;
        for ($j = 1; $j <= $m; $j++) {
            $cost  = ($x[$i - 1] === $y[$j - 1]) ? 0 : 1;
            $cur[$j] = min($prev[$j] + 1, $cur[$j - 1] + 1, $prev[$j - 1] + $cost);
            if ($cur[$j] < $best) $best = $cur[$j];
        }
        if ($best / $max > 1 - AUTO_SP_SIMILAR) return 0.0;                   /* আর মেলার সম্ভাবনা নেই — আগেই থামি */
        $prev = $cur;
    }
    return 1 - $prev[$m] / $max;
}

/* ---------- সিদ্ধান্তের খাতা + লগ ---------- */
function auto_sp_decide(int $sid, string $decision, string $reason, string $level = 'info'): void
{
    try {
        q("INSERT INTO source_decisions (source_id, decision, reason, created_at) VALUES (?,?,?,NOW())",
          [$sid, $decision, mb_substr($reason, 0, 500)]);
        if (mt_rand(1, 50) === 1) q("DELETE FROM source_decisions WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)");
    } catch (Throwable $e) {}
    auto_log("[সোর্স #$sid] $reason", $level);
}

/* আজ কতবার AI ডাকা হয়েছে (ব্যর্থসহ — টাকা তো খরচ হয়েছে) */
function auto_sp_ai_used_today(): int
{
    try { return (int)col("SELECT COUNT(*) FROM source_decisions WHERE decision = 'ai_call' AND created_at >= CURDATE()"); }
    catch (Throwable $e) { return 0; }
}

/* ---------- তালা ---------- */
function auto_sp_lock_name(): string { return 'cc_auto_' . substr(md5((defined('DB_NAME') ? DB_NAME : '') . APP_ROOT), 0, 16); }

/* ডেটাবেজ তালা — প্রক্রিয়া মরে গেলে MySQL নিজেই ছেড়ে দেয়, তাই কখনো চিরতরে আটকে থাকে না */
function auto_sp_db_lock(): bool
{
    try { return (int)col("SELECT GET_LOCK(?, 0)", [auto_sp_lock_name()]) === 1; }
    catch (Throwable $e) { return true; }            /* এই সুবিধা না থাকলে ফাইল-তালাই ভরসা */
}
function auto_sp_db_unlock(): void
{
    try { q("SELECT RELEASE_LOCK(?)", [auto_sp_lock_name()]); } catch (Throwable $e) {}
}
function auto_sp_db_lock_free(): bool
{
    try { return (int)col("SELECT IS_FREE_LOCK(?)", [auto_sp_lock_name()]) === 1; }
    catch (Throwable $e) { return true; }
}

/* একটি সোর্স পোস্ট দখল — শর্তসাপেক্ষ UPDATE, তাই একসাথে দুজন চাইলেও মাত্র একজন পাবে */
function auto_sp_claim(int $sid, string $fromStatus): bool
{
    try {
        return q("UPDATE source_posts SET status = 'processing', prev_status = ?, updated_at = NOW()
                  WHERE source_id = ? AND status = ?", [$fromStatus, $sid, $fromStatus])->rowCount() === 1;
    } catch (Throwable $e) { return false; }
}

/* ১০ মিনিটের বেশি "processing" আটকে থাকলে (হোস্টিং মাঝপথে কেটে দিলে) — ব্যর্থ হিসেবে ছেড়ে দিই */
function auto_sp_release_stale(): void
{
    try {
        $rows = all("SELECT source_id FROM source_posts WHERE status = 'processing'
                     AND updated_at < DATE_SUB(NOW(), INTERVAL " . AUTO_SP_STALE_MIN . " MINUTE)");
        foreach ($rows as $r) {
            q("UPDATE source_posts SET status = 'failed', note = ?, updated_at = NOW() WHERE source_id = ? AND status = 'processing'",
              ['মাঝপথে থেমে গিয়েছিল — আবার চেষ্টা হবে', $r['source_id']]);
            auto_sp_decide((int)$r['source_id'], 'stale', AUTO_SP_STALE_MIN . ' মিনিটের বেশি আটকে ছিল, ছেড়ে দেওয়া হলো', 'warn');
        }
    } catch (Throwable $e) {}
}

/* ---------- সোর্স থেকে আনা (AI ছাড়া, সস্তা) ---------- */

/* একটি অনুরোধ — সর্বোচ্চ ২ বার আবার চেষ্টা। ফেরত: [code, body, headers, err] */
function auto_sp_get(string $url, int $timeout = 20): array
{
    $last = [0, '', [], ''];
    for ($i = 0; $i < 3; $i++) {
        auto_sp_throttle();
        $r = auto_http($url, $timeout, 8000000);
        $last = [(int)$r[0], (string)$r[1], (array)($r[3] ?? []), (string)($r[2] ?? '')];
        if ($last[0] === 200) return $last;
        if ($last[0] >= 400 && $last[0] < 500 && $last[0] !== 429) break;   /* 403/404/400 — আবার চেয়ে লাভ নেই */
    }
    return $last;
}

/* পোস্টের তালিকা (শুধু ID/তারিখ/শিরোনাম — লেখা নয়)। ব্যর্থ হলে null, কারণ $GLOBALS['__auto_sp_err']-এ */
function auto_sp_list(int $page, string $orderby = 'date'): ?array
{
    $url = auto_sp_base() . '/wp-json/wp/v2/posts?per_page=' . AUTO_SP_PER_PAGE . '&page=' . $page
         . '&orderby=' . ($orderby === 'modified' ? 'modified' : 'date') . '&order=desc&_fields=id,date,modified,link,slug,title';
    [$code, $body, $h, $err] = auto_sp_get($url);
    /* শেষ পাতার পরে WordPress 400 দেয় — এটা ভুল নয়, তালিকা শেষ */
    if ($code === 400 && $page > 1 && stripos($body, 'invalid_page') !== false) return ['items' => [], 'pages' => $page - 1, 'total' => 0];
    if ($code !== 200) { $GLOBALS['__auto_sp_err'] = "HTTP $code" . ($err ? " ($err)" : ''); return null; }
    $j = json_decode($body, true);
    if (!is_array($j)) { $GLOBALS['__auto_sp_err'] = 'উত্তর JSON নয় (সম্ভবত কোনো নিরাপত্তা-পাতা)'; return null; }
    $items = [];
    foreach ($j as $p) {
        if (!is_array($p) || empty($p['id'])) continue;
        $items[] = [
            'id'       => (int)$p['id'],
            'date'     => auto_sp_dt($p['date'] ?? '') ?? date('Y-m-d H:i:s'),
            'modified' => auto_sp_dt($p['modified'] ?? '') ?? auto_sp_dt($p['date'] ?? '') ?? date('Y-m-d H:i:s'),
            'link'     => (string)($p['link'] ?? ''),
            'slug'     => rawurldecode((string)($p['slug'] ?? '')),
            'title'    => auto_sp_plain((string)($p['title']['rendered'] ?? '')),
        ];
    }
    $pages = (int)($h['x-wp-totalpages'] ?? 0);
    return ['items' => $items, 'pages' => $pages > 0 ? $pages : ($items ? $page + 1 : $page), 'total' => (int)($h['x-wp-total'] ?? 0)];
}

/* একটি পোস্টের পূর্ণ লেখা — শুধু দরকারি পোস্টের জন্য */
function auto_sp_detail(int $id): ?array
{
    $url = auto_sp_base() . '/wp-json/wp/v2/posts/' . $id . '?_fields=id,title,content,date,modified,link,categories';
    [$code, $body, , $err] = auto_sp_get($url, 25);
    if ($code !== 200) { $GLOBALS['__auto_sp_err'] = "HTTP $code" . ($err ? " ($err)" : ''); return null; }
    $p = json_decode($body, true);
    if (!is_array($p) || empty($p['id'])) { $GLOBALS['__auto_sp_err'] = 'উত্তর JSON নয়'; return null; }
    return [
        'id'       => (int)$p['id'],
        'title'    => auto_sp_plain((string)($p['title']['rendered'] ?? '')),
        'html'     => (string)($p['content']['rendered'] ?? ''),
        'date'     => auto_sp_dt($p['date'] ?? ''),
        'modified' => auto_sp_dt($p['modified'] ?? ''),
        'link'     => (string)($p['link'] ?? ''),
    ];
}

/* REST-এর HTML থেকে পরিষ্কার লেখা + লিংক + পিডিএফ + লেখার "আঙুলের ছাপ" (hash)।
   রেটিং তারকা, "সর্বশেষ আপডেট" ব্যাজ, শেয়ার, সূচিপত্র, সংশ্লিষ্ট পোস্ট, কমিউনিটি বোতাম বাদ —
   এগুলো সোর্স রোজ বদলায়, রাখলে একই লেখাকেও "বদলেছে" মনে হতো। */
function auto_sp_parse(string $html, string $title): ?array
{
    if (trim($html) === '') return null;
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8"><div id="__sp_root">' . $html . '</div>');
    libxml_clear_errors();
    $xp   = new DOMXPath($dom);
    $root = $xp->query('//*[@id="__sp_root"]')->item(0);
    if (!$root) return null;

    /* পিডিএফ আগে খুঁজি (পিডিএফ ভিউয়ারটা পরে বাদ যাবে) */
    $pdf = '';
    foreach ($xp->query('.//*[@data-url] | .//a[@href]', $root) as $n) {
        $u = trim($n->getAttribute('data-url') ?: $n->getAttribute('href'));
        if (preg_match('~^https?://~i', $u) && preg_match('~\.pdf(\?|$)~i', $u)) { $pdf = $u; break; }
    }

    $drop = ['.//script', './/style', './/noscript', './/iframe', './/form', './/nav', './/footer', './/aside',
             './/button', './/svg', './/img', './/input'];
    foreach (['kk-star', 'kksr', 'share', 'related', 'comment', 'adsbygoogle', 'sharedaddy', 'jc-trust-badge', 'jc-toc',
              'jc-community', 'jc-category-hub', 'jc-smart-cat', 'ppv', 'rating', 'post-views', 'view-count', 'counter',
              'social', 'telegram', 'whatsapp'] as $c) {
        $drop[] = './/*[contains(concat(" ", normalize-space(@class), " "), " ' . $c . '") or contains(@class, "' . $c . '-")]';
    }
    $drop[] = './/*[@id="related-categories" or @id="table-of-contents"]';
    foreach ($drop as $q) {
        foreach (iterator_to_array($xp->query($q, $root)) as $n) { if ($n->parentNode) $n->parentNode->removeChild($n); }
    }

    /* বাইরের লিংক (আবেদন/অফিসিয়াল) — সোর্সের নিজের লিংক বাদ */
    $links = [];
    $srcHost = parse_url(auto_sp_base(), PHP_URL_HOST) ?: 'bdgovtjob';
    foreach ($xp->query('.//a[@href]', $root) as $a) {
        $href = trim($a->getAttribute('href'));
        if (!preg_match('~^https?://~i', $href)) continue;
        $host = parse_url($href, PHP_URL_HOST) ?: '';
        if ((stripos($host, 'bdgovtjob') !== false || stripos($host, $srcHost) !== false) && !preg_match('~\.pdf(\?|$)~i', $href)) continue;
        $links[$href] = mb_substr(trim(preg_replace('/\s+/u', ' ', $a->textContent)), 0, 80);
        if (count($links) >= 15) break;
    }

    /* লাইন ভাঙা ঠিক রেখে লেখা */
    $inner = '';
    foreach ($root->childNodes as $c) $inner .= $dom->saveHTML($c);
    $inner = preg_replace('~<br\s*/?>~i', "\n", $inner);
    $inner = preg_replace('~</(p|div|li|h[1-6]|tr|table|ul|ol|section|details|summary)>~i', "\n", $inner);
    $inner = preg_replace('~</t[dh]>~i', " | ", $inner);
    $text  = html_entity_decode(strip_tags($inner), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text  = preg_replace('/[ \t\x{00A0}]+/u', ' ', $text);
    $text  = preg_replace('/\s*\n\s*/u', "\n", $text);
    $text  = trim(preg_replace('/\n{2,}/u', "\n", $text));

    /* আঙুলের ছাপ — ফাঁকা জায়গা/অঙ্কের ধরন বদলালেও একই থাকে */
    $hash = md5(preg_replace('/\s+/u', ' ', mb_strtolower(auto_en_digits($text), 'UTF-8')));

    return [
        'title' => $title,
        'text'  => mb_substr($text, 0, 9000),     /* AI-এর টোকেন বাঁচাতে */
        'full'  => $text,
        'links' => $links,
        'pdf'   => $pdf,
        'hash'  => $hash,
        'short' => mb_strlen($text) < 150,
    ];
}

/* ---------- ডুপ্লিকেট মেলানো (AI ছাড়া) ---------- */

/* বাংলা/ইংরেজি তারিখ অংশ → YYYY-MM-DD */
function auto_sp_parse_date(string $seg): ?string
{
    $seg = auto_en_digits($seg);
    $mon = ['জানুয়ারি' => 1, 'জানুয়ারী' => 1, 'জানুয়ারি' => 1, 'ফেব্রুয়ারি' => 2, 'ফেব্রুয়ারী' => 2, 'ফেব্রুয়ারি' => 2,
            'মার্চ' => 3, 'এপ্রিল' => 4, 'মে' => 5, 'জুন' => 6, 'জুলাই' => 7, 'আগস্ট' => 8, 'আগষ্ট' => 8,
            'সেপ্টেম্বর' => 9, 'অক্টোবর' => 10, 'নভেম্বর' => 11, 'ডিসেম্বর' => 12,
            'january' => 1, 'february' => 2, 'march' => 3, 'april' => 4, 'may' => 5, 'june' => 6, 'july' => 7, 'august' => 8,
            'september' => 9, 'october' => 10, 'november' => 11, 'december' => 12,
            'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9, 'sept' => 9,
            'oct' => 10, 'nov' => 11, 'dec' => 12];
    if (preg_match('/(\d{1,2})\s*([\p{L}\p{M}]+)[,\s]+(\d{4})/u', $seg, $d)) {
        $k = mb_strtolower($d[2], 'UTF-8');
        if (isset($mon[$k]) && checkdate($mon[$k], (int)$d[1], (int)$d[3])) return sprintf('%04d-%02d-%02d', $d[3], $mon[$k], $d[1]);
    }
    if (preg_match('/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/', $seg, $d) && checkdate((int)$d[2], (int)$d[1], (int)$d[3])) {
        return sprintf('%04d-%02d-%02d', $d[3], $d[2], $d[1]);
    }
    if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $seg, $d) && checkdate((int)$d[2], (int)$d[3], (int)$d[1])) return $d[0];
    return null;
}

/* "লেবেল | তারিখ" ধরনের জায়গা থেকে তারিখ (যেখানে প্রথম পাওয়া যায়) */
function auto_sp_label_date(string $text, string $labels): ?string
{
    $t = auto_en_digits($text);
    /* লেবেলের পরের ৭০ অক্ষরের মধ্যে প্রথম তারিখ ("শেষ তারিখ | ২৫ অক্টোবর ২০২৬" বা "শেষ তারিখ: ২৫/১০/২০২৬") */
    if (!preg_match_all('/(?:' . $labels . ')(.{0,70})/iu', $t, $mm, PREG_SET_ORDER)) return null;
    foreach ($mm as $m) { if ($d = auto_sp_parse_date($m[1])) return $d; }
    return null;
}

/* "সময়" দুইভাবে লেখা হয় (য় একক অক্ষর বা য + নুক্তা) — দুটোই ধরি */
function auto_sp_somoy(): string { return 'সম(?:\x{09DF}|\x{09AF}\x{09BC})'; }

function auto_sp_deadline(string $text): ?string
{
    return auto_sp_label_date($text, 'আবেদনের\s*শেষ\s*(?:তারিখ|' . auto_sp_somoy() . ')|শেষ\s*তারিখ|Application\s*Deadline|Deadline|Last\s*Date');
}
function auto_sp_appstart(string $text): ?string
{
    return auto_sp_label_date($text, 'আবেদন\s*শুরুর\s*(?:তারিখ|' . auto_sp_somoy() . ')|শুরুর\s*তারিখ|Application\s*Start(?:\s*Date)?|Start\s*Date');
}

/* পদ সংখ্যা — আগে শিরোনামে ("১৬ পদে"), না পেলে লেখায় ("মোট শূন্যপদ | ৫০০০ জন") */
function auto_sp_vacancy(string $title, string $text): ?int
{
    $t = auto_en_digits($title);
    if (preg_match('/(\d[\d,]*)\s*(?:টি\s*)?(?:পদে|পদের)/u', $t, $m)) {
        $n = (int)str_replace(',', '', $m[1]);
        if ($n > 0 && $n < 200000) return $n;
    }
    $x = auto_en_digits($text);
    if (preg_match('/(?:মোট\s*(?:শূন্য\s*পদ|পদ\s*সংখ্যা|পদসংখ্যা|পদ)|Total\s*(?:Vacanc(?:y|ies)|Posts?))[^\d\n]{0,12}(\d[\d,]*)/iu', $x, $m)) {
        $n = (int)str_replace(',', '', $m[1]);
        if ($n > 0 && $n < 200000) return $n;
    }
    return null;
}

/* আমাদের পোস্টের পদ সংখ্যা ("৫০০০" / "একাধিক") → সংখ্যা বা null */
function auto_sp_int($v): ?int
{
    $v = auto_en_digits((string)$v);
    if (!preg_match('/\d[\d,]*/', $v, $m)) return null;
    $n = (int)str_replace(',', '', $m[0]);
    return $n > 0 ? $n : null;
}

/* শিরোনাম আমাদের কোনো পোস্টের সাথে মেলে কিনা — আমাদের পোস্টের শিরোনাম, আর যেসব সোর্স-পোস্ট থেকে
   আমরা পোস্ট বানিয়েছি তাদের মূল শিরোনামও দেখি (AI শিরোনাম নতুন করে লেখে বলে)।
   হুবহু মিল বা ৮৫%+ মিল। ফেরত: আমাদের পোস্ট (id, title, vacancy, deadline, application_start) + score */
function auto_sp_match_my_post(string $title, int $excludeSid = 0): ?array
{
    $n = auto_sp_norm_title($title);
    if (mb_strlen($n) < 8) return null;
    $hasStart = auto_posts_has_col('application_start');
    $fields = 'id, title, vacancy, deadline' . ($hasStart ? ', application_start' : ', NULL AS application_start');

    /* প্রতিবার নতুন করে পড়ি — এই রানেই বানানো খসড়াও যেন মেলে */
    $mine = [];
    foreach (all("SELECT $fields FROM posts WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1500") as $r) {
        $r['_n'] = auto_sp_norm_title((string)$r['title']);
        $mine[] = $r;
    }
    $srcRows = [];
    try {
        $srcRows = all("SELECT source_id, title_norm, my_post_id FROM source_posts
                        WHERE my_post_id IS NOT NULL AND title_norm IS NOT NULL ORDER BY updated_at DESC LIMIT 3000");
    } catch (Throwable $e) {}

    $best = null; $bestS = 0.0; $via = '';
    foreach ($mine as $r) {
        $s = $r['_n'] === $n ? 1.0 : auto_sp_similarity($n, $r['_n']);
        if ($s >= AUTO_SP_SIMILAR && $s > $bestS) { $best = $r; $bestS = $s; $via = 'আমাদের পোস্টের শিরোনাম'; if ($s >= 1.0) break; }
    }
    if ($bestS < 1.0) {
        foreach ($srcRows as $r) {
            if ((int)$r['source_id'] === $excludeSid) continue;
            $s = $r['title_norm'] === $n ? 1.0 : auto_sp_similarity($n, (string)$r['title_norm']);
            if ($s >= AUTO_SP_SIMILAR && $s > $bestS) {
                $p = one("SELECT $fields FROM posts WHERE id = ? AND deleted_at IS NULL", [(int)$r['my_post_id']]);
                if ($p) { $best = $p; $bestS = $s; $via = 'আগে আনা সোর্স-পোস্টের শিরোনাম'; if ($s >= 1.0) break; }
            }
        }
    }
    if (!$best) return null;
    unset($best['_n']);
    return $best + ['score' => $bestS, 'via' => $via];
}

/* শিরোনাম মেলার পর — পদ সংখ্যা, আবেদন শুরু, শেষ তারিখ মেলাই।
   ফেরত: ['result' => dup|new|unknown, 'why' => বাংলা কারণ] */
function auto_sp_compare(array $src, array $post): array
{
    $pairs = [
        'পদ সংখ্যা'   => [$src['vacancy'],  auto_sp_int($post['vacancy'] ?? null)],
        'আবেদন শুরু'  => [$src['start'],    !empty($post['application_start']) ? (string)$post['application_start'] : null],
        'শেষ তারিখ'   => [$src['deadline'], !empty($post['deadline']) ? (string)$post['deadline'] : null],
    ];
    $same = []; $diff = [];
    foreach ($pairs as $label => [$a, $b]) {
        if ($a === null || $b === null) continue;                       /* এক দিকে জানা নেই — তুলনা হয় না */
        if ((string)$a === (string)$b) $same[] = $label;
        else $diff[] = "$label আলাদা (সোর্স: " . auto_bn_digits((string)$a) . ", আমাদের: " . auto_bn_digits((string)$b) . ")";
    }
    if ($diff)             return ['result' => 'new', 'why' => implode('; ', $diff)];
    /* অন্তত দুটো তথ্য মিললে তবেই নিশ্চিত ডুপ্লিকেট — একটা মাত্র মিললে ঝুঁকি নিই না */
    if (count($same) >= 2) return ['result' => 'dup', 'why' => implode(', ', $same) . ' — সব এক'];
    if ($same)             return ['result' => 'unknown', 'why' => 'শুধু ' . $same[0] . ' মিলেছে — নিশ্চিত হওয়ার মতো যথেষ্ট তথ্য নেই'];
    return ['result' => 'unknown', 'why' => 'পদ সংখ্যা বা তারিখ কোনোটাই দুই দিকে পাওয়া যায়নি'];
}

/* আমাদের পোস্টগুলোর source_url → id (বেসলাইনে আগের সিস্টেমে বানানো পোস্ট যুক্ত করার জন্য) */
function auto_sp_source_url_map(): array
{
    $map = [];
    try {
        foreach (all("SELECT id, source_url FROM posts WHERE source_url IS NOT NULL AND source_url <> '' AND deleted_at IS NULL") as $r) {
            $map[auto_sp_norm_link((string)$r['source_url'])] = (int)$r['id'];
        }
    } catch (Throwable $e) {}
    return $map;
}

/* ---------- ১. বেসলাইন: সব পোস্ট শুধু তালিকায় তোলা, AI নয় ---------- */
function auto_sp_baseline(float $t0, int $budget, array &$sum, callable $ev): array
{
    $st   = auto_sp_state('auto_sp_base');
    $page = max(1, (int)($st['page'] ?? 1));
    $cnt  = (int)($st['count'] ?? 0);
    $map  = auto_sp_source_url_map();
    auto_log("বেসলাইন চলছে — পাতা $page থেকে (সোর্সের সব পোস্ট শুধু তালিকায় উঠছে, AI ডাকা হবে না)");

    while (true) {
        if (microtime(true) - $t0 > $budget) {
            auto_sp_state_set('auto_sp_base', ['page' => $page, 'pages' => (int)($st['pages'] ?? 0), 'count' => $cnt, 'done' => 0]);
            return ['done' => false, 'why' => 'সময় শেষ — পরের রানে পাতা ' . $page . ' থেকে চলবে'];
        }
        $L = auto_sp_list($page, 'date');
        if ($L === null) {
            auto_sp_state_set('auto_sp_base', ['page' => $page, 'pages' => (int)($st['pages'] ?? 0), 'count' => $cnt, 'done' => 0]);
            return ['done' => false, 'why' => 'সোর্সের REST API সাড়া দেয়নি (' . ($GLOBALS['__auto_sp_err'] ?? '') . ')', 'error' => true];
        }
        if (!$L['items']) break;
        foreach ($L['items'] as $it) {
            $linked = $map[auto_sp_norm_link($it['link'])] ?? null;
            try {
                $n = q("INSERT IGNORE INTO source_posts (source_id, slug, source_link, title_raw, title_norm, source_date, source_modified,
                                                         status, my_post_id, note, created_at, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())",
                       [$it['id'], mb_substr($it['slug'], 0, 200), mb_substr($it['link'], 0, 500), mb_substr($it['title'], 0, 500),
                        auto_sp_norm_title($it['title']), $it['date'], $it['modified'],
                        $linked ? 'done' : 'baseline', $linked,
                        $linked ? 'আগের সিস্টেমে তৈরি পোস্টের সাথে যুক্ত' : null])->rowCount();
                $cnt += $n;
            } catch (Throwable $e) {}
        }
        $st['pages'] = (int)$L['pages'];
        $page++;
        auto_sp_state_set('auto_sp_base', ['page' => $page, 'pages' => $st['pages'], 'count' => $cnt, 'done' => 0]);
        if ($st['pages'] > 0 && $page > $st['pages']) break;
    }
    auto_sp_state_set('auto_sp_base', ['page' => $page, 'pages' => (int)($st['pages'] ?? 0), 'count' => $cnt, 'done' => 1,
                                       'at' => date('Y-m-d H:i:s')]);
    $sum['baseline'] = $cnt;
    $ev('skip', 'বেসলাইন সম্পূর্ণ: সোর্সের ' . bn($cnt) . 'টি পোস্ট তালিকায় উঠেছে — AI একবারও ডাকা হয়নি',
        'এখন থেকে শুধু এর পরে আসা নতুন পোস্টই AI পর্যন্ত যাবে।');
    auto_log("বেসলাইন সম্পূর্ণ — {$cnt}টি পোস্ট, AI কল ০");
    return ['done' => true];
}

/* ---------- ২. নতুন ও বদলানো পোস্ট খোঁজা (AI নয়) ---------- */
function auto_sp_discover(array &$sum, callable $ev): bool
{
    $check = [];                                       /* আমাদের পোস্ট আছে এমন, সোর্সে বদলেছে — লেখা মিলিয়ে দেখব */

    foreach (['date', 'modified'] as $ob) {
        for ($page = 1; $page <= AUTO_SP_SCAN_PAGES; $page++) {
            $L = auto_sp_list($page, $ob);
            if ($L === null) {
                if ($page === 1 && $ob === 'date') return false;
                break;
            }
            if (!$L['items']) break;

            $ids  = array_column($L['items'], 'id');
            $rows = [];
            foreach (all("SELECT source_id, status, source_date, source_modified, content_hash, my_post_id FROM source_posts
                          WHERE source_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ")", $ids) as $r) {
                $rows[(int)$r['source_id']] = $r;
            }

            $changed = 0;
            foreach ($L['items'] as $it) {
                $r = $rows[$it['id']] ?? null;

                /* ক) একেবারে অচেনা ID — বেসলাইনের পরে সোর্সে এসেছে, মানে সত্যিই নতুন (তারিখ দেখি না) */
                if (!$r) {
                    try {
                        $n = q("INSERT IGNORE INTO source_posts (source_id, slug, source_link, title_raw, title_norm, source_date,
                                                                 source_modified, status, created_at, updated_at)
                                VALUES (?,?,?,?,?,?,?,'new',NOW(),NOW())",
                               [$it['id'], mb_substr($it['slug'], 0, 200), mb_substr($it['link'], 0, 500), mb_substr($it['title'], 0, 500),
                                auto_sp_norm_title($it['title']), $it['date'], $it['modified']])->rowCount();
                    } catch (Throwable $e) { $n = 0; }
                    if ($n) {
                        $sum['new']++; $changed++;
                        auto_sp_decide($it['id'], 'new', 'নতুন পোস্ট পাওয়া গেছে: ' . mb_substr($it['title'], 0, 90));
                    }
                    continue;
                }

                /* খ) চেনা ID, কিন্তু প্রকাশের তারিখ এগিয়েছে — সোর্স এই পাতায় নতুন বিজ্ঞপ্তি দিয়েছে। আবার সারিতে। */
                $oldDate = strtotime((string)$r['source_date']) ?: 0;
                if (strtotime($it['date']) - $oldDate > 3600 && !in_array($r['status'], ['new', 'processing'], true)) {
                    try {
                        $n = q("UPDATE source_posts SET prev_status = status, status = 'new', source_date = ?, source_modified = ?,
                                       title_raw = ?, title_norm = ?, approved = 0, tries = 0, job = 'create',
                                       note = 'সোর্সে নতুন করে প্রকাশ (তারিখ এগিয়েছে)', updated_at = NOW()
                                WHERE source_id = ? AND status NOT IN ('new','processing')",
                               [$it['date'], $it['modified'], mb_substr($it['title'], 0, 500), auto_sp_norm_title($it['title']), $it['id']])->rowCount();
                    } catch (Throwable $e) { $n = 0; }
                    if ($n) {
                        $sum['new']++; $changed++;
                        auto_sp_decide($it['id'], 'redated', 'সোর্সে নতুন করে প্রকাশ (একই পাতা, নতুন তারিখ): ' . mb_substr($it['title'], 0, 90));
                    }
                    continue;
                }

                /* গ) চেনা ID, কিছুই বদলায়নি — চুপচাপ বাদ */
                if ((string)$r['source_modified'] === $it['modified']) continue;
                $changed++;

                /* ঘ) চেনা ID, তারিখ একই, শুধু লেখা/modified বদলেছে */
                if ($r['status'] === 'done' && $r['my_post_id']) { $check[$it['id']] = $it; continue; }
                if ($r['status'] === 'processing') continue;
                /* বেসলাইন/বাদ/রিভিউ/ব্যর্থ/নতুন/আপডেট-বাকি — শুধু তারিখ হালনাগাদ, AI নয় */
                try { q("UPDATE source_posts SET source_modified = ?, updated_at = updated_at WHERE source_id = ?", [$it['modified'], $it['id']]); }
                catch (Throwable $e) {}
            }
            /* এই পাতার সবই চেনা ও অপরিবর্তিত — এর পরের পাতাগুলো আরো পুরনো, খোলার দরকার নেই */
            if ($changed === 0 || $page >= (int)$L['pages']) break;
        }
    }

    /* আমাদের পোস্ট আছে এমন সোর্স-পোস্ট বদলালে: লেখা সত্যিই বদলেছে কিনা (বাকিগুলো পরের রানে) */
    foreach (array_slice($check, 0, AUTO_SP_MAX_DETAIL, true) as $sid => $it) {
        try {
            $d = auto_sp_detail($sid);
            if (!$d) continue;                                          /* তারিখ হালনাগাদ করিনি — পরের রানে আবার দেখবে */
            $scr = auto_sp_parse($d['html'], $d['title'] ?: $it['title']);
            if (!$scr) continue;
            $row = one("SELECT content_hash, status FROM source_posts WHERE source_id = ?", [$sid]);
            if (!$row || $row['status'] !== 'done') continue;
            if (!$row['content_hash']) {
                /* আগের সিস্টেমে তৈরি — প্রথমবার ছাপ রাখছি, তুলনার কিছু নেই */
                q("UPDATE source_posts SET content_hash = ?, source_modified = ?, updated_at = NOW() WHERE source_id = ?",
                  [$scr['hash'], $it['modified'], $sid]);
            } elseif ($row['content_hash'] === $scr['hash']) {
                q("UPDATE source_posts SET source_modified = ?, updated_at = NOW() WHERE source_id = ?", [$it['modified'], $sid]);
            } else {
                q("UPDATE source_posts SET status = 'update_pending', new_hash = ?, source_modified = ?, approved = 0,
                         note = 'সোর্সে লেখা বদলেছে — আপডেট করবেন কিনা ঠিক করুন', updated_at = NOW()
                   WHERE source_id = ? AND status = 'done'", [$scr['hash'], $it['modified'], $sid]);
                $sum['upd']++;
                auto_sp_decide($sid, 'update_pending', 'সোর্সে লেখা বদলেছে (AI ডাকা হয়নি) — এডমিনের সিদ্ধান্তের অপেক্ষায়: '
                               . mb_substr($it['title'], 0, 80));
                $ev('skip', 'সোর্সে আপডেট হয়েছে: ' . mb_substr($it['title'], 0, 70), 'এডমিন পাতায় "সোর্সে আপডেট" তালিকা থেকে ঠিক করুন।');
            }
        } catch (Throwable $e) {
            auto_log("আপডেট যাচাইয়ে সমস্যা (সোর্স #$sid): " . $e->getMessage(), 'warn');
        }
    }
    return true;
}

/* REST বন্ধ থাকলে: সাইটম্যাপ দেখে শুধু জানাই কতগুলো অচেনা slug আছে — AI কখনো নয় */
function auto_sp_fallback_check(array &$sum, callable $ev): void
{
    $diag = []; $unknown = 0; $total = 0;
    try {
        foreach (auto_sitemaps($diag) as $map) {
            [$code, $xml] = auto_http($map, 25, 8000000);
            if ($code !== 200 || !preg_match_all('~<loc>\s*([^<]+?)\s*</loc>~', $xml, $m)) continue;
            $slugs = [];
            foreach ($m[1] as $loc) {
                $path = trim((string)parse_url(html_entity_decode($loc), PHP_URL_PATH), '/');
                if ($path !== '') $slugs[] = rawurldecode(basename($path));
            }
            foreach (array_chunk($slugs, 300) as $ch) {
                $total += count($ch);
                $known = (int)col("SELECT COUNT(*) FROM source_posts WHERE slug IN (" . implode(',', array_fill(0, count($ch), '?')) . ")", $ch);
                $unknown += max(0, count($ch) - $known);
            }
        }
    } catch (Throwable $e) {}
    $msg = 'সোর্সের REST API সাড়া দিচ্ছে না (' . ($GLOBALS['__auto_sp_err'] ?? '') . ')। সাইটম্যাপে ' . bn($total)
         . 'টি লিংক, অচেনা ' . bn($unknown) . 'টি — AI ডাকা হয়নি। REST ঠিক হলে এগুলো নিজে থেকেই ধরা পড়বে।';
    auto_log($msg, 'warn');
    $ev('fail', 'সোর্সের REST API বন্ধ/ব্লক', $msg);
}

/* ---------- ৩. কাজের সারি থেকে পরেরটা ---------- */
function auto_sp_next_job(array $skip): ?array
{
    $not = $skip ? ' AND source_id NOT IN (' . implode(',', array_map('intval', $skip)) . ')' : '';
    /* ক) এডমিন নিজে অনুমতি দিয়েছেন (রিভিউ/আপডেট/বেসলাইন থেকে "AI দিয়ে তৈরি করুন") */
    $r = one("SELECT * FROM source_posts WHERE approved = 1 AND status IN ('needs_review','update_pending','baseline','skipped_duplicate')
              $not ORDER BY updated_at ASC LIMIT 1");
    if ($r) return $r;
    /* খ) নতুন পোস্ট — পুরনো থেকে নতুন ক্রমে */
    $r = one("SELECT * FROM source_posts WHERE status = 'new' $not ORDER BY source_date ASC, source_id ASC LIMIT 1");
    if ($r) return $r;
    /* গ) আগে ব্যর্থ, ৩ বারের কম চেষ্টা, অন্তত ২০ মিনিট আগে — আবার */
    return one("SELECT * FROM source_posts WHERE status = 'failed' AND tries < " . AUTO_SP_MAX_TRIES . "
                AND updated_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE) $not ORDER BY updated_at ASC LIMIT 1") ?: null;
}

/* বাকি কাজ কতগুলো ("সব আনুন" চালিয়ে যাবে কিনা) */
function auto_sp_queue_count(): int
{
    try {
        return (int)col("SELECT COUNT(*) FROM source_posts WHERE status = 'new'
                           OR (approved = 1 AND status IN ('needs_review','update_pending','baseline','skipped_duplicate'))
                           OR (status = 'failed' AND tries < " . AUTO_SP_MAX_TRIES . ")");
    } catch (Throwable $e) { return 0; }
}

function auto_sp_fail_mail(array $row, string $why): void
{
    if (!empty($GLOBALS['__auto_test'])) return;
    $to = trim(setting('auto_notify_email', 'support.cakricircular@gmail.com'));
    if ($to === '' || !function_exists('send_mail')) return;
    $link = url(setting('admin_slug', DEFAULT_ADMIN_SLUG) . '/automation');
    $html = '<div style="font-family:Hind Siliguri,Arial,sans-serif;padding:16px;max-width:540px">'
          . '<div style="font-weight:700;font-size:15px;margin-bottom:8px">⚠️ একটি পোস্ট ' . bn(AUTO_SP_MAX_TRIES) . ' বার চেষ্টা করেও তৈরি হয়নি</div>'
          . '<div style="font-size:14px;margin-bottom:6px">' . e((string)$row['title_raw']) . '</div>'
          . '<div style="font-size:13px;color:#8a5a08;background:#fff7e8;border-radius:8px;padding:8px 10px">কারণ: ' . e($why) . '</div>'
          . '<p style="font-size:13px;color:#555">আর নিজে থেকে চেষ্টা হবে না (AI খরচ বাঁচাতে)। অটোমেশন পাতা থেকে "ব্যর্থগুলো আবার চেষ্টা" চাপলে আবার হবে।</p>'
          . '<a href="' . e($link) . '" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;border-radius:999px;padding:8px 16px;font-weight:700;font-size:13px">অটোমেশন পাতা</a></div>';
    try {
        [$ok, $err] = send_mail($to, '⚠️ অটো-পোস্ট ব্যর্থ: ' . mb_substr((string)$row['title_raw'], 0, 80), $html);
        auto_log($ok ? 'ব্যর্থতার ইমেইল গেছে (সোর্স #' . $row['source_id'] . ')' : 'ব্যর্থতার ইমেইল যায়নি: ' . $err, $ok ? 'info' : 'error');
    } catch (Throwable $e) {}
}

/* টোকেন ও আনুমানিক খরচ — লগের জন্য */
function auto_sp_usage_text(array $ai): string
{
    $u = $ai['_usage'] ?? [];
    $in  = (int)($u['prompt_tokens'] ?? $u['input_tokens'] ?? 0);
    $out = (int)($u['completion_tokens'] ?? $u['output_tokens'] ?? 0);
    if (!$in && !$out) return '';
    $txt = "টোকেন: ইনপুট $in, আউটপুট $out";
    $pi = (float)setting('auto_price_in', '0'); $po = (float)setting('auto_price_out', '0');
    if ($pi > 0 || $po > 0) $txt .= sprintf(', আনুমানিক খরচ $%.4f', ($in * $pi + $out * $po) / 1000000);
    return $txt;
}

/* ---------- ৪. একটি সোর্স-পোস্ট প্রসেস ----------
   ফেরত: created | updated | dup | review | fail | cap | busy
   AI-এর সেটিংস/অ্যাকাউন্টের সমস্যা (fatal) হলে AutoAIError ছুঁড়ে দেয় — রান থামে */
function auto_sp_process(array $row, array $cats, array $divisions, array &$sum, callable $ev): string
{
    $sid      = (int)$row['source_id'];
    $prev     = (string)$row['status'];
    $approved = (int)$row['approved'] === 1;
    $isUpdate = $prev === 'update_pending' || (($row['job'] ?? 'create') === 'update' && !empty($row['my_post_id']));
    /* সোর্সের একই পাতায় নতুন বিজ্ঞপ্তি — আগে এই পাতা থেকে আমাদের পোস্ট ছিল */
    $isRedated = !$isUpdate && !empty($row['my_post_id']);
    $label    = mb_substr((string)$row['title_raw'], 0, 70);

    if (!auto_sp_claim($sid, $prev)) return 'busy';          /* অন্য কেউ ধরে ফেলেছে */

    $fail = function (string $why, bool $countTry = true) use ($sid, $row, $label, &$sum, $ev): string {
        q("UPDATE source_posts SET status = 'failed', note = ?, tries = tries + ?, updated_at = NOW() WHERE source_id = ?",
          [mb_substr($why, 0, 250), $countTry ? 1 : 0, $sid]);
        $tries = (int)col("SELECT tries FROM source_posts WHERE source_id = ?", [$sid]);
        $sum['failed']++;
        auto_sp_decide($sid, 'failed', "ব্যর্থ (চেষ্টা $tries/" . AUTO_SP_MAX_TRIES . "): $why — $label", 'error');
        if ($tries >= AUTO_SP_MAX_TRIES) {
            auto_sp_decide($sid, 'gave_up', AUTO_SP_MAX_TRIES . ' বার ব্যর্থ — আর নিজে চেষ্টা হবে না, এডমিনকে মেইল', 'error');
            auto_sp_fail_mail($row, $why);
            $ev('fail', "ব্যর্থ ({$tries} বার) — আর চেষ্টা হবে না: $label", $why);
        } else {
            $ev('fail', "ব্যর্থ: $label", "$why — পরে আবার চেষ্টা হবে।");
        }
        return 'fail';
    };

    try {
        /* নিরাপত্তা: নতুন পোস্টের কাজ, কিন্তু এই লিংক থেকে আমাদের পোস্ট আগেই আছে (আগের সিস্টেম/আধা-শেষ রান) */
        if (!$isUpdate && !$isRedated && !empty($row['source_link']) && trim((string)$row['slug']) !== '') {
            $want = auto_sp_norm_link((string)$row['source_link']);
            foreach (all("SELECT id, source_url FROM posts WHERE is_auto = 1 AND deleted_at IS NULL AND source_url LIKE ?",
                         ['%' . mb_substr((string)$row['slug'], 0, 150) . '%']) as $p) {
                if (auto_sp_norm_link((string)$p['source_url']) === $want) {
                    q("UPDATE source_posts SET status = 'done', my_post_id = ?, approved = 0, note = ?, updated_at = NOW() WHERE source_id = ?",
                      [(int)$p['id'], 'এই লিংক থেকে পোস্ট আগেই আছে — যুক্ত করা হলো', $sid]);
                    $sum['dup']++;
                    auto_sp_decide($sid, 'linked_existing', "এই সোর্স থেকে আমাদের পোস্ট #{$p['id']} আগেই আছে — AI ছাড়াই যুক্ত: $label");
                    $ev('skip', 'আগেই আছে (একই সোর্স): ' . $label);
                    return 'dup';
                }
            }
        }

        $d = auto_sp_detail($sid);
        if (!$d) return $fail('সোর্স থেকে পোস্টের লেখা আনা যায়নি (' . ($GLOBALS['__auto_sp_err'] ?? '') . ')');
        $title = $d['title'] ?: (string)$row['title_raw'];
        $scr   = auto_sp_parse($d['html'], $title);
        if (!$scr || $scr['short']) return $fail('পোস্টে যথেষ্ট লেখা নেই');
        $label = mb_substr($title, 0, 70);
        q("UPDATE source_posts SET title_raw = ?, title_norm = ?, source_link = COALESCE(NULLIF(?, ''), source_link),
                 source_modified = COALESCE(?, source_modified), updated_at = NOW() WHERE source_id = ?",
          [mb_substr($title, 0, 500), auto_sp_norm_title($title), mb_substr($d['link'], 0, 500), $d['modified'], $sid]);
        $link = $d['link'] ?: (string)$row['source_link'];
        $modified = $d['modified'] ?: (string)$row['source_modified'];
        $extraNote = '';

        /* ডুপ্লিকেট যাচাই — শুধু নতুন পোস্টে, আর এডমিন নিজে অনুমতি না দিলে */
        if (!$isUpdate && !$approved) {
            if (auto_is_roundup($title, $link)) {
                q("UPDATE source_posts SET status = 'skipped_duplicate', content_hash = ?, note = 'roundup', updated_at = NOW() WHERE source_id = ?",
                  [$scr['hash'], $sid]);
                $sum['dup']++;
                auto_sp_decide($sid, 'skipped_roundup', "সারসংক্ষেপ/তালিকা পাতা — AI ছাড়াই বাদ: $label");
                $ev('skip', 'সারসংক্ষেপ/তালিকা পাতা — বাদ: ' . $label, 'এ ধরনের পাতায় অন্য চাকরির সারাংশ থাকে।');
                return 'dup';
            }
            /* মেয়াদ শেষ হয়ে যাওয়া বিজ্ঞপ্তি — AI খরচ করে লাভ নেই */
            $dl = auto_sp_deadline($scr['full']);
            if ($dl && $dl < date('Y-m-d')) {
                q("UPDATE source_posts SET status = 'skipped_duplicate', content_hash = ?, note = ?, updated_at = NOW() WHERE source_id = ?",
                  [$scr['hash'], 'মেয়াদ শেষ (শেষ তারিখ ' . $dl . ')', $sid]);
                $sum['dup']++;
                auto_sp_decide($sid, 'skipped_expired', 'আবেদনের শেষ তারিখ পেরিয়ে গেছে (' . auto_bn_digits($dl) . ') — AI ছাড়াই বাদ: ' . $label);
                $ev('skip', 'মেয়াদ শেষ — বাদ: ' . $label);
                return 'dup';
            }

            if ($isRedated) {
                /* একই লেখা আবার প্রকাশ — কিছুই নতুন নয় */
                if (!empty($row['content_hash']) && $row['content_hash'] === $scr['hash']) {
                    q("UPDATE source_posts SET status = 'done', note = 'একই লেখা আবার প্রকাশ — AI নয়', updated_at = NOW() WHERE source_id = ?", [$sid]);
                    $sum['dup']++;
                    auto_sp_decide($sid, 'redated_same', "লেখা আগের মতোই — শুধু তারিখ বদলেছে, AI ছাড়াই বাদ: $label");
                    $ev('skip', 'শুধু তারিখ বদলেছে — বাদ: ' . $label);
                    return 'dup';
                }
                $hasStart = auto_posts_has_col('application_start');
                $old = one("SELECT id, title, vacancy, deadline" . ($hasStart ? ', application_start' : ', NULL AS application_start')
                         . " FROM posts WHERE id = ? AND deleted_at IS NULL", [(int)$row['my_post_id']]);
                if ($old) {
                    $src = ['vacancy' => auto_sp_vacancy($title, $scr['full']), 'start' => auto_sp_appstart($scr['full']),
                            'deadline' => $dl];
                    $cmp  = auto_sp_compare($src, $old);
                    $mine = "#{$old['id']} «" . mb_substr((string)$old['title'], 0, 50) . "»";
                    if ($cmp['result'] === 'dup') {
                        q("UPDATE source_posts SET status = 'done', content_hash = ?, note = ?, updated_at = NOW() WHERE source_id = ?",
                          [$scr['hash'], mb_substr('আগের পোস্টের সাথে তথ্য এক: ' . $cmp['why'], 0, 250), $sid]);
                        $sum['dup']++;
                        auto_sp_decide($sid, 'redated_same', "নতুন তারিখে প্রকাশ, কিন্তু আমাদের $mine-এর সাথে {$cmp['why']} — AI ছাড়াই বাদ: $label");
                        $ev('skip', 'সাইটে আগেই আছে — বাদ: ' . $label, "মিলেছে $mine");
                        return 'dup';
                    }
                    if ($cmp['result'] === 'unknown') {
                        q("UPDATE source_posts SET status = 'needs_review', match_post_id = ?, content_hash = ?, note = ?, updated_at = NOW()
                           WHERE source_id = ?", [(int)$old['id'], $scr['hash'], mb_substr('নতুন তারিখে প্রকাশ; ' . $cmp['why'], 0, 250), $sid]);
                        $sum['review']++;
                        auto_sp_decide($sid, 'needs_review', "নতুন তারিখে প্রকাশ, আমাদের আগের $mine-এর সাথে নিশ্চিত মেলানো গেল না ({$cmp['why']}) — রিভিউতে: $label", 'warn');
                        $ev('skip', 'রিভিউ দরকার: ' . $label, "আগের পোস্ট $mine; {$cmp['why']}");
                        return 'review';
                    }
                    $extraNote = "সোর্সের একই পাতায় নতুন বিজ্ঞপ্তি — আমাদের আগের পোস্ট $mine থেকে {$cmp['why']}।";
                    auto_sp_decide($sid, 'new_despite_title', "নতুন বিজ্ঞপ্তি (আগের পোস্ট $mine থেকে {$cmp['why']})");
                }
            }

            $m = $isRedated ? null : auto_sp_match_my_post($title, $sid);
            if ($m) {
                $src = ['vacancy' => auto_sp_vacancy($title, $scr['full']), 'start' => auto_sp_appstart($scr['full']),
                        'deadline' => auto_sp_deadline($scr['full'])];
                $cmp = auto_sp_compare($src, $m);
                $pct = bn((string)round($m['score'] * 100)) . '%';
                $mine = "#{$m['id']} «" . mb_substr((string)$m['title'], 0, 50) . "»";
                if ($cmp['result'] === 'dup') {
                    q("UPDATE source_posts SET status = 'skipped_duplicate', match_post_id = ?, content_hash = ?, note = ?, updated_at = NOW()
                       WHERE source_id = ?", [(int)$m['id'], $scr['hash'], mb_substr('ডুপ্লিকেট: ' . $cmp['why'], 0, 250), $sid]);
                    $sum['dup']++;
                    auto_sp_decide($sid, 'skipped_duplicate', "শিরোনাম $pct মিলেছে ($mine), {$cmp['why']} — AI ছাড়াই বাদ: $label");
                    $ev('skip', 'সাইটে আগেই আছে — বাদ: ' . $label, "মিলেছে $mine; {$cmp['why']}");
                    return 'dup';
                }
                if ($cmp['result'] === 'unknown') {
                    q("UPDATE source_posts SET status = 'needs_review', match_post_id = ?, content_hash = ?, note = ?, updated_at = NOW()
                       WHERE source_id = ?", [(int)$m['id'], $scr['hash'], mb_substr($cmp['why'], 0, 250), $sid]);
                    $sum['review']++;
                    auto_sp_decide($sid, 'needs_review', "শিরোনাম $pct মিলেছে ($mine), কিন্তু {$cmp['why']} — AI নয়, রিভিউতে: $label", 'warn');
                    $ev('skip', 'রিভিউ দরকার: ' . $label, "মিলেছে $mine; {$cmp['why']}। নিচের তালিকা থেকে ঠিক করুন।");
                    return 'review';
                }
                $extraNote = "শিরোনাম আমাদের $mine-এর সাথে মেলে, কিন্তু {$cmp['why']} — তাই নতুন ধরা হয়েছে।";
                auto_sp_decide($sid, 'new_despite_title', "শিরোনাম $pct মিলেছে ($mine), কিন্তু {$cmp['why']} — নতুন নিয়োগ ধরা হলো");
            }
        }

        /* ---- AI ধাপ ---- */
        $used = auto_sp_ai_used_today();
        if ($used >= auto_sp_cap()) {
            q("UPDATE source_posts SET status = ?, updated_at = NOW() WHERE source_id = ?", [$prev, $sid]);
            return 'cap';
        }
        q("UPDATE source_posts SET tries = tries + 1, updated_at = NOW() WHERE source_id = ?", [$sid]);
        $sum['ai']++;
        auto_sp_decide($sid, 'ai_call', ($isUpdate ? 'আপডেটের জন্য' : 'নতুন পোস্টের জন্য') . ' AI লিখছে (আজ ' . bn($used + 1) . '/' . bn(auto_sp_cap()) . '): ' . $label);
        $GLOBALS['__auto_stage'] = 'AI লিখছে';
        $t1 = microtime(true);
        try {
            $ai = auto_ai($scr, array_column($cats, 'name'), $divisions);
        } catch (AutoAIError $e) {
            if ($e->fatal) {
                /* সেটিংস/অ্যাকাউন্টের সমস্যা (ভুল key, ক্রেডিট শেষ ইত্যাদি) — পোস্টের দোষ নয়, টাকাও খরচ হয়নি:
                   চেষ্টা গুনি না, দৈনিক সীমাতেও গুনি না, আগের অবস্থায় ফেরত */
                q("UPDATE source_posts SET status = ?, tries = GREATEST(tries - 1, 0), updated_at = NOW() WHERE source_id = ?", [$prev, $sid]);
                try { q("DELETE FROM source_decisions WHERE source_id = ? AND decision = 'ai_call' ORDER BY id DESC LIMIT 1", [$sid]); } catch (Throwable $e2) {}
                $sum['ai'] = max(0, $sum['ai'] - 1);
                throw $e;
            }
            return $fail('AI: ' . $e->getMessage());
        }
        $usage = auto_sp_usage_text($ai);
        auto_log('AI লেখা শেষ (' . round(microtime(true) - $t1) . ' সেকেন্ড)' . ($usage ? " — $usage" : ''));

        $GLOBALS['__auto_stage'] = 'সেভ';
        if ($isUpdate) {
            $p = one("SELECT id, status, deleted_at FROM posts WHERE id = ?", [(int)$row['my_post_id']]);
            if ($p && !$p['deleted_at'] && (int)$p['status'] === 0
                && auto_update_post((int)$p['id'], $ai, $scr, (string)$modified, $cats, $divisions)) {
                $postId = (int)$p['id'];
                $what = "খসড়া #$postId নতুন করে লেখা হয়েছে (রিভিউ বাকি)";
                $sum['_ids'][] = $postId;
            } else {
                /* প্রকাশিত পোস্ট ছুঁই না — আলাদা খসড়া */
                $liveNote = $p && !$p['deleted_at']
                    ? "সোর্সে আপডেট হওয়া পোস্ট #{$p['id']}-এর নতুন সংস্করণ। লাইভ পোস্ট বদলানো হয়নি — মিলিয়ে দেখে দরকার হলে ওটা হালনাগাদ করুন।"
                    : 'আগের পোস্ট পাওয়া যায়নি — নতুন খসড়া বানানো হলো।';
                $newId = auto_save($ai, $scr, $link, (string)$modified, $cats, $divisions, ['note' => $liveNote, 'skip_guard' => true]);
                if (!$newId) return $fail('AI শিরোনাম দেয়নি — সেভ হয়নি');
                $postId = ($p && !$p['deleted_at']) ? (int)$p['id'] : $newId;
                $what = "আলাদা খসড়া #$newId তৈরি" . ($p && !$p['deleted_at'] ? " (লাইভ #{$p['id']} অপরিবর্তিত)" : '');
                $sum['_ids'][] = $newId;
            }
            q("UPDATE source_posts SET status = 'done', my_post_id = ?, content_hash = ?, new_hash = NULL, tries = 0, approved = 0,
                     job = 'create', note = ?, updated_at = NOW() WHERE source_id = ?", [$postId, $scr['hash'], mb_substr($what, 0, 250), $sid]);
            $sum['created']++;
            auto_sp_decide($sid, 'updated', "$what — $label" . ($usage ? " ($usage)" : ''));
            $ev('new', 'আপডেট তৈরি: ' . $label, $what);
            return 'updated';
        }

        $id = auto_save($ai, $scr, $link, (string)$modified, $cats, $divisions, ['note' => $extraNote]);
        if (!$id) return $fail('AI শিরোনাম দেয়নি — সেভ হয়নি');
        /* খসড়া সত্যিই সেভ হয়েছে — এখনই "done" */
        q("UPDATE source_posts SET status = 'done', my_post_id = ?, content_hash = ?, tries = 0, approved = 0, job = 'create', note = ?,
                 updated_at = NOW() WHERE source_id = ?", [$id, $scr['hash'], $extraNote !== '' ? mb_substr($extraNote, 0, 250) : null, $sid]);
        $sum['created']++;
        $sum['_ids'][] = $id;
        auto_sp_decide($sid, 'created', "নতুন খসড়া #$id তৈরি (রিভিউ বাকি): " . mb_substr((string)($ai['title'] ?? ''), 0, 80) . ($usage ? " ($usage)" : ''));
        $ev('new', 'নতুন পোস্ট তৈরি: ' . mb_substr((string)($ai['title'] ?? $label), 0, 80));
        return 'created';

    } catch (AutoAIError $e) {
        throw $e;
    } catch (Throwable $e) {
        return $fail('অপ্রত্যাশিত ত্রুটি: ' . mb_substr($e->getMessage(), 0, 160));
    }
}

/* ---------- পুরো রান ---------- */
function auto_sp_run(bool $manual = false, int $limitOverride = 0): array
{
    $sum = ['found' => 0, 'created' => 0, 'skipped' => 0, 'failed' => 0, 'updated' => 0, 'msg' => '',
            'events' => [], 'stop' => '', 'hint' => '', 'fatal' => false,
            'new' => 0, 'upd' => 0, 'review' => 0, 'dup' => 0, 'baseline' => 0, 'ai' => 0, '_ids' => []];
    $ev = function (string $type, string $text, string $hint = '') use (&$sum) {
        $sum['events'][] = ['type' => $type, 'text' => $text, 'hint' => $hint];
    };

    if (!$manual && setting('auto_enabled', '0') !== '1') { $sum['msg'] = $sum['stop'] = 'অটোমেশন বন্ধ আছে'; return $sum; }
    if (!function_exists('curl_init') && empty($GLOBALS['__auto_mock_http'])) {
        $sum['msg'] = $sum['stop'] = 'সার্ভারে cURL নেই'; $sum['hint'] = 'hPanel → PHP Configuration-এ curl এক্সটেনশন চালু করুন।'; $sum['fatal'] = true;
        auto_log($sum['msg'], 'error'); auto_save_detail($sum); return $sum;
    }
    if (function_exists('ensure_auto_v62')) ensure_auto_v62();
    elseif (function_exists('ensure_auto_v61')) ensure_auto_v61();

    /* দুই স্তরের তালা: ফাইল + ডেটাবেজ। যেকোনো একটা ধরা থাকলে আরেকটা রান শুরুই হবে না */
    $lock = @fopen(auto_lock_path(), 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        $sum['msg'] = $sum['stop'] = 'আগের রান এখনো চলছে'; $sum['hint'] = 'একটু পরে আবার চেষ্টা করুন।'; return $sum;
    }
    if (!auto_sp_db_lock()) {
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        $sum['msg'] = $sum['stop'] = 'আগের রান এখনো চলছে'; $sum['hint'] = 'একটু পরে আবার চেষ্টা করুন।'; return $sum;
    }
    register_shutdown_function(function () use ($lock) {
        if (is_resource($lock)) { @flock($lock, LOCK_UN); @fclose($lock); }
    });
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

    try {
        auto_sp_run_inner($manual, $limitOverride, $sum, $ev);
    } finally {
        auto_sp_db_unlock();
        if (is_resource($lock)) { @flock($lock, LOCK_UN); @fclose($lock); }
    }
    return auto_sp_finish($sum);
}

/* $sum রেফারেন্সে — ঘটনাগুলো ($ev) যেন একই জায়গায় জমা হয় */
function auto_sp_run_inner(bool $manual, int $limitOverride, array &$sum, callable $ev): void
{
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    @set_time_limit(300);
    ignore_user_abort(true);
    $lim    = (int)ini_get('max_execution_time');
    $budget = $lim > 0 ? max(40, min(240, $lim - 40)) : 240;
    $t0     = microtime(true);
    auto_log(($manual ? 'হাতে চালানো শুরু' : 'নির্ধারিত রান শুরু') . ' (v61, সোর্স ID ভিত্তিক)');

    auto_sp_release_stale();

    /* ১) বেসলাইন শেষ না হলে — শুধু বেসলাইন, এই রানে কোনো AI নয় */
    $base = auto_sp_state('auto_sp_base');
    if (empty($base['done'])) {
        $GLOBALS['__auto_stage'] = 'বেসলাইন';
        $r = auto_sp_baseline($t0, $budget, $sum, $ev);
        if ($r['done']) {
            $sum['stop'] = 'বেসলাইন তৈরি হলো (AI কল ০) — পরের রান থেকে শুধু নতুন পোস্ট আসবে';
            $sum['found'] = 0;
        } else {
            $sum['stop'] = 'বেসলাইন চলছে: ' . $r['why'];
            $sum['fatal'] = !empty($r['error']);
            $sum['hint'] = !empty($r['error']) ? 'কিছুক্ষণ পরে আবার চালান। বারবার হলে সোর্স সাইট হয়তো আমাদের সার্ভার ব্লক করছে।' : 'আবার চালালে বাকিটা শেষ হবে।';
            $sum['found'] = empty($r['error']) ? 1 : 0;              /* "সব আনুন" চাপলে বাকিটা চালিয়ে যাবে */
        }
        return;
    }

    /* ২) নতুন ও বদলানো খোঁজা */
    $GLOBALS['__auto_stage'] = 'সোর্সের তালিকা পড়া';
    if (!auto_sp_discover($sum, $ev)) {
        auto_sp_fallback_check($sum, $ev);
        $sum['stop'] = 'সোর্সের REST API সাড়া দিচ্ছে না — কোনো AI ডাকা হয়নি';
        $sum['hint'] = 'সাধারণত সাময়িক। পরের রানে নিজেই চেষ্টা করবে।';
        return;
    }

    /* ৩) কাজের সারি */
    $cats      = all("SELECT id, name, slug FROM categories ORDER BY sort_order, id");
    $divisions = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'সারাদেশ'];
    $limit     = $limitOverride > 0 ? $limitOverride : max(1, min(5, (int)auto_sp_setting('auto_batch', '1')));
    $skip = []; $checked = 0; $capHit = false;

    while ($sum['created'] < $limit) {
        if ($checked >= AUTO_SP_MAX_CHECKS) break;
        if (microtime(true) - $t0 > $budget) { $sum['stop'] = 'এই রানের সময় শেষ — বাকিগুলো পরের রানে'; break; }
        $row = auto_sp_next_job($skip);
        if (!$row) break;
        $skip[] = (int)$row['source_id'];
        $checked++;
        try {
            $res = auto_sp_process($row, $cats, $divisions, $sum, $ev);
        } catch (AutoAIError $e) {
            auto_log('AI: ' . $e->getMessage() . ($e->hint ? ' — সমাধান: ' . $e->hint : ''), 'error');
            $sum['failed']++;
            $ev('stop', 'AI সমস্যা: ' . $e->getMessage(), $e->hint);
            $sum['stop'] = 'AI সমস্যার কারণে থামানো হয়েছে: ' . $e->getMessage();
            $sum['hint'] = $e->hint; $sum['fatal'] = true;
            break;
        }
        if ($res === 'cap') { $capHit = true; break; }
    }

    if ($sum['stop'] === '') {
        $cap = auto_sp_cap();
        if ($capHit)                               $sum['stop'] = "আজকের AI সীমা ({$cap}টি) পূর্ণ — কাল আবার চলবে (সীমা সেটিংস থেকে বদলানো যায়)";
        elseif ($sum['created'] >= $limit)         $sum['stop'] = 'এই রানের কাজ শেষ (' . bn($limit) . 'টি) — বাকিগুলো পরের রানে';
        elseif ($checked >= AUTO_SP_MAX_CHECKS)    $sum['stop'] = 'একবারে ' . bn(AUTO_SP_MAX_CHECKS) . 'টির বেশি দেখা হয় না — বাকিগুলো পরের রানে';
        elseif ($checked === 0)                    $sum['stop'] = 'নতুন কোনো পোস্ট নেই — AI ডাকার মতো কিছু নেই';
        else                                       $sum['stop'] = 'প্রসেস করার মতো আর কিছু নেই';
    }
    $sum['found'] = $capHit ? 0 : auto_sp_queue_count();

    if ($sum['_ids'] && empty($GLOBALS['__auto_test'])) { bump_ver(); auto_notify($sum['_ids']); }
}

function auto_sp_finish(array $sum): array
{
    /* পুরনো ঘরগুলোর সাথে মিল রাখি (এডমিন পাতার পুরনো অংশ যেন ঠিক থাকে) */
    $sum['skipped'] = $sum['dup'] + $sum['review'];
    $sum['updated'] = $sum['upd'];
    $sum['msg'] = 'নতুন পাওয়া ' . bn($sum['new']) . ', AI দিয়ে তৈরি ' . bn($sum['created']) . ', সোর্সে আপডেট ' . bn($sum['upd'])
                . ', রিভিউ দরকার ' . bn($sum['review']) . ', ডুপ্লিকেট ' . bn($sum['dup']) . ', ব্যর্থ ' . bn($sum['failed']);
    auto_log('রান শেষ — ' . $sum['msg'] . ' | কেন থামল: ' . $sum['stop']);
    unset($sum['_ids']);
    try {
        set_setting('auto_last_run', date('Y-m-d H:i:s'));
        set_setting('auto_last_sum', $sum['msg']);
        auto_save_detail($sum);
    } catch (Throwable $e) {}
    return $sum;
}

/* ---------- এডমিন পাতার জন্য ---------- */
function auto_sp_counts(): array
{
    $c = ['baseline' => 0, 'new' => 0, 'processing' => 0, 'done' => 0, 'failed' => 0, 'update_pending' => 0,
          'needs_review' => 0, 'skipped_duplicate' => 0];
    try { foreach (all("SELECT status, COUNT(*) n FROM source_posts GROUP BY status") as $r) $c[$r['status']] = (int)$r['n']; }
    catch (Throwable $e) {}
    return $c;
}
