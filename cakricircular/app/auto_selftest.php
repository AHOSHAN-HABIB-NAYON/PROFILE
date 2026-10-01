<?php
/* =========================================================
   অটোমেশন v61 — স্ব-পরীক্ষা (acceptance tests)

   নিরাপত্তা:
   • নকল সোর্স (মক REST) আর নকল AI — আসল OpenAI-তে কিছুই যায় না, টাকা খরচ হয় না।
   • সবকিছু একটা ডেটাবেজ ট্রানজ্যাকশনের ভেতরে চলে, শেষে ROLLBACK —
     আসল ডেটা, সেটিংস, পোস্ট কিছুই বদলায় না, কিছু থেকে যায় না।
   • কোনো রান চলমান থাকলে পরীক্ষা শুরুই হয় না।
   ========================================================= */

function auto_st_html(string $body, ?string $vac = null, ?string $start = null, ?string $deadline = null): string
{
    $rows = '';
    if ($vac !== null)      $rows .= '<tr><th>মোট শূন্যপদ</th><td>' . $vac . ' জন</td></tr>';
    if ($start !== null)    $rows .= '<tr><th>আবেদন শুরুর তারিখ</th><td>' . $start . ' সকাল ১০:০০ টা</td></tr>';
    if ($deadline !== null) $rows .= '<tr><th>আবেদনের শেষ তারিখ</th><td>' . $deadline . ' সন্ধ্যা ৬:০০ টা</td></tr>';
    return '<div class="kk-star-ratings kksr-auto"><div class="kksr-legend">' . mt_rand(30, 49) / 10 . '/5 - (' . mt_rand(1, 99) . ' votes)</div></div>'
         . '<div class="jc-trust-badge">সর্বশেষ আপডেট: ' . mt_rand(1, 28) . ' সেপ্টেম্বর ২০২৬</div>'
         . '<article class="jc-wrap"><p>' . $body . ' এই বিজ্ঞপ্তিটি শুধু স্ব-পরীক্ষার জন্য বানানো, বাস্তবের কোনো নিয়োগ নয়। '
         . 'আবেদনের নিয়ম, যোগ্যতা, বয়সসীমা ও অন্যান্য তথ্য এখানে লেখা থাকে যাতে লেখাটি যথেষ্ট লম্বা হয়।</p>'
         . ($rows ? '<table class="jc-table"><tbody>' . $rows . '</tbody></table>' : '')
         . '<p>বিস্তারিত জানতে অফিসিয়াল ওয়েবসাইট দেখুন। পরীক্ষার ধাপ, প্রবেশপত্র ও ফলাফলের খবর পরে জানানো হবে।</p></article>';
}

function auto_st_post(int $id, string $title, string $date, string $html, ?string $modified = null): array
{
    return ['id' => $id, 'title' => $title, 'date' => $date, 'modified' => $modified ?: $date,
            'slug' => 'selftest-' . $id, 'link' => 'https://selftest.invalid/selftest-' . $id . '/', 'html' => $html];
}

function auto_selftest(): array
{
    if (auto_is_running()) return ['rows' => [], 'error' => 'এখন একটি রান চলছে — শেষ হলে আবার চাপুন'];
    ensure_auto_v62();

    $rows = [];
    $add = function (string $name, bool $pass, string $detail) use (&$rows) {
        $rows[] = ['name' => $name, 'pass' => $pass, 'detail' => $detail];
    };
    $error = '';

    /* ---------- নকল সোর্স ও নকল AI ---------- */
    $T = ['posts' => [], 'ai' => 0, 'rest_down' => false];
    $now = function (int $plusMin = 0): string { return date('Y-m-d H:i:s', time() + $plusMin * 60); };

    for ($i = 0; $i < 120; $i++) {
        $id = 1000 + $i;
        $T['posts'][$id] = auto_st_post($id, 'স্বপরীক্ষা পুরনো পোস্ট নম্বর ' . $id . ' নিয়োগ বিজ্ঞপ্তি',
                                        '2026-09-' . sprintf('%02d', 1 + ($i % 20)) . ' 10:00:00', auto_st_html('পুরনো পোস্ট ' . $id));
    }

    $GLOBALS['__auto_test']     = true;
    $GLOBALS['__auto_test_set'] = ['auto_start_date' => '2026-01-01', 'auto_daily_cap' => '50', 'auto_batch' => '1',
                                   'auto_source' => 'https://selftest.invalid'];
    $GLOBALS['__auto_mock_http'] = function (string $url) use (&$T) {
        if ($T['rest_down']) return [503, 'Service Unavailable', '', []];
        $u = parse_url($url);
        $path = (string)($u['path'] ?? '');
        parse_str((string)($u['query'] ?? ''), $qs);
        $iso = function ($d) { return str_replace(' ', 'T', (string)$d); };
        if (preg_match('~/wp-json/wp/v2/posts/(\d+)$~', $path, $m)) {
            $p = $T['posts'][(int)$m[1]] ?? null;
            if (!$p) return [404, '{"code":"rest_post_invalid_id"}', '', []];
            return [200, json_encode(['id' => $p['id'], 'date' => $iso($p['date']), 'modified' => $iso($p['modified']),
                                      'link' => $p['link'], 'title' => ['rendered' => $p['title']],
                                      'content' => ['rendered' => $p['html']]], JSON_UNESCAPED_UNICODE), '', []];
        }
        if (preg_match('~/wp-json/wp/v2/posts$~', $path)) {
            $ob   = ($qs['orderby'] ?? 'date') === 'modified' ? 'modified' : 'date';
            $list = array_values($T['posts']);
            usort($list, function ($a, $b) use ($ob) { return strcmp($b[$ob], $a[$ob]) ?: ($b['id'] <=> $a['id']); });
            $per   = max(1, (int)($qs['per_page'] ?? 10));
            $page  = max(1, (int)($qs['page'] ?? 1));
            $pages = max(1, (int)ceil(count($list) / $per));
            if ($page > $pages) return [400, '{"code":"rest_post_invalid_page_number"}', '', []];
            $out = [];
            foreach (array_slice($list, ($page - 1) * $per, $per) as $p) {
                $out[] = ['id' => $p['id'], 'date' => $iso($p['date']), 'modified' => $iso($p['modified']),
                          'link' => $p['link'], 'slug' => $p['slug'], 'title' => ['rendered' => $p['title']]];
            }
            return [200, json_encode($out, JSON_UNESCAPED_UNICODE), '', ['x-wp-totalpages' => (string)$pages, 'x-wp-total' => (string)count($list)]];
        }
        return [404, '', '', []];
    };
    $GLOBALS['__auto_mock_ai'] = function (array $scr) use (&$T) {
        $T['ai']++;
        /* আসল AI-এর মতো পদ সংখ্যা ও তারিখ লেখা থেকে তুলে দেয় */
        $full = (string)($scr['full'] ?? $scr['text'] ?? '');
        $vac  = auto_sp_vacancy((string)$scr['title'], $full);
        return ['title' => 'পরীক্ষা খসড়া: ' . $scr['title'], 'category' => '', 'company' => '', 'vacancy' => $vac ? (string)$vac : '',
                'division' => 'সারাদেশ', 'district' => '', 'salary' => '', 'employment_type' => 'FULL_TIME',
                'application_start' => (string)auto_sp_appstart($full), 'deadline' => (string)auto_sp_deadline($full),
                'apply_url' => '', 'official_url' => '',
                'content_html' => '<p>পরীক্ষা</p>', 'meta_title' => '', 'meta_description' => '', 'keywords' => '',
                'confidence_note' => '', '_usage' => ['prompt_tokens' => 100, 'completion_tokens' => 50]];
    };

    $run    = function () { return auto_run(true, 1); };
    $status = function (int $sid) { return (string)col("SELECT status FROM source_posts WHERE source_id = ?", [$sid]); };
    $pdo    = db();

    try {
        $pdo->beginTransaction();
        /* ট্রানজ্যাকশনের ভেতরে ফাঁকা করে নিই — শেষে ROLLBACK-এ সব আগের মতো ফিরে আসবে */
        q("DELETE FROM source_posts");
        q("DELETE FROM source_decisions");
        q("DELETE FROM settings WHERE k = 'auto_sp_base'");

        /* ১. প্রথম রান = বেসলাইন */
        $s = $run();
        $cnt = (int)col("SELECT COUNT(*) FROM source_posts");
        $bl  = (int)col("SELECT COUNT(*) FROM source_posts WHERE status = 'baseline'");
        $add('১. প্রথম রান: বেসলাইন তৈরি, AI কল ০',
             $cnt === 120 && $bl === 120 && $T['ai'] === 0,
             "সোর্সে ১২০টি → তালিকায় $cnt, বেসলাইন $bl, AI কল {$T['ai']}");

        /* ২. কিছু না বদলালে — নতুন ০, AI ০ */
        $ai0 = $T['ai'];
        $s = $run();
        $add('২. পরের রান, সোর্সে কিছু বদলায়নি: নতুন ০, AI কল ০',
             $T['ai'] === $ai0 && (int)$s['new'] === 0,
             "নতুন {$s['new']}, AI কল " . ($T['ai'] - $ai0) . " — কেন থামল: {$s['stop']}");

        /* ৩. সত্যিকারের নতুন ID — ঠিক ১টি খসড়া; আবার চালালে ০ */
        $T['posts'][5001] = auto_st_post(5001, 'স্বপরীক্ষা একেবারে নতুন সংস্থা ওমেগা নিয়োগ ২০২৬', $now(), auto_st_html('নতুন পোস্ট', '৪০', '০১ অক্টোবর ২০৩০', '৩০ অক্টোবর ২০৩০'));
        $ai0 = $T['ai'];
        $s = $run();
        $pid = (int)col("SELECT my_post_id FROM source_posts WHERE source_id = 5001");
        $draft = $pid ? one("SELECT status, review_pending FROM posts WHERE id = ?", [$pid]) : null;
        $okDraft = $draft && (int)$draft['status'] === 0 && (int)$draft['review_pending'] === 1;
        $add('৩. নতুন সোর্স ID: ঠিক ১টি খসড়া (প্রকাশ হয়নি)',
             $T['ai'] - $ai0 === 1 && $status(5001) === 'done' && $okDraft,
             'AI কল ' . ($T['ai'] - $ai0) . ', অবস্থা ' . $status(5001) . ', খসড়া #' . $pid . ($okDraft ? ' (রিভিউ বাকি, অপ্রকাশিত)' : ' — পাওয়া যায়নি/প্রকাশিত!'));

        $ai0 = $T['ai'];
        $s = $run();
        $add('৪. "একটি চালান" পরপর দুবার: দ্বিতীয়বার নতুন ০, AI কল ০',
             $T['ai'] === $ai0 && (int)$s['new'] === 0 && (int)$s['created'] === 0,
             "নতুন {$s['new']}, তৈরি {$s['created']}, AI কল " . ($T['ai'] - $ai0));

        /* ৫. একসাথে দুটো রান — দ্বিতীয়টা শুরুই হয় না; একটি পোস্ট একজনই দখল করতে পারে */
        $T['posts'][5002] = auto_st_post(5002, 'স্বপরীক্ষা সমান্তরাল রান পরীক্ষা সংস্থা ডেল্টা নিয়োগ', $now(1), auto_st_html('সমান্তরাল', '১২', null, '১০ নভেম্বর ২০৩০'));
        $ai0 = $T['ai'];
        $busyDb = $busyFile = false; $dbLockTested = false;
        try {
            $pdo2 = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET, DB_USER, DB_PASS,
                            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $st = $pdo2->prepare("SELECT GET_LOCK(?, 0)"); $st->execute([auto_sp_lock_name()]);
            if ((int)$st->fetchColumn() === 1) {
                $dbLockTested = true;
                $s = $run();
                $busyDb = mb_strpos((string)$s['stop'], 'চলছে') !== false;
                $pdo2->prepare("SELECT RELEASE_LOCK(?)")->execute([auto_sp_lock_name()]);
            }
            $pdo2 = null;
        } catch (Throwable $e) {}
        $fh = @fopen(auto_lock_path(), 'c');
        if ($fh && flock($fh, LOCK_EX | LOCK_NB)) {
            $s = $run();
            $busyFile = mb_strpos((string)$s['stop'], 'চলছে') !== false;
            flock($fh, LOCK_UN);
        }
        if ($fh) fclose($fh);
        $aiDuringBusy = $T['ai'] - $ai0;
        q("INSERT INTO source_posts (source_id, status, title_raw, created_at, updated_at) VALUES (7000, 'new', 'দখল-পরীক্ষা', NOW(), NOW())");
        $c1 = auto_sp_claim(7000, 'new');
        $c2 = auto_sp_claim(7000, 'new');
        q("UPDATE source_posts SET status = 'baseline' WHERE source_id = 7000");
        $s = $run();
        $aiAfter = $T['ai'] - $ai0;
        $add('৫. একসাথে দুটো রান: দ্বিতীয়টা থামে, একই পোস্টে AI মাত্র ১ বার',
             ($busyDb || !$dbLockTested) && $busyFile && $aiDuringBusy === 0 && $c1 && !$c2 && $aiAfter === 1 && $status(5002) === 'done',
             'DB তালা ধরা থাকলে: ' . ($dbLockTested ? ($busyDb ? 'থেমেছে' : 'থামেনি!') : 'এই সার্ভারে পরীক্ষা করা যায়নি')
             . '; ফাইল তালা ধরা থাকলে: ' . ($busyFile ? 'থেমেছে' : 'থামেনি!')
             . "; তালা থাকাকালীন AI কল $aiDuringBusy; দখল: প্রথমবার " . ($c1 ? 'পেয়েছে' : 'পায়নি') . ', দ্বিতীয়বার ' . ($c2 ? 'পেয়েছে!' : 'পায়নি')
             . "; তালা খোলার পর AI কল $aiAfter");

        /* ৬. সোর্সে শুধু তারিখ/রেটিং বদলালে — কিছুই না; লেখা বদলালে — "সোর্সে আপডেট", AI নয় */
        $ai0 = $T['ai'];
        $T['posts'][5001]['modified'] = $now(5);
        $T['posts'][5001]['html'] = auto_st_html('নতুন পোস্ট', '৪০', '০১ অক্টোবর ২০৩০', '৩০ অক্টোবর ২০৩০');   /* রেটিং/ব্যাজ নতুন, লেখা একই */
        $s = $run();
        $st1 = $status(5001);
        $T['posts'][5001]['modified'] = $now(10);
        $T['posts'][5001]['html'] = auto_st_html('নতুন পোস্ট', '৪০', '০১ অক্টোবর ২০৩০', '১৫ নভেম্বর ২০৩০');   /* শেষ তারিখ বাড়ানো */
        $s = $run();
        $st2 = $status(5001);
        $add('৬. সোর্সে মডিফাই: শুধু তারিখ বদলালে কিছু না; লেখা বদলালে "সোর্সে আপডেট", AI কল ০',
             $st1 === 'done' && $st2 === 'update_pending' && $T['ai'] === $ai0,
             "শুধু তারিখ/রেটিং বদলানোর পর: $st1; লেখা বদলানোর পর: $st2; AI কল " . ($T['ai'] - $ai0));

        /* ৭. শিরোনাম আমাদের পোস্টের সাথে এক — তথ্য না থাকলে রিভিউ; সব এক হলে ডুপ্লিকেট; তারিখ আলাদা হলে নতুন */
        $cats = all("SELECT id, name, slug FROM categories ORDER BY sort_order, id");
        $divs = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'সারাদেশ'];
        $base = ['category' => '', 'company' => '', 'division' => 'সারাদেশ', 'employment_type' => 'FULL_TIME', 'content_html' => '<p>আমাদের পোস্ট</p>'];
        $titleX = 'স্বপরীক্ষা কল্পিত প্রতিষ্ঠান আলফা নিয়োগ বিজ্ঞপ্তি ২০২৬';
        $titleY = 'স্বপরীক্ষা কাল্পনিক সংস্থা বেটা ১৬ পদে নিয়োগ ২০২৬';
        auto_save($base + ['title' => $titleX, 'vacancy' => '', 'deadline' => ''], ['links' => [], 'pdf' => ''], '', '', $cats, $divs, ['skip_guard' => true]);
        auto_save($base + ['title' => $titleY, 'vacancy' => '১৬', 'deadline' => '2030-10-17', 'application_start' => '2030-09-27'],
                  ['links' => [], 'pdf' => ''], '', '', $cats, $divs, ['skip_guard' => true]);

        $ai0 = $T['ai'];
        $T['posts'][5003] = auto_st_post(5003, $titleX, $now(15), auto_st_html('আলফা'));
        $s = $run();
        $stX = $status(5003);
        $T['posts'][5004] = auto_st_post(5004, $titleY, $now(16), auto_st_html('বেটা', '১৬', '২৭ সেপ্টেম্বর ২০৩০', '১৭ অক্টোবর ২০৩০'));
        $s = $run();
        $stY = $status(5004);
        $aiMid = $T['ai'] - $ai0;
        $add('৭. শিরোনাম আমাদের পোস্টের সমান: তথ্য না মিললে রিভিউ, সব এক হলে ডুপ্লিকেট — AI কল ০',
             $stX === 'needs_review' && $stY === 'skipped_duplicate' && $aiMid === 0,
             "তথ্য নেই → $stX; পদ+শুরু+শেষ এক → $stY; AI কল $aiMid");

        $T['posts'][5005] = auto_st_post(5005, $titleY, $now(17), auto_st_html('বেটা নতুন', '১৬', '০১ নভেম্বর ২০৩০', '২০ নভেম্বর ২০৩০'));
        $s = $run();
        $add('৮. একই শিরোনাম কিন্তু শেষ তারিখ আলাদা: নতুন নিয়োগ ধরে ঠিক ১টি খসড়া',
             $status(5005) === 'done' && $T['ai'] - $ai0 === 1,
             'অবস্থা ' . $status(5005) . ', AI কল ' . ($T['ai'] - $ai0));

        /* ৯. সোর্সের আসল নিয়ম: পুরনো পাতায় (একই ID) নতুন বিজ্ঞপ্তি লিখে তারিখ এগিয়ে দেয় */
        $ai0 = $T['ai'];
        $T['posts'][1005]['date'] = $now(30); $T['posts'][1005]['modified'] = $now(30);
        $T['posts'][1005]['title'] = 'স্বপরীক্ষা পুরনো পাতায় নতুন বিজ্ঞপ্তি গামা ২২ পদে নিয়োগ';
        $T['posts'][1005]['html']  = auto_st_html('গামা নতুন', '২২', '০১ ডিসেম্বর ২০৩০', '৩০ ডিসেম্বর ২০৩০');
        $s = $run();
        $add('৯. পুরনো পাতায় নতুন বিজ্ঞপ্তি (একই ID, তারিখ এগিয়েছে): নতুন খসড়া তৈরি',
             $status(1005) === 'done' && $T['ai'] - $ai0 === 1,
             'অবস্থা ' . $status(1005) . ', AI কল ' . ($T['ai'] - $ai0) . " — এটাই আগে ধরা পড়ছিল না");

        /* ১০. একই লেখা শুধু তারিখ বদলে আবার প্রকাশ → AI নয়; তথ্য বদলে প্রকাশ → নতুন পোস্ট */
        $ai0 = $T['ai'];
        $oldPid = (int)col("SELECT my_post_id FROM source_posts WHERE source_id = 5002");
        $T['posts'][5002]['date'] = $now(130); $T['posts'][5002]['modified'] = $now(130);   /* ১ ঘণ্টার বেশি এগোলে "নতুন করে প্রকাশ" */
        $T['posts'][5002]['html'] = auto_st_html('সমান্তরাল', '১২', null, '১০ নভেম্বর ২০৩০');   /* লেখা একই (রেটিং/ব্যাজ নতুন) */
        $s = $run();
        $sameSt = $status(5002); $aiSame = $T['ai'] - $ai0;
        $T['posts'][5002]['date'] = $now(260); $T['posts'][5002]['modified'] = $now(260);
        $T['posts'][5002]['html'] = auto_st_html('সমান্তরাল নতুন বছর', '৩০', null, '১০ ডিসেম্বর ২০৩১');
        $s = $run();
        $newPid = (int)col("SELECT my_post_id FROM source_posts WHERE source_id = 5002");
        $add('১০. একই পাতা আবার প্রকাশ: লেখা একই হলে AI নয়; নতুন বিজ্ঞপ্তি হলে আলাদা নতুন পোস্ট (পুরনোটা অক্ষত)',
             $sameSt === 'done' && $aiSame === 0 && $T['ai'] - $ai0 === 1 && $newPid > 0 && $newPid !== $oldPid,
             "শুধু তারিখ বদলালে: $sameSt, AI কল $aiSame; নতুন বিজ্ঞপ্তিতে: AI কল " . ($T['ai'] - $ai0 - $aiSame) . ", পুরনো পোস্ট #$oldPid → নতুন পোস্ট #$newPid");

        /* ১১. মেয়াদ শেষ হয়ে যাওয়া বিজ্ঞপ্তি → AI নয় */
        $ai0 = $T['ai'];
        $T['posts'][1006]['date'] = $now(60); $T['posts'][1006]['modified'] = $now(60);
        $T['posts'][1006]['html'] = auto_st_html('পুরনো মেয়াদ', '৫', '০১ জানুয়ারি ২০২০', '১০ জানুয়ারি ২০২০');
        $s = $run();
        $add('১১. মেয়াদ শেষ হয়ে যাওয়া বিজ্ঞপ্তি: AI কল ০',
             $status(1006) === 'skipped_duplicate' && $T['ai'] === $ai0,
             'অবস্থা ' . $status(1006) . ', AI কল ' . ($T['ai'] - $ai0));

        /* ১২. REST বন্ধ — AI নয় */
        $ai0 = $T['ai'];
        $T['rest_down'] = true;
        $T['posts'][5006] = auto_st_post(5006, 'স্বপরীক্ষা রেস্ট বন্ধ পরীক্ষা', $now(20), auto_st_html('রেস্ট'));
        $s = $run();
        $T['rest_down'] = false;
        $add('১২. সোর্সের REST API বন্ধ: কোনো AI কল নয়, কারণ জানায়',
             $T['ai'] === $ai0 && mb_strpos((string)$s['stop'], 'REST') !== false,
             'AI কল ' . ($T['ai'] - $ai0) . " — কেন থামল: {$s['stop']}");

        /* ১৩. দৈনিক সীমা */
        $ai0 = $T['ai'];
        $GLOBALS['__auto_test_set']['auto_daily_cap'] = (string)max(1, auto_sp_ai_used_today());
        $s = $run();
        $add('১৩. দৈনিক AI সীমা পূর্ণ: আর AI কল নয়',
             $T['ai'] === $ai0 && mb_strpos((string)$s['stop'], 'সীমা') !== false,
             'AI কল ' . ($T['ai'] - $ai0) . " — কেন থামল: {$s['stop']}");

    } catch (Throwable $e) {
        $error = 'পরীক্ষা মাঝপথে থেমেছে: ' . mb_substr($e->getMessage(), 0, 200) . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')';
    } finally {
        try { if ($pdo->inTransaction()) $pdo->rollBack(); } catch (Throwable $e) {}
        unset($GLOBALS['__auto_test'], $GLOBALS['__auto_test_set'], $GLOBALS['__auto_mock_http'], $GLOBALS['__auto_mock_ai']);
    }

    $pass = count(array_filter($rows, function ($r) { return $r['pass']; }));
    try { auto_log('স্ব-পরীক্ষা: ' . $pass . '/' . count($rows) . ' পাস' . ($error ? " — $error" : ''), $error || $pass < count($rows) ? 'warn' : 'info'); }
    catch (Throwable $e) {}
    return ['rows' => $rows, 'error' => $error];
}
