<?php
/* =========================================================
   হেল্পার ফাংশন সমূহ
   ========================================================= */

/* ---------- Output escape ---------- */
function e($s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/* ---------- Settings (key => value), একবার লোড হয়ে ক্যাশ ---------- */
function settings_all(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = [];
    try {
        foreach (all("SELECT k, v FROM settings") as $r) $cache[$r['k']] = $r['v'];
    } catch (Throwable $e) { $cache = []; }
    return $cache;
}
function setting(string $k, $default = ''): string
{
    $s = settings_all();
    return isset($s[$k]) && $s[$k] !== '' ? $s[$k] : (string)$default;
}
function set_setting(string $k, string $v): void
{
    q("INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [$k, $v]);
}

/* ---------- বাংলা সংখ্যা ---------- */
function bn($n): string
{
    $en = ['0','1','2','3','4','5','6','7','8','9'];
    $bd = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return str_replace($en, $bd, (string)$n);
}

/* ---------- "১ মিনিট আগে" স্টাইল সময় ---------- */
function time_ago($datetime): string
{
    $ts = is_numeric($datetime) ? (int)$datetime : strtotime((string)$datetime);
    $d  = time() - $ts;
    if ($d < 0)     return 'এইমাত্র';
    if ($d < 60)    return bn($d) . ' সেকেন্ড আগে';
    if ($d < 3600)  return bn(intdiv($d, 60)) . ' মিনিট আগে';
    if ($d < 86400) return bn(intdiv($d, 3600)) . ' ঘন্টা আগে';
    if ($d < 2592000) return bn(intdiv($d, 86400)) . ' দিন আগে';
    if ($d < 31536000) return bn(intdiv($d, 2592000)) . ' মাস আগে';
    return bn(intdiv($d, 31536000)) . ' বছর আগে';
}

/* ---------- বাংলা তারিখ + সময় (বাংলাদেশ সময়) ---------- */
function bn_datetime($datetime): string
{
    $ts = is_numeric($datetime) ? (int)$datetime : strtotime((string)$datetime);
    $months = [1=>'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    $h = (int)date('G', $ts);
    $ap = $h < 6 ? 'ভোর' : ($h < 12 ? 'সকাল' : ($h < 16 ? 'দুপুর' : ($h < 19 ? 'বিকাল' : 'রাত')));
    return bn(date('j', $ts)) . ' ' . $months[(int)date('n', $ts)] . ' ' . bn(date('Y', $ts))
         . ', ' . $ap . ' ' . bn(date('h:i', $ts));
}

/* ---------- বাংলা তারিখ (শুধু দিন মাস বছর) — "৩০ অক্টোবর ২০২৬" ---------- */
function bn_date($date): string
{
    $ts = is_numeric($date) ? (int)$date : strtotime((string)$date);
    if (!$ts) return '';
    $months = [1=>'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    return bn(date('j', $ts)) . ' ' . $months[(int)date('n', $ts)] . ' ' . bn(date('Y', $ts));
}

/* ---------- আবেদনের সময় বাকি / শেষ ---------- */
function deadline_info(?string $deadline): array
{
    if (!$deadline || $deadline === '0000-00-00') return ['state' => 'none', 'text' => ''];
    $end  = strtotime($deadline . ' 23:59:59');
    $diff = $end - time();
    if ($diff <= 0) return ['state' => 'over', 'text' => 'আবেদনের সময় শেষ'];
    $days = intdiv($diff, 86400);
    if ($days === 0) {
        return ['state' => 'urgent', 'text' => 'আজই শেষ দিন'];
    }
    return ['state' => $days <= 3 ? 'urgent' : 'open', 'text' => 'আবেদনের বাকি ' . bn($days) . ' দিন'];
}

/* ---------- Slug (বাংলা সাপোর্টেড) ---------- */
function slugify(string $text): string
{
    $text = trim(strip_tags($text));
    $text = preg_replace('/[\x{0964}\x{0965}]/u', '', $text);            // দাঁড়ি
    $text = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $text);   // জিরো-উইথ ক্যারেক্টার
    $text = preg_replace('/[^\p{L}\p{N}\p{M}\s-]+/u', '', $text);        // চিহ্ন বাদ (কার/মাত্রা রাখি)
    $text = preg_replace('/[\s-]+/u', '-', $text);
    $text = trim($text, '-');
    if ($text === '') $text = 'post-' . time();
    return mb_substr($text, 0, 120, 'UTF-8');
}
/* বাংলা শিরোনাম থেকে ইংরেজি অক্ষরে ছোট শব্দ — URL যেন কখনো না ভাঙে */
function bn_translit_tables(): array
{
    /* বহুল ব্যবহৃত শব্দের সরাসরি অনুবাদ (অক্ষরে অক্ষরে করলে খাপছাড়া লাগে) */
    $words = [
        'নিয়োগ' => 'niyog', 'বিজ্ঞপ্তি' => 'circular', 'চাকরি' => 'job', 'চাকুরি' => 'job',
        'ভর্তি' => 'admission', 'আবেদন' => 'application', 'ফলাফল' => 'result', 'রেজাল্ট' => 'result',
        'পরীক্ষা' => 'exam', 'প্রকাশ' => 'published', 'প্রকাশিত' => 'published', 'সময়সূচি' => 'routine',
        'বাংলাদেশ' => 'bangladesh', 'পুলিশ' => 'police', 'সেনাবাহিনী' => 'army', 'নৌবাহিনী' => 'navy',
        'বিমানবাহিনী' => 'airforce', 'ব্যাংক' => 'bank', 'বিশ্ববিদ্যালয়' => 'university',
        'কলেজ' => 'college', 'স্কুল' => 'school', 'মাদ্রাসা' => 'madrasa', 'শিক্ষক' => 'teacher',
        'জেলা' => 'district', 'প্রশাসকের' => 'dc', 'প্রশাসক' => 'dc', 'কার্যালয়' => 'office',
        'অধিদপ্তর' => 'directorate', 'অধিদপ্তরে' => 'directorate', 'মন্ত্রণালয়' => 'ministry',
        'সরকারি' => 'govt', 'বেসরকারি' => 'private', 'কোম্পানি' => 'company', 'হাসপাতাল' => 'hospital',
        'নার্স' => 'nurse', 'অফিসার' => 'officer', 'সহকারী' => 'assistant', 'কর্মকর্তা' => 'officer',
        'কর্মচারী' => 'staff', 'পদে' => 'post', 'পদ' => 'post', 'শূন্য' => 'vacancy',
        'বৃত্তি' => 'scholarship', 'স্কলারশিপ' => 'scholarship', 'নোটিশ' => 'notice',
        'প্রশিক্ষণ' => 'training', 'সার্কুলার' => 'circular', 'অনার্স' => 'honours', 'বর্ষ' => 'year',
    ];

    /* বাকি শব্দের জন্য অক্ষরভিত্তিক রূপান্তর */
    $chars = [
        'ক্ষ'=>'kh','জ্ঞ'=>'gg','ঞ্চ'=>'nch','ঞ্জ'=>'nj','ক্স'=>'x',
        'অ'=>'o','আ'=>'a','ই'=>'i','ঈ'=>'i','উ'=>'u','ঊ'=>'u','ঋ'=>'ri',
        'এ'=>'e','ঐ'=>'oi','ও'=>'o','ঔ'=>'ou',
        'ক'=>'k','খ'=>'kh','গ'=>'g','ঘ'=>'gh','ঙ'=>'ng',
        'চ'=>'ch','ছ'=>'chh','জ'=>'j','ঝ'=>'jh','ঞ'=>'n',
        'ট'=>'t','ঠ'=>'th','ড'=>'d','ঢ'=>'dh','ণ'=>'n',
        'ত'=>'t','থ'=>'th','দ'=>'d','ধ'=>'dh','ন'=>'n',
        'প'=>'p','ফ'=>'f','ব'=>'b','ভ'=>'bh','ম'=>'m',
        'য'=>'j','র'=>'r','ল'=>'l','শ'=>'sh','ষ'=>'sh','স'=>'s','হ'=>'h',
        'ড়'=>'r','ঢ়'=>'rh','য়'=>'y','ৎ'=>'t','ং'=>'ng','ঃ'=>'','ঁ'=>'',
        'া'=>'a','ি'=>'i','ী'=>'i','ু'=>'u','ূ'=>'u','ৃ'=>'ri',
        'ে'=>'e','ৈ'=>'oi','ো'=>'o','ৌ'=>'ou','্'=>'',
        '০'=>'0','১'=>'1','২'=>'2','৩'=>'3','৪'=>'4','৫'=>'5','৬'=>'6','৭'=>'7','৮'=>'8','৯'=>'9',
    ];
    return ['words' => $words, 'chars' => $chars];
}

/* শিরোনাম → ইংরেজি অক্ষরের ২-৪টি শব্দ (যেমন: bangladesh-police-niyog) */
function latin_slug_words(string $title, int $maxWords = 3, int $maxLen = 34): string
{
    $T = bn_translit_tables();
    $skip = ['এবং','ও','এর','এ','করা','করে','হবে','হয়েছে','জন্য','মধ্যে','the','a','an','of','for','and','in','to'];

    $title = preg_replace('/[\(\)\[\]{}"\x27“”‘’,।:;!?]/u', ' ', $title);
    $parts = preg_split('/\s+/u', trim($title), -1, PREG_SPLIT_NO_EMPTY);

    $out = [];
    foreach ($parts as $w) {
        if (count($out) >= $maxWords) break;
        $wl = mb_strtolower($w, 'UTF-8');
        if (in_array($wl, $skip, true)) continue;

        if (isset($T['words'][$w]))       $t = $T['words'][$w];
        elseif (isset($T['words'][$wl]))  $t = $T['words'][$wl];
        elseif (preg_match('/^[a-z0-9\-\.]+$/i', $w)) $t = strtolower($w);   /* আগে থেকেই ইংরেজি */
        else                              $t = strtr($w, $T['chars']);

        $t = strtolower(preg_replace('/[^a-z0-9]/i', '', $t));
        if ($t === '' || mb_strlen($t, 'UTF-8') < 2) continue;
        if (in_array($t, $out, true)) continue;                                 /* একই শব্দ দুবার নয় */
        $out[] = mb_substr($t, 0, 14, 'UTF-8');

        if (mb_strlen(implode('-', $out), 'UTF-8') >= $maxLen) break;
    }
    return implode('-', $out);
}

/* ছোট ও পরিষ্কার URL — শিরোনামের ইংরেজি শব্দ + ক্যাটাগরি + ক্রমিক নম্বর
   যেমন: bangladesh-police-niyog-chakri01 */
function next_cat_slug(int $catId, string $title = ''): string
{
    $cs = (string)col("SELECT slug FROM categories WHERE id = ?", [$catId]);
    $cs = strtolower(preg_replace('/[^a-z0-9]/i', '', $cs));
    if ($cs === '') $cs = 'post';

    /* এই ক্যাটাগরিতে এ পর্যন্ত সবচেয়ে বড় নম্বর */
    $max = 0;
    foreach (all("SELECT slug FROM posts WHERE slug LIKE ?", ['%' . $cs . '%']) as $r) {
        if (preg_match('/' . preg_quote($cs, '/') . '(\d+)$/', $r['slug'], $m)) {
            $max = max($max, (int)$m[1]);
        }
    }

    $head = $title !== '' ? latin_slug_words($title) : '';
    $n = $max + 1;
    while (true) {
        $num = $cs . str_pad((string)$n, 2, '0', STR_PAD_LEFT);
        $try = $head !== '' ? $head . '-' . $num : $num;
        $used = one("SELECT id FROM posts WHERE slug = ? LIMIT 1", [$try]);
        if (!$used) {
            try { $used = one("SELECT id FROM slug_redirects WHERE old_slug = ? LIMIT 1", [$try]); }
            catch (Throwable $e) { $used = null; }
        }
        if (!$used) return $try;
        $n++;
        if ($n > $max + 9999) return $num . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    }
}

function unique_slug(string $base, string $table, int $ignoreId = 0): string
{
    $slug = slugify($base); $i = 1; $try = $slug;
    while (true) {
        $row = one("SELECT id FROM `$table` WHERE slug = ? AND id <> ? LIMIT 1", [$try, $ignoreId]);
        if (!$row) return $try;
        $try = $slug . '-' . (++$i);
    }
}

/* ---------- CSRF ---------- */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function csrf_field(): string { return '<input type="hidden" name="_token" value="' . e(csrf_token()) . '">'; }
function csrf_check(): bool
{
    $t = $_POST['_token'] ?? ($_SERVER['HTTP_X_CSRF'] ?? '');
    return is_string($t) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $t);
}
function csrf_guard(): void
{
    if (!csrf_check()) { http_response_code(419); exit('সেশন মেয়াদ শেষ। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'); }
}

/* ---------- SPA রিকোয়েস্ট কিনা ---------- */
function is_spa(): bool { return ($_SERVER['HTTP_X_SPA'] ?? '') === '1'; }
function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------- প্রতিটি ফাইলের নিজস্ব CSS/JS (ডুপ্লিকেট হবে না) ---------- */
function css_once(string $key, string $css): void
{
    if (!isset($GLOBALS['_CSS'][$key])) $GLOBALS['_CSS'][$key] = $css;
}
function js_once(string $key, string $js): void
{
    if (!isset($GLOBALS['_JS'][$key])) $GLOBALS['_JS'][$key] = $js;
}
function collected_css(): array { return $GLOBALS['_CSS'] ?? []; }
function collected_js(): array  { return $GLOBALS['_JS'] ?? []; }

/* ---------- URL হেল্পার ---------- */
function url(string $path = ''): string { return BASE_URL . '/' . ltrim($path, '/'); }
function post_url(array $p): string { return url('post/' . $p['slug']); }
function cat_url(string $slug, int $page = 1): string
{
    return url('category/' . $slug . ($page > 1 ? '/page/' . $page : ''));
}
function asset(string $p): string { return url('assets/' . ltrim($p, '/')) . '?v=' . APP_VER; }

/* ---------- ছবি: থাম্ব না থাকলে ডিফল্ট ---------- */
function img_url(?string $file, string $folder = 'posts'): string
{
    if ($file) {
        if (preg_match('~^https?://~i', $file)) return $file;
        return UPLOAD_URL . '/' . $folder . '/' . $file;
    }
    return default_thumb();
}

/* লিস্টের ছোট ছবি না থাকলে */
function default_thumb(): string
{
    $d = setting('default_og');
    return $d ? UPLOAD_URL . '/site/' . $d : asset('img/default.svg');
}

/* শেয়ার কার্ডের ছবি — ফেসবুক/হোয়াটসঅ্যাপ SVG বোঝে না, তাই সবসময় PNG/JPG */
function default_og(): string
{
    $d = setting('default_og');
    if ($d && !preg_match('/\.svg$/i', $d)) return UPLOAD_URL . '/site/' . $d;
    return asset('img/default-og.png');
}
function site_logo(): string
{
    $l = setting('logo');
    return $l ? UPLOAD_URL . '/site/' . $l : asset('img/logo.svg');
}
/* ডিলিট করা পোস্ট রাখার কলাম আছে কিনা — না থাকলে একবার বানিয়ে নেয় */
function ensure_trash_column(): void
{
    if (setting('trash_ready', '0') === '1') return;
    try { q("SELECT deleted_at FROM posts LIMIT 1"); set_setting('trash_ready', '1'); return; }
    catch (Throwable $e) {}
    try {
        q("ALTER TABLE posts ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL");
        try { q("ALTER TABLE posts ADD INDEX idx_deleted (deleted_at)"); } catch (Throwable $e2) {}
        set_setting('trash_ready', '1');
    } catch (Throwable $e) {}
}

/* প্রিমিয়াম (বিজ্ঞাপন) পোস্টের কলাম — না থাকলে একবার বানিয়ে নেয় */
function ensure_premium_columns(): void
{
    if (setting('premium_ready', '0') === '1') return;
    try { q("SELECT is_premium, premium_until FROM posts LIMIT 1"); set_setting('premium_ready', '1'); return; }
    catch (Throwable $e) {}
    try {
        try { q("ALTER TABLE posts ADD COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0"); } catch (Throwable $e1) {}
        try { q("ALTER TABLE posts ADD COLUMN premium_until DATE NULL DEFAULT NULL"); } catch (Throwable $e2) {}
        try { q("ALTER TABLE posts ADD INDEX idx_premium (is_premium, premium_until)"); } catch (Throwable $e3) {}
        q("SELECT is_premium, premium_until FROM posts LIMIT 1");
        set_setting('premium_ready', '1');
    } catch (Throwable $e) {}
}

/* এই পোস্টের প্রিমিয়াম মেয়াদ এখনো চালু আছে কিনা */
function is_premium(array $p): bool
{
    if (empty($p['is_premium'])) return false;
    $till = $p['premium_until'] ?? null;
    return !$till || $till >= date('Y-m-d');
}

/* গুগলের স্কিমার জন্য পরিষ্কার বর্ণনা — ডিজাইনের কোড বাদ, শুধু লেখা থাকে */
function schema_description(string $html, int $limit = 2200): string
{
    /* স্টাইল ও স্ক্রিপ্ট ব্লক পুরোপুরি বাদ */
    $t = preg_replace('#<(style|script)\b[^>]*>.*?</\1>#is', ' ', $html);
    /* লাইন ভাঙার ট্যাগগুলো নতুন লাইনে বদলাই, যাতে লেখা জোড়া লেগে না যায় */
    $t = preg_replace('#<br\s*/?>#i', "\n", $t);
    $t = preg_replace('#</(p|div|li|h[1-6]|tr)>#i', "\n", $t);
    $t = preg_replace('#<li\b[^>]*>#i', '• ', $t);
    /* বাকি সব ট্যাগ বাদ */
    $t = strip_tags($t);
    $t = html_entity_decode($t, ENT_QUOTES, 'UTF-8');
    /* বাড়তি ফাঁকা জায়গা পরিষ্কার */
    $t = preg_replace('/[ \t]+/u', ' ', $t);
    $t = preg_replace('/\n{3,}/u', "\n\n", $t);
    $t = trim($t);
    if (mb_strlen($t, 'UTF-8') > $limit) $t = mb_substr($t, 0, $limit, 'UTF-8') . '…';
    return $t;
}

/* চলমান প্রিমিয়াম পোস্ট বাদ দেওয়ার শর্ত (WHERE-এ বসে) */
function not_premium(string $alias = 'p'): string
{
    return " AND NOT ($alias.is_premium = 1 AND ($alias.premium_until IS NULL OR $alias.premium_until >= CURDATE()))";
}

/* প্রতি কয়েকটি সাধারণ পোস্টের পর একটি প্রিমিয়াম পোস্ট গুঁজে দেয়।
   পেজ বদলালে অন্য বিজ্ঞাপন আসে, তাই সবাই সমান জায়গা পায়। */
function premium_feed(array $rows, int $page = 1, ?int $gap = null): array
{
    $gap = $gap ?: max(2, (int)setting('promo_gap', '5'));
    if (count($rows) < $gap) return $rows;

    try {
        $ads = all("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug
                    FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
                    WHERE p.status = 1 AND p.deleted_at IS NULL AND p.is_premium = 1
                      AND (p.premium_until IS NULL OR p.premium_until >= CURDATE())
                    ORDER BY p.published_at DESC, p.id DESC LIMIT 30");
    } catch (Throwable $e) { return $rows; }
    if (!$ads) return $rows;

    /* এক পেজে একটি বিজ্ঞাপন একবারই — যতগুলো আলাদা বিজ্ঞাপন আছে তার বেশি বসবে না */
    $slots = min((int)floor(count($rows) / $gap), count($ads));
    if ($slots < 1) return $rows;

    /* পেজ বদলালে অন্য বিজ্ঞাপন দিয়ে শুরু হয়, তাই সবাই সমান জায়গা পায় */
    $start = (($page - 1) * $slots) % count($ads);
    $pick  = [];
    for ($i = 0; $i < $slots; $i++) $pick[] = $ads[($start + $i) % count($ads)];

    $out = []; $n = 0; $k = 0;
    foreach ($rows as $r) {
        $out[] = $r;
        $n++;
        if ($n % $gap === 0 && $k < $slots) {
            $out[] = $pick[$k];
            $k++;
        }
    }
    return $out;
}

/* অটোমেশনের জন্য কলাম ও টেবিল — না থাকলে একবার বানিয়ে নেয় */
function ensure_auto_schema(): void
{
    if (setting('auto_ready', '0') === '1') return;
    $cols = [
        "ALTER TABLE posts ADD COLUMN is_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE posts ADD COLUMN review_pending TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE posts ADD COLUMN source_url VARCHAR(500) NULL DEFAULT NULL",
        "ALTER TABLE posts ADD COLUMN source_lastmod VARCHAR(40) NULL DEFAULT NULL",
        "ALTER TABLE posts ADD COLUMN auto_note TEXT NULL",
        "ALTER TABLE posts ADD INDEX idx_review (review_pending)",
        "ALTER TABLE posts ADD INDEX idx_source (source_url(190))",
    ];
    foreach ($cols as $sql) { try { q($sql); } catch (Throwable $e) {} }
    try {
        q("CREATE TABLE IF NOT EXISTS auto_seen (
             url_hash CHAR(40) PRIMARY KEY,
             url VARCHAR(500) NOT NULL,
             lastmod VARCHAR(40) DEFAULT NULL,
             post_id INT DEFAULT NULL,
             seen_at DATETIME NOT NULL
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        q("CREATE TABLE IF NOT EXISTS auto_log (
             id INT AUTO_INCREMENT PRIMARY KEY,
             level VARCHAR(10) NOT NULL DEFAULT 'info',
             msg TEXT NOT NULL,
             created_at DATETIME NOT NULL,
             INDEX idx_time (created_at)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        q("SELECT is_auto, review_pending, source_url FROM posts LIMIT 1");
        set_setting('auto_ready', '1');
    } catch (Throwable $e) {}
}

/* বারবার ব্যর্থ হওয়া লিংক যেন সারিকে আটকে না রাখে — ব্যর্থতার গণনা */
function ensure_auto_fails(): void
{
    if (setting('auto_ready2', '0') === '1') return;
    try { q("ALTER TABLE auto_seen ADD COLUMN fails TINYINT NOT NULL DEFAULT 0"); } catch (Throwable $e) {}
    try { q("SELECT fails FROM auto_seen LIMIT 1"); set_setting('auto_ready2', '1'); } catch (Throwable $e) {}
}

/* একবারের সংশোধন: কেন বাদ পড়েছে তার ঘর + ভুল করে বাদ পড়া লিংকগুলো আবার যাচাইয়ের জন্য খুলে দেওয়া */
function ensure_auto_fix3(): void
{
    if (setting('auto_ready3', '0') === '1') return;
    try { q("ALTER TABLE auto_seen ADD COLUMN note VARCHAR(20) NULL DEFAULT NULL"); } catch (Throwable $e) {}
    try {
        $start = setting('auto_start_date', '2026-09-22');
        /* শুরুর তারিখের পরের যেসব লিংক থেকে পোস্ট হয়নি অথচ "দেখা" হয়ে আছে —
           আগের ঢিলা ডুপ্লিকেট যাচাইয়ে ভুল করে বাদ পড়তে পারে; নতুন কড়া যাচাই দিয়ে আবার দেখা হবে।
           (যেগুলো থেকে পোস্ট হয়েছে সেগুলো ছোঁয়া হয় না — তাই ডুপ্লিকেটের ঝুঁকি নেই) */
        $n = q("DELETE FROM auto_seen WHERE post_id IS NULL AND lastmod IS NOT NULL
                AND (lastmod = 'ALWAYS' OR (lastmod >= ? AND lastmod <> 'OLD'))", [$start])->rowCount();
        set_setting('auto_ready3', '1');
        try { q("INSERT INTO auto_log (level, msg, created_at) VALUES ('info', ?, NOW())",
                ["একবারের সংশোধন: ভুল করে বাদ পড়া {$n}টি লিংক আবার যাচাইয়ের জন্য খোলা হলো"]); } catch (Throwable $e) {}
    } catch (Throwable $e) {}
}

/* v61 — সোর্স পোস্ট ID ধরে ট্র্যাকিং (REST API)।
   শুধু নতুন টেবিল/কলাম যোগ করে; পুরনো কোনো টেবিল বা ডেটা মোছে না। বারবার চালালেও নিরাপদ। */
function ensure_auto_v61(): void
{
    if (setting('auto_ready61', '0') === '1') return;
    try {
        q("CREATE TABLE IF NOT EXISTS source_posts (
             source_id INT UNSIGNED NOT NULL PRIMARY KEY,
             slug VARCHAR(200) NULL DEFAULT NULL,
             source_link VARCHAR(500) NULL DEFAULT NULL,
             title_raw VARCHAR(500) NULL DEFAULT NULL,
             title_norm VARCHAR(500) NULL DEFAULT NULL,
             content_hash CHAR(32) NULL DEFAULT NULL,
             new_hash CHAR(32) NULL DEFAULT NULL,
             source_date DATETIME NULL DEFAULT NULL,
             source_modified DATETIME NULL DEFAULT NULL,
             status ENUM('baseline','new','processing','done','failed','update_pending','needs_review','skipped_duplicate')
                    NOT NULL DEFAULT 'baseline',
             prev_status VARCHAR(20) NULL DEFAULT NULL,
             approved TINYINT(1) NOT NULL DEFAULT 0,
             my_post_id INT NULL DEFAULT NULL,
             match_post_id INT NULL DEFAULT NULL,
             tries TINYINT NOT NULL DEFAULT 0,
             note VARCHAR(255) NULL DEFAULT NULL,
             created_at DATETIME NOT NULL,
             updated_at DATETIME NOT NULL,
             INDEX idx_status (status, updated_at),
             INDEX idx_slug (slug(190)),
             INDEX idx_mypost (my_post_id),
             INDEX idx_date (source_date)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        q("CREATE TABLE IF NOT EXISTS source_decisions (
             id INT AUTO_INCREMENT PRIMARY KEY,
             source_id INT UNSIGNED NOT NULL,
             decision VARCHAR(30) NOT NULL,
             reason VARCHAR(500) NULL DEFAULT NULL,
             created_at DATETIME NOT NULL,
             INDEX idx_src (source_id),
             INDEX idx_dec_time (decision, created_at),
             INDEX idx_time (created_at)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        /* আবেদন শুরুর তারিখ — ডুপ্লিকেট মেলানোর জন্য (আগে থাকলে কিছু হবে না) */
        try { q("ALTER TABLE posts ADD COLUMN application_start DATE NULL DEFAULT NULL"); } catch (Throwable $e) {}
        q("SELECT source_id FROM source_posts LIMIT 1");
        q("SELECT id FROM source_decisions LIMIT 1");
        set_setting('auto_ready61', '1');
    } catch (Throwable $e) {}
}

/* v62 — সোর্স একই পুরনো পোস্টে নতুন বিজ্ঞপ্তি লিখে তারিখ বদলে দেয় (ID একই থাকে)।
   job কলাম যোগ + বেসলাইনের সময় যেগুলো সদ্য প্রকাশিত ছিল সেগুলো একবার সারিতে তোলা। বারবার চালালেও নিরাপদ। */
function ensure_auto_v62(): void
{
    ensure_auto_v61();
    if (setting('auto_ready62', '0') === '1') return;
    try {
        try { q("ALTER TABLE source_posts ADD COLUMN job VARCHAR(10) NOT NULL DEFAULT 'create'"); } catch (Throwable $e) {}
        q("SELECT job FROM source_posts LIMIT 1");
        /* বেসলাইনের ঠিক আগের ৩ দিনে সোর্সে প্রকাশ হওয়া, আমাদের সাইটে নেই এমন পোস্ট — একবারই সারিতে তুলি।
           ডুপ্লিকেট/মেয়াদোত্তীর্ণ যাচাই আর দৈনিক সীমা আগের মতোই চলবে। */
        q("UPDATE source_posts SET status = 'new', approved = 0, tries = 0, note = 'বেসলাইনের সময় সদ্য প্রকাশিত ছিল — সারিতে তোলা হলো', updated_at = NOW()
           WHERE status = 'baseline' AND my_post_id IS NULL AND source_date >= DATE_SUB(NOW(), INTERVAL 3 DAY)");
        /* আগের সিস্টেমের পোস্টের সাথে যুক্ত, কিন্তু সোর্স ওই পাতায় আমাদের পোস্টের পরে নতুন বিজ্ঞপ্তি দিয়েছে —
           এগুলোও একবার সারিতে (আগের পোস্টের সাথে তথ্য মিলিয়ে দেখা হবে, এক হলে AI নয়) */
        try {
            q("UPDATE source_posts sp JOIN posts p ON p.id = sp.my_post_id
               SET sp.prev_status = sp.status, sp.status = 'new', sp.approved = 0, sp.tries = 0,
                   sp.note = 'আমাদের পোস্টের পরে সোর্সে নতুন করে প্রকাশ — সারিতে তোলা হলো', sp.updated_at = NOW()
               WHERE sp.status = 'done' AND sp.source_date >= DATE_SUB(NOW(), INTERVAL 3 DAY)
                 AND p.published_at < DATE_SUB(sp.source_date, INTERVAL 1 DAY)");
        } catch (Throwable $e) {}
        set_setting('auto_ready62', '1');
    } catch (Throwable $e) {}
}

/* বেতনের কলাম আছে কিনা — না থাকলে একবার বানিয়ে নেয় */
function ensure_salary_column(): void
{
    if (setting('salary_ready', '0') === '1') return;
    try { q("SELECT salary FROM posts LIMIT 1"); set_setting('salary_ready', '1'); return; }
    catch (Throwable $e) {}
    try {
        q("ALTER TABLE posts ADD COLUMN salary VARCHAR(100) NULL DEFAULT NULL");
        set_setting('salary_ready', '1');
    } catch (Throwable $e) {}
}

/* =========================================================
   অ্যাপের আইকন — এডমিনে দেওয়া লোগো থেকেই বানানো হয়
   (ইনস্টল করা অ্যাপ, স্প্ল্যাশ স্ক্রিন, হোম স্ক্রিনে এটাই দেখাবে)
   ========================================================= */
function app_icon(int $size, bool $maskable = false): string
{
    $name = ($maskable ? 'appicon-mask-' : 'appicon-') . $size . '.png';
    $path = UPLOAD_PATH . '/site/' . $name;
    if (is_file($path)) return UPLOAD_URL . '/site/' . $name . '?v=' . filemtime($path);

    if (make_app_icons() && is_file($path)) return UPLOAD_URL . '/site/' . $name . '?v=' . filemtime($path);

    /* লোগো থেকে বানানো না গেলে সাইটের ডিফল্ট আইকন */
    if ($maskable) return asset('img/icon-maskable.png');
    return asset('img/icon-' . ($size >= 512 ? '512' : '192') . '.png');
}

/* লোগো বদলালে এগুলো আবার তৈরি হয় */
function make_app_icons(bool $force = false): bool
{
    $logo = setting('logo');
    if (!$logo || !function_exists('imagecreatetruecolor')) return false;
    $src = UPLOAD_PATH . '/site/' . $logo;
    if (!is_file($src)) return false;
    if (preg_match('/\.svg$/i', $logo)) return false;          // SVG থেকে বানানো যায় না

    $info = @getimagesize($src);
    if (!$info) return false;
    switch ($info[2]) {
        case IMAGETYPE_JPEG: $im = @imagecreatefromjpeg($src); break;
        case IMAGETYPE_PNG:  $im = @imagecreatefrompng($src);  break;
        case IMAGETYPE_WEBP: $im = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($src) : null; break;
        default: $im = null;
    }
    if (!$im) return false;

    $sw = imagesx($im); $sh = imagesy($im);
    $sq = min($sw, $sh);
    $sx = (int)(($sw - $sq) / 2); $sy = (int)(($sh - $sq) / 2);

    $sets = [[192, false], [512, false], [180, false], [512, true]];
    foreach ($sets as [$size, $mask]) {
        $name = ($mask ? 'appicon-mask-' : 'appicon-') . $size . '.png';
        $out  = UPLOAD_PATH . '/site/' . $name;
        if (!$force && is_file($out) && filemtime($out) >= filemtime($src)) continue;

        $dst = imagecreatetruecolor($size, $size);
        imagealphablending($dst, false); imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagealphablending($dst, true);

        if ($mask) {                                   /* maskable — চারপাশে ফাঁকা জায়গা রাখি */
            $bg = imagecolorallocate($dst, 255, 255, 255);
            imagefilledrectangle($dst, 0, 0, $size, $size, $bg);
            $pad = (int)round($size * 0.14);
            imagecopyresampled($dst, $im, $pad, $pad, $sx, $sy, $size - 2 * $pad, $size - 2 * $pad, $sq, $sq);
        } else {
            imagecopyresampled($dst, $im, 0, 0, $sx, $sy, $size, $size, $sq, $sq);
        }
        imagepng($dst, $out, 8);
        imagedestroy($dst);
    }
    imagedestroy($im);
    return true;
}

function site_favicon(): string
{
    $f = setting('favicon');
    return $f ? UPLOAD_URL . '/site/' . $f : asset('img/favicon.svg');
}

/* =========================================================
   আপলোড + ছবি কম্প্রেশন
   রিকমেন্ডেশন: 1MB→100KB, 2MB→200KB, 3MB→300KB, 4MB→400KB, 5MB→450KB
   ========================================================= */
function target_kb(int $bytes): int
{
    $mb = $bytes / 1048576;
    if ($mb <= 1) return 100;
    if ($mb <= 2) return 200;
    if ($mb <= 3) return 300;
    if ($mb <= 4) return 400;
    if ($mb <= 5) return 450;
    return 500;
}

/**
 * ছবি আপলোড + অটো কম্প্রেস। সফল হলে ফাইলনাম রিটার্ন করে, নাহলে null।
 */
function upload_err_text(int $code): string
{
    switch ($code) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            $lim = ini_get('upload_max_filesize');
            return 'ছবিটি সার্ভারের সীমার (' . $lim . ') চেয়ে বড়, তাই আপলোড হয়নি। ছোট ছবি দিন — ব্রাউজার নিজেই ছোট করে দেয়, পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।';
        case UPLOAD_ERR_PARTIAL:   return 'ইন্টারনেট সংযোগ কেটে যাওয়ায় ফাইল পুরোপুরি আসেনি। আবার চেষ্টা করুন।';
        case UPLOAD_ERR_NO_FILE:   return 'কোনো ফাইল নির্বাচন করা হয়নি।';
        case UPLOAD_ERR_NO_TMP_DIR:
        case UPLOAD_ERR_CANT_WRITE: return 'সার্ভারে ফাইল লেখা যায়নি। uploads ফোল্ডারের পারমিশন ৭৫৫ কিনা দেখুন।';
        default: return 'ফাইল আপলোড হয়নি।';
    }
}

function upload_image(array $file, string $folder = 'posts', int $maxW = 1600, ?string &$err = null, ?float $ratio = null, ?int $forceKb = null): ?string
{
    if (!isset($file['tmp_name']) || $file['error'] !== UPLOAD_ERR_OK) { $err = upload_err_text((int)($file['error'] ?? 4)); return null; }
    if ($file['size'] > 12 * 1048576) { $err = 'ছবির সাইজ ১২ এমবি-র বেশি হতে পারবে না।'; return null; }

    $info = @getimagesize($file['tmp_name']);
    $mime = $info['mime'] ?? '';
    $allow = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/svg+xml' => 'svg'];

    /* SVG আলাদা ভাবে (লোগো/ফেভিকনের জন্য) */
    if (!$info && strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) === 'svg') {
        $svg = file_get_contents($file['tmp_name']);
        if (stripos($svg, '<script') !== false || stripos($svg, 'onload=') !== false) { $err = 'অনিরাপদ SVG ফাইল।'; return null; }
        $name = bin2hex(random_bytes(8)) . '.svg';
        file_put_contents(UPLOAD_PATH . '/' . $folder . '/' . $name, $svg);
        return $name;
    }
    if (!isset($allow[$mime])) { $err = 'শুধু JPG, PNG, WEBP, GIF বা SVG ছবি দেওয়া যাবে।'; return null; }

    $ext  = $allow[$mime];
    if ($ratio && $ext !== 'gif') $ext = 'jpg';           // ব্যানার সবসময় JPG (সব ব্রাউজারে চলে)
    $name = bin2hex(random_bytes(8)) . '.' . ($ext === 'png' ? 'png' : ($ext === 'gif' ? 'gif' : 'jpg'));
    $dest = UPLOAD_PATH . '/' . $folder . '/' . $name;

    if ($ext === 'gif' || !function_exists('imagecreatetruecolor')) {  // GIF অ্যানিমেশন নষ্ট করব না
        move_uploaded_file($file['tmp_name'], $dest);
        return $name;
    }

    switch ($mime) {
        case 'image/jpeg': $src = @imagecreatefromjpeg($file['tmp_name']); break;
        case 'image/png':  $src = @imagecreatefrompng($file['tmp_name']);  break;
        case 'image/webp': $src = @imagecreatefromwebp($file['tmp_name']); break;
        default: $src = null;
    }
    if (!$src) { $err = 'ছবিটি পড়া যায়নি।'; return null; }

    [$w, $h] = [imagesx($src), imagesy($src)];

    /* নির্দিষ্ট অনুপাত চাইলে (যেমন ব্যানার ৮৫৬×২৯২) — মাঝখান থেকে ক্রপ */
    if ($ratio && $ratio > 0) {
        $cur = $w / max(1, $h);
        if ($cur > $ratio) { $cw = (int)round($h * $ratio); $ch = $h; }
        else               { $cw = $w; $ch = (int)round($w / $ratio); }
        $cx = (int)(($w - $cw) / 2); $cy = (int)(($h - $ch) / 2);
        $outW = min($maxW, $cw);
        $outH = (int)round($outW / $ratio);
        $dst = imagecreatetruecolor($outW, $outH);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, $cx, $cy, $outW, $outH, $cw, $ch);
        imagedestroy($src); $src = $dst;
        $w = $outW; $h = $outH;
    } elseif ($w > $maxW) {
        $nh  = (int)round($h * ($maxW / $w));
        $dst = imagecreatetruecolor($maxW, $nh);
        imagealphablending($dst, false); imagesavealpha($dst, true);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $maxW, $nh, $w, $h);
        imagedestroy($src); $src = $dst;
    }

    $targetBytes = ($forceKb ?: target_kb((int)$file['size'])) * 1024;

    if ($ext === 'png') {                       // স্বচ্ছতা রক্ষা করে PNG
        imagepng($src, $dest, 8);
        if (filesize($dest) > $targetBytes) {   // বড় হলে JPG-তে নামাই
            $flat = imagecreatetruecolor(imagesx($src), imagesy($src));
            imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
            imagecopy($flat, $src, 0, 0, 0, 0, imagesx($src), imagesy($src));
            @unlink($dest);
            $dest = preg_replace('/\.png$/', '.jpg', $dest);
            $name = preg_replace('/\.png$/', '.jpg', $name);
            compress_jpeg($flat, $dest, $targetBytes);
            imagedestroy($flat);
        }
    } else {
        compress_jpeg($src, $dest, $targetBytes);
    }
    imagedestroy($src);
    return $name;
}

function compress_jpeg($img, string $dest, int $targetBytes): void
{
    $qualities = [85, 78, 70, 62, 55, 48, 40, 33];
    foreach ($qualities as $qv) {
        imagejpeg($img, $dest, $qv);
        if (filesize($dest) <= $targetBytes) return;
    }
}

/* PDF আপলোড (সাইজ লিমিট + ভ্যালিডেশন) */
function upload_pdf(array $file, ?string &$err = null): ?string
{
    if (!isset($file['tmp_name']) || $file['error'] !== UPLOAD_ERR_OK) { $err = 'পিডিএফ আপলোড হয়নি।'; return null; }
    if ($file['size'] > 15 * 1048576) { $err = 'পিডিএফ ১৫ এমবি-র বেশি হতে পারবে না।'; return null; }
    $fh = fopen($file['tmp_name'], 'rb'); $head = fread($fh, 5); fclose($fh);
    if ($head !== '%PDF-') { $err = 'এটি বৈধ পিডিএফ ফাইল নয়।'; return null; }
    $name = bin2hex(random_bytes(8)) . '.pdf';
    move_uploaded_file($file['tmp_name'], UPLOAD_PATH . '/pdf/' . $name);
    return $name;
}
function nice_size(int $b): string
{
    if ($b >= 1048576) return bn(round($b / 1048576, 1)) . ' এমবি';
    return bn((int)round($b / 1024)) . ' কেবি';
}

/* =========================================================
   কনটেন্ট অটো ফরম্যাট (বাংলা/ইংরেজি টেক্সট সুন্দর করে সাজায়)
   ========================================================= */
function format_content(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') return '';
    // আগে থেকেই HTML/CSS লেখা থাকলে সেটাই রাখি, শুধু নিরাপদ করি
    if (preg_match('/<(style|[a-z][a-z0-9]*)(\s|>|\/)/i', $raw)) return sanitize_html($raw);

    $out = ''; $list = false;
    foreach (preg_split('/\R/u', $raw) as $line) {
        $t = trim($line);
        if ($t === '') { if ($list) { $out .= "</ul>"; $list = false; } continue; }
        if (preg_match('/^(\*|-|•|·)\s*(.+)$/u', $t, $m)) {
            if (!$list) { $out .= '<ul class="c-list">'; $list = true; }
            $out .= '<li>' . e($m[2]) . '</li>';
            continue;
        }
        if ($list) { $out .= '</ul>'; $list = false; }
        if (preg_match('/^(#{1,3})\s*(.+)$/u', $t, $m)) {
            $lv = strlen($m[1]) + 1;
            $out .= "<h$lv>" . e($m[2]) . "</h$lv>";
        } elseif (mb_strlen($t, 'UTF-8') < 60 && preg_match('/[:ঃ]$/u', $t)) {
            $out .= '<h3>' . e(rtrim($t, ': ')) . '</h3>';
        } else {
            $out .= '<p>' . nl_links($t) . '</p>';
        }
    }
    if ($list) $out .= '</ul>';
    return $out;
}
function nl_links(string $raw): string
{
    /* কাঁচা লেখা নিই — লিংক ও সাধারণ অংশ আলাদা করে প্রতিটি একবারই এস্কেপ করি।
       (আগে পুরো লেখা এস্কেপ করে তারপর লিংক খোঁজা হতো, ফলে & হয়ে যেত &amp;amp; আর লিংক ভাঙত) */
    $out   = '';
    $last  = 0;
    if (preg_match_all('~https?://[^\s<]+~u', $raw, $mm, PREG_OFFSET_CAPTURE)) {
        foreach ($mm[0] as $m) {
            [$hit, $pos] = $m;
            $out .= e(substr($raw, $last, $pos - $last));          // মাঝের সাধারণ লেখা
            $url   = rtrim($hit, '.,;)।');                          // শেষের যতিচিহ্ন লিংকের বাইরে
            $tail  = substr($hit, strlen($url));
            $shown = rtrim(preg_replace('~^https?://~i', '', $url), '/');
            $out  .= '<a href="' . e($url) . '" target="_blank" rel="nofollow noopener">' . e($shown) . '</a>' . e($tail);
            $last  = $pos + strlen($hit);
        }
    }
    $out .= e(substr($raw, $last));
    return $out;
}
function sanitize_html(string $html): string
{
    /* ---- ১) <script> পুরোপুরি বাদ ---- */
    $html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $html);

    /* ---- ২) <style> ব্লকগুলো আলাদা করে রাখি, পরে স্কোপ করে ফেরত দেব ---- */
    $css = '';
    $html = preg_replace_callback('#<style\b[^>]*>(.*?)</style>#is', function ($m) use (&$css) {
        $css .= "\n" . $m[1];
        return '';
    }, $html);

    /* ---- ৩) নিরাপদ ট্যাগগুলো রাখি (অ্যাট্রিবিউট যেমন style/class থেকেই যায়) ---- */
    $allowed = '<p><br><b><strong><i><em><u><s><ul><ol><li><h1><h2><h3><h4><h5><h6>'
             . '<blockquote><table><thead><tbody><tfoot><tr><td><th><caption><colgroup><col>'
             . '<a><img><hr><span><div><section><article><header><footer><aside><figure><figcaption>'
             . '<small><sub><sup><mark><code><pre><dl><dt><dd><center><iframe><video><source><audio>';
    $html = strip_tags($html, $allowed);

    /* ---- ৪) বিপজ্জনক অ্যাট্রিবিউট সরাই ---- */
    $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
    $html = preg_replace('/javascript\s*:/i', '', $html);
    /* iframe/video শুধু https হলে থাকবে */
    $html = preg_replace_callback('#<(iframe|video|audio|source)\b([^>]*)>#i', function ($m) {
        if (!preg_match('#src\s*=\s*["\']https://#i', $m[2])) return '';
        $attr = $m[2];
        if (stripos($m[1], 'iframe') === 0 && stripos($attr, 'loading=') === false) $attr .= ' loading="lazy"';
        return '<' . $m[1] . $attr . '>';
    }, $html);

    /* ---- ৫) CSS ফেরত দিই, তবে শুধু পোস্টের ভেতরেই কাজ করবে ---- */
    if (trim($css) !== '') {
        $html = '<style>' . scope_css($css, '.pd-body') . '</style>' . $html;
    }
    return $html;
}

/* পোস্টের CSS যেন সাইটের বাকি অংশে প্রভাব না ফেলে — প্রতিটি সিলেক্টরের আগে .pd-body বসাই */
function scope_css(string $css, string $prefix): string
{
    $css = preg_replace('#/\*.*?\*/#s', '', $css);          // কমেন্ট বাদ
    $css = preg_replace('#</?style[^>]*>#i', '', $css);
    $css = str_replace(['<', '>'], '', $css);                 // ট্যাগ ঢোকানো বন্ধ
    $out = '';
    $len = strlen($css);
    $i = 0;
    while ($i < $len) {
        /* at-rule (@media, @supports, @keyframes …) */
        if (preg_match('/\G\s*@([a-z-]+)([^{;]*)([{;])/i', $css, $m, 0, $i)) {
            $name = strtolower($m[1]);
            $i += strlen($m[0]);
            /* বাইরের ফাইল আনা বন্ধ */
            if ($m[3] === ';') {
                if (!in_array($name, ['import', 'charset', 'namespace'], true)) $out .= '@' . $m[1] . $m[2] . ';';
                continue;
            }

            /* ব্লকের ভেতরটা বের করি */
            $depth = 1; $start = $i;
            while ($i < $len && $depth > 0) {
                if ($css[$i] === '{') $depth++;
                elseif ($css[$i] === '}') $depth--;
                $i++;
            }
            $inner = substr($css, $start, max(0, $i - $start - 1));
            $out .= '@' . $m[1] . $m[2] . '{'
                 . (in_array($name, ['keyframes', '-webkit-keyframes', 'font-face'], true) ? $inner : scope_css($inner, $prefix))
                 . '}';
            continue;
        }

        /* সাধারণ রুল: সিলেক্টর { ... } */
        if (preg_match('/\G([^{}]+)\{([^{}]*)\}/s', $css, $m, 0, $i)) {
            $i += strlen($m[0]);
            $sels = array_filter(array_map('trim', explode(',', $m[1])));
            $new  = [];
            foreach ($sels as $sel) {
                if ($sel === '') continue;
                if (preg_match('/^(html|body|:root)\b/i', $sel)) $new[] = $prefix;
                else $new[] = $prefix . ' ' . $sel;
            }
            if ($new) $out .= implode(',', $new) . '{' . trim($m[2]) . '}';
            continue;
        }
        $i++;
    }
    return $out;
}
function excerpt(string $html, int $len = 160): string
{
    $t = trim(preg_replace('/\s+/u', ' ', strip_tags($html)));
    return mb_strlen($t, 'UTF-8') > $len ? mb_substr($t, 0, $len, 'UTF-8') . '…' : $t;
}

/* =========================================================
   Pagination (প্রিমিয়াম) – ১ ২ ৩ … শেষ পেজ
   ========================================================= */
function pager(int $page, int $totalPages, callable $linkFn): string
{
    if ($totalPages < 2) return '';
    $h = '<nav class="pager" aria-label="পেজ নেভিগেশন">';
    $h .= $page > 1
        ? '<a class="pg pg-nav" href="' . e($linkFn($page - 1)) . '"><i class="fa fa-angle-left"></i><span>আগের</span></a>'
        : '<span class="pg pg-nav disabled"><i class="fa fa-angle-left"></i><span>আগের</span></span>';

    /* কম পেজ হলে ১,২,৩…১০ সবই দেখাই; বেশি হলে আশেপাশের ২টি */
    $win = $totalPages <= 10 ? $totalPages : 2;
    $shown = [];
    for ($i = 1; $i <= $totalPages; $i++) {
        if ($i === 1 || $i === $totalPages || abs($i - $page) <= $win) $shown[] = $i;
    }
    $prev = 0;
    foreach ($shown as $i) {
        if ($prev && $i - $prev > 1) $h .= '<span class="pg dots">…</span>';
        $h .= $i === $page
            ? '<span class="pg active">' . bn($i) . '</span>'
            : '<a class="pg" href="' . e($linkFn($i)) . '">' . bn($i) . '</a>';
        $prev = $i;
    }
    $h .= $page < $totalPages
        ? '<a class="pg pg-nav" href="' . e($linkFn($page + 1)) . '"><span>পরের</span><i class="fa fa-angle-right"></i></a>'
        : '<span class="pg pg-nav disabled"><span>পরের</span><i class="fa fa-angle-right"></i></span>';
    return $h . '</nav>';
}

/* =========================================================
   লিস্টের প্রিমিয়াম হেডার — "মোট ২০টি পোস্ট >"
   ========================================================= */
function list_count_btn(int $total, string $href): string
{
    return '<a class="cnt-pill" href="' . e($href) . '">মোট ' . bn($total) . 'টি পোস্ট'
         . '<i class="fa fa-angle-right"></i></a>';
}

/* "সব দেখুন" — বাকি পোস্টগুলো একই পেজে লোড হবে */
function load_more_btn(int $page, int $totalPages, string $nextUrl, int $remaining): string
{
    if ($page >= $totalPages) return '';
    return '<div class="more-wrap"><button type="button" class="more-btn" data-more="' . e($nextUrl) . '">'
         . '<i class="fa fa-arrow-down"></i><span>আরও ' . bn($remaining) . 'টি পোস্ট দেখুন</span></button>'
         . '<div class="more-spin" hidden><i class="fa fa-circle-notch fa-spin"></i> লোড হচ্ছে…</div></div>';
}

/* =========================================================
   কনটেন্ট ভার্সন — এডমিনে কিছু বদলালেই ক্যাশ ভেঙে যায় (লাইভ আপডেট)
   ========================================================= */
function content_ver(): string
{
    $v = setting('cache_ver', '');
    return $v !== '' ? $v : '1';
}
function bump_ver(): void
{
    try {
        set_setting('cache_ver', (string)time());
        $GLOBALS['_SETTINGS_DIRTY'] = 1;
    } catch (Throwable $e) {}
}

/* =========================================================
   নোটিশ — সর্বশেষ ৫০টি রাখি, বাকিগুলো অটো মেয়াদ শেষ (ডিলিট)
   ========================================================= */
function notice_limit(): int
{
    $n = (int)setting('notice_limit', '50');
    return $n > 0 ? $n : 50;
}
/* পুরনো ভিজিট লগ পরিষ্কার — দিনে একবার, শেয়ার্ড হোস্টিংয়ে ডেটাবেজ যেন ফুলে না যায়।
   অ্যানালিটিক্সের রিপোর্ট সর্বোচ্চ ৩৬৫ দিনের, তাই তার বেশি পুরনো সারি রাখার দরকার নেই। */
function prune_visits(): void
{
    if (setting('visits_pruned', '') === date('Y-m-d')) return;
    set_setting('visits_pruned', date('Y-m-d'));
    try {
        q("DELETE FROM visits      WHERE day < DATE_SUB(CURDATE(), INTERVAL 400 DAY) LIMIT 5000");
        q("DELETE FROM post_views  WHERE day < DATE_SUB(CURDATE(), INTERVAL 400 DAY) LIMIT 5000");
        q("DELETE FROM visitors    WHERE last_seen < DATE_SUB(NOW(), INTERVAL 400 DAY) LIMIT 5000");
    } catch (Throwable $e) {}
}

function prune_notices(): void
{
    try {
        $keep = notice_limit();
        $ids  = col_all("SELECT id FROM notices ORDER BY created_at DESC, id DESC LIMIT $keep");
        if (!$ids) return;
        $in = implode(',', array_map('intval', $ids));
        q("DELETE FROM notices WHERE id NOT IN ($in)");
    } catch (Throwable $e) {}
}
function col_all(string $sql, array $args = []): array
{
    $st = q($sql, $args);
    return array_map(function ($r) { return reset($r); }, $st->fetchAll(PDO::FETCH_ASSOC));
}

/* =========================================================
   শেয়ার বাটন (মেটা কার্ড সাপোর্টেড লিংক)
   ========================================================= */
function share_button(string $title, string $link, string $cat = ''): string
{
    return '<button type="button" class="share-btn" aria-label="শেয়ার করুন"'
         . ' data-share-title="' . e($title) . '"'
         . ' data-share-url="' . e($link) . '"'
         . ' data-share-cat="' . e($cat) . '"><i class="fa fa-share-nodes"></i></button>';
}

/* =========================================================
   ভিজিটর ট্র্যাকিং (একটি ডিভাইস = একবার)
   ========================================================= */
function visitor_id(): string
{
    if (!empty($_COOKIE['cc_vid']) && preg_match('/^[a-f0-9]{32}$/', $_COOKIE['cc_vid'])) return $_COOKIE['cc_vid'];
    $vid = bin2hex(random_bytes(16));
    setcookie('cc_vid', $vid, [
        'expires' => time() + 31536000, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax',
    ]);
    $_COOKIE['cc_vid'] = $vid;
    return $vid;
}
function client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            $ip = trim(explode(',', $_SERVER[$k])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
    }
    return '0.0.0.0';
}
function device_type(): string
{
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if (preg_match('/mobile|android|iphone|ipod/i', $ua)) return 'mobile';
    if (preg_match('/ipad|tablet/i', $ua)) return 'tablet';
    return 'desktop';
}
function geo_lookup(string $ip): array
{
    if (setting('geo_lookup', '1') !== '1') return ['', ''];
    $cached = one("SELECT country, region FROM geo_cache WHERE ip = ? LIMIT 1", [$ip]);
    if ($cached) return [$cached['country'], $cached['region']];
    $country = ''; $region = '';
    $ctx = stream_context_create(['http' => ['timeout' => 2]]);
    $raw = @file_get_contents('http://ip-api.com/json/' . urlencode($ip) . '?fields=status,country,regionName', false, $ctx);
    if ($raw) {
        $j = json_decode($raw, true);
        if (($j['status'] ?? '') === 'success') { $country = $j['country'] ?? ''; $region = $j['regionName'] ?? ''; }
    }
    q("INSERT IGNORE INTO geo_cache (ip, country, region, created_at) VALUES (?,?,?,NOW())", [$ip, $country, $region]);
    return [$country, $region];
}
/* সার্চ ইঞ্জিন/বট গোনায় ধরব না */
function is_bot(): bool
{
    $ua = strtolower((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if ($ua === '') return true;
    foreach (['bot', 'crawl', 'spider', 'slurp', 'facebookexternalhit', 'preview', 'headless',
              'monitor', 'uptime', 'curl', 'wget', 'python', 'axios', 'lighthouse', 'pagespeed'] as $k) {
        if (strpos($ua, $k) !== false) return true;
    }
    return false;
}

function track_visit(string $path): void
{
    if (is_bot()) return;
    /* হোভারে আগেভাগে লোড হওয়া (প্রিফেচ) পেজ গোনা হবে না */
    if (($_SERVER['HTTP_X_PREFETCH'] ?? '') === '1') return;

    try {
        $vid = visitor_id(); $ip = client_ip(); $today = date('Y-m-d');

        /* একই ডিভাইস একই পেজ ১ মিনিটের মধ্যে আবার এলে দুবার গোনা হবে না */
        $dup = one("SELECT id FROM visits WHERE vid = ? AND path = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND) LIMIT 1",
                   [$vid, mb_substr($path, 0, 190)]);
        if ($dup) {
            q("UPDATE visitors SET last_seen = NOW() WHERE vid = ?", [$vid]);
            return;
        }
        $exists = one("SELECT vid FROM visitors WHERE vid = ? LIMIT 1", [$vid]);
        if (!$exists) {
            [$country, $region] = geo_lookup($ip);
            q("INSERT INTO visitors (vid, country, region, device, first_seen, last_seen, hits)
               VALUES (?,?,?,?,NOW(),NOW(),1)", [$vid, $country, $region, device_type()]);
        } else {
            q("UPDATE visitors SET last_seen = NOW(), hits = hits + 1 WHERE vid = ?", [$vid]);
        }
        q("INSERT INTO visits (vid, path, day, created_at) VALUES (?,?,?,NOW())", [$vid, mb_substr($path, 0, 190), $today]);
    } catch (Throwable $e) { /* ট্র্যাকিং কখনো সাইট ভাঙবে না */ }
}
function count_post_view(int $postId): void
{
    /* হোভারে আগেভাগে লোড হওয়া (প্রিফেচ), সার্চ ইঞ্জিনের বট আর নিজের এডমিন —
       কোনোটাই আসল পাঠক নয়, তাই গোনা হবে না */
    if (is_bot()) return;
    if (($_SERVER['HTTP_X_PREFETCH'] ?? '') === '1') return;
    if (!empty($_SESSION['admin_id'])) return;

    try {
        $vid = visitor_id();
        $ins = q("INSERT IGNORE INTO post_views (post_id, vid, day) VALUES (?,?,?)", [$postId, $vid, date('Y-m-d')]);
        if ($ins->rowCount() > 0) q("UPDATE posts SET views = views + 1 WHERE id = ?", [$postId]);
    } catch (Throwable $e) {}
}

/* ---------- ক্যাটাগরি লিস্ট (মেনু) ---------- */
function categories(): array
{
    static $c = null;
    if ($c !== null) return $c;
    try { $c = all("SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC"); }
    catch (Throwable $e) { $c = []; }
    return $c;
}
function category_by_slug(string $slug): ?array
{
    foreach (categories() as $c) if ($c['slug'] === $slug) return $c;
    return one("SELECT * FROM categories WHERE slug = ? LIMIT 1", [$slug]);
}
function per_page(): int
{
    $n = (int)setting('per_page', '20');
    return in_array($n, [10, 20, 30, 50, 70, 100], true) ? $n : 20;
}
