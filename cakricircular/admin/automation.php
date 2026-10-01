<?php
/* ================= অটোমেশন ================= */
admin_start('অটোমেশন');
need('settings');
ensure_auto_schema();
ensure_auto_v61();
ensure_auto_v62();
require_once APP_ROOT . '/app/automation.php';

/* ক্রনের জন্য সাইটের আসল ঠিকানা জমা রাখি (কমান্ড লাইনে এটা জানা যায় না) */
$__hf = UPLOAD_PATH . '/site/.site_url';
if (!is_file($__hf) || trim((string)@file_get_contents($__hf)) !== BASE_URL) {
    @mkdir(UPLOAD_PATH . '/site', 0755, true);
    @file_put_contents($__hf, BASE_URL);
}

/* ক্রন চালানোর গোপন কী — প্রথমবার নিজে থেকে তৈরি */
if (setting('auto_cron_key', '') === '') set_setting('auto_cron_key', bin2hex(random_bytes(16)));
$selftest = null;


if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $do = (string)($_POST['do'] ?? '');

    if ($do === 'save') {
        set_setting('auto_enabled',      !empty($_POST['auto_enabled']) ? '1' : '0');
        set_setting('auto_model',        trim((string)($_POST['auto_model'] ?? '')) ?: 'gpt-5.6-luna');
        set_setting('auto_notify_email', trim((string)($_POST['auto_notify_email'] ?? '')));
        set_setting('auto_source',       rtrim(trim((string)($_POST['auto_source'] ?? '')), '/') ?: 'https://bdgovtjob.net');
        $sd = trim((string)($_POST['auto_start_date'] ?? ''));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $sd)) set_setting('auto_start_date', $sd);
        set_setting('auto_batch', (string)max(1, min(5, (int)($_POST['auto_batch'] ?? 1))));
        set_setting('auto_daily_cap', (string)max(1, min(200, (int)($_POST['auto_daily_cap'] ?? 10))));
        foreach (['auto_price_in', 'auto_price_out'] as $pk) {
            $pv = trim((string)($_POST[$pk] ?? ''));
            set_setting($pk, is_numeric($pv) && (float)$pv >= 0 ? (string)(float)$pv : '');
        }

        /* গোপন ঘর — খালি রাখলে আগেরটাই থাকবে */
        $k = trim((string)($_POST['auto_openai_key'] ?? ''));
        if ($k !== '') set_setting('auto_openai_key', $k);
        if (!empty($_POST['clear_key'])) set_setting('auto_openai_key', '');

        set_setting('smtp_host',      trim((string)($_POST['smtp_host'] ?? '')));
        set_setting('smtp_port',      (string)(int)($_POST['smtp_port'] ?? 465));
        set_setting('smtp_secure',    in_array($_POST['smtp_secure'] ?? '', ['ssl', 'tls', 'none'], true) ? $_POST['smtp_secure'] : 'ssl');
        set_setting('smtp_user',      trim((string)($_POST['smtp_user'] ?? '')));
        set_setting('smtp_from',      trim((string)($_POST['smtp_from'] ?? '')));
        set_setting('smtp_from_name', trim((string)($_POST['smtp_from_name'] ?? '')));
        $sp = (string)($_POST['smtp_pass'] ?? '');
        if ($sp !== '') set_setting('smtp_pass', $sp);

        flash('ok', 'অটোমেশনের সেটিংস সেভ হয়েছে।');
        admin_go(au('automation'));
    }

    if ($do === 'test_mail') {
        $to = trim(setting('auto_notify_email', 'support.cakricircular@gmail.com'));
        [$ok, $why] = send_mail($to, 'পরীক্ষামূলক মেইল — ' . setting('site_name', 'চাকরি সার্কুলার'),
            '<div style="font-family:Arial,sans-serif;padding:16px">✅ SMTP ঠিকঠাক কাজ করছে। এই ঠিকানাতেই নতুন পোস্টের খবর আসবে।</div>');
        flash($ok ? 'ok' : 'err', $ok ? "পরীক্ষামূলক মেইল পাঠানো হয়েছে: $to" : "মেইল যায়নি — $why");
        admin_go(au('automation'));
    }

    if ($do === 'run_ajax') {
        /* সত্যিই আরেকটা রান চললে নতুন শুরু করি না */
        if (auto_is_running()) {
            while (ob_get_level() > 0) ob_end_clean();
            header('Content-Type: application/json; charset=utf-8');
            $job = json_decode(setting('auto_job', ''), true) ?: [];
            echo json_encode(['ok' => true, 'busy' => true, 'id' => $job['id'] ?? ''], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $jobId = bin2hex(random_bytes(6));
        set_setting('auto_job', json_encode(['state' => 'running', 'id' => $jobId, 'at' => time()]));

        /* কাজটা ব্রাউজারের সাথে জড়াই না — সার্ভার নিজেকেই আলাদা করে ডাকে (ক্রনের মতো) */
        $spawn = url('cron.php') . '?key=' . rawurlencode(setting('auto_cron_key')) . '&manual=1&job=' . $jobId;
        $spawned = false;
        if (function_exists('curl_init')) {
            $ch = curl_init($spawn);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3,
                                    CURLOPT_NOSIGNAL => true, CURLOPT_FOLLOWLOCATION => true]);
            $body = (string)curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $errn = curl_errno($ch);
            curl_close($ch);
            /* "started" পেলে বা সময় শেষে কেটে গেলে (কাজ চলছে) — দুটোই ঠিক আছে */
            $spawned = ($code === 200 && strpos($body, 'started') !== false) || $errn === CURLE_OPERATION_TIMEDOUT;
        }

        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        if ($spawned) {
            echo json_encode(['ok' => true, 'started' => true, 'id' => $jobId], JSON_UNESCAPED_UNICODE);
            exit;
        }

        /* নিজেকে ডাকা না গেলে (কিছু হোস্টিংয়ে বন্ধ থাকে) — আগের পদ্ধতিতে এখানেই চালাই */
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ignore_user_abort(true);
        @set_time_limit(300);
        echo json_encode(['ok' => true, 'started' => true, 'id' => $jobId], JSON_UNESCAPED_UNICODE);
        if (function_exists('litespeed_finish_request'))    litespeed_finish_request();
        elseif (function_exists('fastcgi_finish_request'))  fastcgi_finish_request();
        else                                                flush();

        $r = ['msg' => 'অজানা ত্রুটি', 'created' => 0, 'found' => 0, 'stop' => 'অজানা ত্রুটি', 'events' => []];
        try { $r = auto_run(true, 1); }
        catch (Throwable $e) { $r['msg'] = $r['stop'] = 'ত্রুটি: ' . $e->getMessage(); auto_log($r['msg'], 'error'); }
        set_setting('auto_job', json_encode(['state' => 'done', 'id' => $jobId, 'at' => time(), 'sum' => $r], JSON_UNESCAPED_UNICODE));
        exit;
    }
    if ($do === 'log_ajax') {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        $rows = all("SELECT level, msg, created_at FROM auto_log ORDER BY id DESC LIMIT 40");
        foreach ($rows as &$l) $l['t'] = date('d/m H:i', strtotime($l['created_at']));
        $job = json_decode(setting('auto_job', ''), true) ?: [];
        /* "চলছে" লেখা আছে কিন্তু কোনো প্রক্রিয়া আসলে চলছে না — মাঝপথে থেমে গেছে */
        if (($job['state'] ?? '') === 'running' && time() - (int)($job['at'] ?? 0) > 12 && !auto_is_running()) $job['state'] = 'dead';
        echo json_encode(['ok' => true, 'rows' => $rows, 'job' => $job,
            'pending' => (int)col("SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL")], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* ---- সোর্স ট্র্যাকিং (v61): তালিকার বোতামগুলো ---- */
    if ($do === 'sp_act') {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        $sid = (int)($_POST['id'] ?? 0);
        $act = (string)($_POST['act'] ?? '');
        $row = $sid ? one("SELECT * FROM source_posts WHERE source_id = ?", [$sid]) : null;
        $out = ['ok' => false, 'msg' => 'পোস্টটি পাওয়া যায়নি — পাতা রিফ্রেশ করুন।'];
        if ($row) {
            $st = $row['status'];
            if ($act === 'ai' && in_array($st, ['needs_review', 'baseline', 'skipped_duplicate'], true)) {
                q("UPDATE source_posts SET approved = 1, note = 'এডমিন AI দিয়ে তৈরি করতে বলেছেন', updated_at = NOW() WHERE source_id = ?", [$sid]);
                auto_sp_decide($sid, 'admin_ai', 'এডমিন নতুন হিসেবে তৈরি করতে বলেছেন (AI) — ' . mb_substr((string)$row['title_raw'], 0, 70));
                $out = ['ok' => true, 'run' => true, 'msg' => 'সারিতে রাখা হলো — এখনই তৈরি হচ্ছে'];
            } elseif ($act === 'skip' && in_array($st, ['needs_review', 'baseline'], true)) {
                q("UPDATE source_posts SET status = 'skipped_duplicate', approved = 0, note = 'এডমিন ডুপ্লিকেট বলেছেন', updated_at = NOW() WHERE source_id = ?", [$sid]);
                auto_sp_decide($sid, 'admin_skip', 'এডমিন ডুপ্লিকেট বলে বাদ দিয়েছেন — ' . mb_substr((string)$row['title_raw'], 0, 70));
                $out = ['ok' => true, 'run' => false, 'msg' => 'বাদ দেওয়া হলো'];
            } elseif ($act === 'update' && $st === 'update_pending') {
                q("UPDATE source_posts SET approved = 1, job = 'update', note = 'এডমিন আপডেট করতে বলেছেন', updated_at = NOW() WHERE source_id = ?", [$sid]);
                auto_sp_decide($sid, 'admin_update', 'এডমিন আপডেট করতে বলেছেন (AI) — ' . mb_substr((string)$row['title_raw'], 0, 70));
                $out = ['ok' => true, 'run' => true, 'msg' => 'সারিতে রাখা হলো — এখনই আপডেট হচ্ছে'];
            } elseif ($act === 'ignore' && $st === 'update_pending') {
                q("UPDATE source_posts SET status = 'done', content_hash = COALESCE(new_hash, content_hash), new_hash = NULL, approved = 0,
                         note = 'এডমিন সোর্সের আপডেট বাদ দিয়েছেন', updated_at = NOW() WHERE source_id = ?", [$sid]);
                auto_sp_decide($sid, 'admin_ignore', 'এডমিন সোর্সের আপডেট বাদ দিয়েছেন — ' . mb_substr((string)$row['title_raw'], 0, 70));
                $out = ['ok' => true, 'run' => false, 'msg' => 'আপডেট বাদ — যেমন ছিল তেমনই থাকল'];
            } else {
                $out = ['ok' => false, 'msg' => 'এই অবস্থায় এটা করা যায় না — পাতা রিফ্রেশ করুন।'];
            }
        }
        echo json_encode($out, JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($do === 'sp_retry') {
        $n = q("UPDATE source_posts SET tries = 0, updated_at = DATE_SUB(NOW(), INTERVAL 1 HOUR),
                       note = 'এডমিন আবার চেষ্টা করতে বলেছেন' WHERE status = 'failed'")->rowCount();
        auto_log("এডমিন ব্যর্থ {$n}টি পোস্ট আবার চেষ্টার জন্য খুলে দিয়েছেন");
        flash('ok', $n ? bn($n) . 'টি ব্যর্থ পোস্ট আবার চেষ্টার সারিতে — "একটি চালান" চাপলে বা পরের ক্রনে হবে।' : 'ব্যর্থ কোনো পোস্ট নেই।');
        admin_go(au('automation'));
    }

    if ($do === 'sp_rebaseline') {
        if (auto_is_running()) {
            flash('err', 'একটি রান এখন চলছে — শেষ হলে আবার চাপুন।');
            admin_go(au('automation'));
        }
        /* আমাদের পোস্ট আছে এমনগুলো "done"-এ ফেরে (আপডেট ট্র্যাকিং চলবে); বাকি অপেক্ষমাণ সব বেসলাইনে — কোনো AI হবে না।
           কোনো সারি মোছা হয় না। */
        q("UPDATE source_posts SET status = 'done', content_hash = COALESCE(new_hash, content_hash), new_hash = NULL, approved = 0,
                 note = 'রিসেট: আগের অবস্থায়', updated_at = NOW()
           WHERE status IN ('update_pending','failed') AND my_post_id IS NOT NULL");
        $n = q("UPDATE source_posts SET status = 'baseline', approved = 0, tries = 0, note = 'রিসেট করে বেসলাইনে', updated_at = NOW()
                WHERE status IN ('new','failed','needs_review','skipped_duplicate') AND my_post_id IS NULL")->rowCount();
        set_setting('auto_sp_base', json_encode(['page' => 1, 'count' => 0, 'done' => 0], JSON_UNESCAPED_UNICODE));
        auto_log("এডমিন রিসেট ও নতুন বেসলাইন চালু করেছেন — অপেক্ষমাণ {$n}টি বেসলাইনে গেল (AI হবে না)", 'warn');
        flash('ok', 'রিসেট হয়েছে। পরের রানে সোর্সের সব পোস্ট আবার বেসলাইনে উঠবে (AI ডাকা হবে না)।');
        admin_go(au('automation'));
    }

    if ($do === 'selftest') {
        require_once APP_ROOT . '/app/auto_selftest.php';
        $selftest = auto_selftest();
    }

    if ($do === 'new_key') {
        set_setting('auto_cron_key', bin2hex(random_bytes(16)));
        flash('ok', 'নতুন ক্রন কী তৈরি হয়েছে — URL ক্রন ব্যবহার করলে সেখানেও বদলে নিন।');
        admin_go(au('automation'));
    }
}

$pending = (int)col("SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL");
$today   = (int)col("SELECT COUNT(*) FROM posts WHERE is_auto = 1 AND DATE(published_at) = CURDATE()");
$lastRun = setting('auto_last_run', '');
$lastDetail = json_decode(setting('auto_last_detail', ''), true) ?: null;
$lastSum = setting('auto_last_sum', '');
$logs    = all("SELECT * FROM auto_log ORDER BY id DESC LIMIT 40");
$hasKey  = setting('auto_openai_key', '') !== '';
$hasPass = setting('smtp_pass', '') !== '';
$enabled = setting('auto_enabled', '0') === '1';
$cronCmd = '/usr/bin/php ' . APP_ROOT . '/cron.php';

/* সোর্স ট্র্যাকিং (v61) — টেবিল না থাকলেও পাতা যেন না ভাঙে */
$spc = auto_sp_counts();
$spReview = $spUpd = $spFail = $spBase = $spDec = [];
$spUsed = 0; $spCap = auto_sp_cap(); $spBaseState = auto_sp_state('auto_sp_base');
try {
    $spReview = all("SELECT sp.*, p.title AS my_title FROM source_posts sp LEFT JOIN posts p ON p.id = sp.match_post_id
                     WHERE sp.status = 'needs_review' ORDER BY sp.updated_at DESC LIMIT 50");
    $spUpd    = all("SELECT sp.*, p.title AS my_title, p.status AS my_status FROM source_posts sp LEFT JOIN posts p ON p.id = sp.my_post_id
                     WHERE sp.status = 'update_pending' ORDER BY sp.updated_at DESC LIMIT 50");
    $spFail   = all("SELECT * FROM source_posts WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 30");
    $spBase   = all("SELECT * FROM source_posts WHERE status = 'baseline' AND my_post_id IS NULL
                     ORDER BY source_date DESC LIMIT 30");
    $spDec    = all("SELECT d.*, sp.title_raw FROM source_decisions d LEFT JOIN source_posts sp ON sp.source_id = d.source_id
                     ORDER BY d.id DESC LIMIT 30");
    $spUsed   = auto_sp_ai_used_today();
} catch (Throwable $e) {}
$cronUrl = url('cron.php') . '?key=' . setting('auto_cron_key');

show_flash();
?>

<?php if (!$hasKey): ?>
  <div class="msg" style="background:#fff7e8;color:#8a5a08;border:1px solid #f0dcb6">
    <i class="fa fa-key" style="margin-left:0;margin-right:7px"></i>
    OpenAI API key দেওয়া হয়নি — এটা ছাড়া অটোমেশন চলবে না। নিচে বসিয়ে সেভ করুন।
  </div>
<?php endif; ?>

<div class="grid g4 stats" style="margin-bottom:12px">
  <div class="stat"><span class="si <?= $enabled ? '' : 'r' ?>"><i class="fa fa-power-off"></i></span>
    <span class="sx"><span class="sl">অবস্থা</span><b style="font-size:1.05rem"><?= $enabled ? 'চালু' : 'বন্ধ' ?></b><span>প্রতি ১০ মিনিটে</span></span></div>
  <div class="stat"><span class="si y"><i class="fa fa-hourglass-half"></i></span>
    <span class="sx"><span class="sl">রিভিউ বাকি</span><b><?= bn($pending) ?></b>
      <span><?php if ($pending): ?><a href="<?= e(au('posts?review=1')) ?>">এখনই দেখুন</a><?php else: ?>সব দেখা হয়েছে<?php endif; ?></span></span></div>
  <div class="stat"><span class="si p"><i class="fa fa-wand-magic-sparkles"></i></span>
    <span class="sx"><span class="sl">আজ তৈরি</span><b><?= bn($today) ?></b><span>AI দিয়ে</span></span></div>
  <div class="stat"><span class="si"><i class="fa fa-clock-rotate-left"></i></span>
    <span class="sx"><span class="sl">শেষ রান</span><b style="font-size:.95rem"><?= $lastRun ? e(time_ago($lastRun)) : '—' ?></b>
      <span><?= e($lastSum ?: 'এখনো চলেনি') ?></span></span></div>
</div>

<div class="a-card">
  <h2><i class="fa fa-play"></i>এখনই চালান</h2>
  <p class="hint" style="margin-top:0">পেছনে চলে — সাইট বা এই পাতা আটকাবে না, অন্য কাজ করতে পারবেন।
    <b>একটি চালান</b> = একটি পোস্ট। <b>সব আনুন</b> = একটার পর একটা চলতে থাকবে যতক্ষণ নতুন পোস্ট পাওয়া যায় (পাতা খোলা রাখুন)।</p>
  <div id="autoRunBox" class="run-box" hidden>
    <i class="fa fa-circle-notch fa-spin"></i><span id="autoRunMsg">চলছে…</span>
    <button type="button" class="btn sm sec" id="autoStop">থামান</button>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" type="button" id="autoRunOne"><i class="fa fa-robot"></i> একটি চালান</button>
    <button class="btn" type="button" id="autoRunAll" style="background:#3f4fb8"><i class="fa fa-forward"></i> সব আনুন</button>
    <form method="post">
      <?= csrf_field() ?>
      <input type="hidden" name="do" value="test_mail">
      <button class="btn sec" type="submit"><i class="fa fa-envelope"></i> টেস্ট মেইল পাঠান</button>
    </form>
  </div>

  <div id="runResult" class="run-result"><?php if ($lastDetail): ?>
    <?php
      $ic = ['new' => ['fa-circle-check', 'ok'], 'skip' => ['fa-forward', 'skip'], 'fail' => ['fa-triangle-exclamation', 'warn'], 'stop' => ['fa-circle-stop', 'err']];
    ?>
    <div class="rr-head"><i class="fa fa-flag-checkered"></i> শেষ রানের ফলাফল
      <span><?= e(time_ago($lastDetail['at'] ?? '')) ?></span></div>
    <?php foreach (($lastDetail['events'] ?? []) as $x): $c = $ic[$x['type']] ?? $ic['skip']; ?>
      <div class="rr-row <?= $c[1] ?>"><i class="fa <?= $c[0] ?>"></i>
        <div><b><?= e($x['text']) ?></b><?php if (!empty($x['hint'])): ?><small><?= e($x['hint']) ?></small><?php endif; ?></div></div>
    <?php endforeach; ?>
    <div class="rr-stop <?= !empty($lastDetail['fatal']) ? 'err' : '' ?>">
      <i class="fa <?= !empty($lastDetail['fatal']) ? 'fa-circle-exclamation' : 'fa-circle-info' ?>"></i>
      <div><b>কেন থামল: <?= e($lastDetail['stop'] ?? '—') ?></b>
        <?php if (!empty($lastDetail['hint'])): ?><small>সমাধান: <?= e($lastDetail['hint']) ?></small><?php endif; ?></div>
    </div>
  <?php endif; ?></div>
</div>

<style>
/* ---- সোর্স ট্র্যাকিং (v61) — শুধু এই পাতার স্টাইল ---- */
.sp-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin-bottom:12px}
.sp-stat{border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:#fbfdfc}
.sp-stat b{display:block;font-size:1.25rem;line-height:1.2;color:var(--ink)}
.sp-stat span{font-size:.76rem;color:var(--muted)}
.sp-stat.warn{background:#fff8ec;border-color:#f3dfb8}.sp-stat.warn b{color:#9a5b00}
.sp-stat.err{background:#fff2f2;border-color:#f3c9c9}.sp-stat.err b{color:#b42318}
.sp-stat.ok b{color:var(--brand-d)}
.sp-meta{font-size:.8rem;color:var(--muted);margin:-4px 0 12px;line-height:1.6}
.sp-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.sp-tools form{margin:0}
.sp-sec{margin-top:16px}
.sp-sec > summary{cursor:pointer;font-weight:700;font-size:.92rem;padding:9px 0;list-style:none;display:flex;align-items:center;gap:8px}
.sp-sec > summary::-webkit-details-marker{display:none}
.sp-sec > summary .n{background:var(--brand-l);color:var(--brand-d);border-radius:999px;padding:1px 9px;font-size:.76rem}
.sp-sec > summary .n.warn{background:#fff1d6;color:#9a5b00}
.sp-sec > summary .n.err{background:#fde2e2;color:#b42318}
.sp-sec > summary::after{content:"\f078";font-family:"Font Awesome 6 Free","Font Awesome 5 Free";font-weight:900;font-size:.7rem;margin-left:auto;color:var(--muted);transition:.2s}
.sp-sec[open] > summary::after{transform:rotate(180deg)}
.sp-empty{font-size:.84rem;color:var(--muted);padding:6px 2px 10px}
.sp-item{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#fff;transition:.2s}
.sp-item.sp-done{opacity:.55}
.sp-t{font-weight:600;font-size:.9rem;line-height:1.5;word-break:break-word}
.sp-t a{color:inherit;text-decoration:none}.sp-t a:hover{color:var(--brand)}
.sp-sub{font-size:.78rem;color:var(--muted);margin-top:3px;line-height:1.55;word-break:break-word}
.sp-sub a{color:var(--brand-d)}
.sp-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.sp-acts .btn{font-size:.8rem;padding:7px 12px}
.sp-ok{font-size:.8rem;color:var(--brand-d);font-weight:600}
.sp-log{max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:12px}
.sp-log div{display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid #f0f4f3;font-size:.8rem;line-height:1.5}
.sp-log div:last-child{border-bottom:0}
.sp-log .t{color:var(--muted);white-space:nowrap;flex:none}
.sp-log .d{flex:none;border-radius:6px;padding:0 6px;background:#eef3f2;color:#2c4540;font-size:.72rem;height:fit-content}
.sp-log .d.bad{background:#fde2e2;color:#b42318}.sp-log .d.warn{background:#fff1d6;color:#9a5b00}.sp-log .d.good{background:var(--brand-l);color:var(--brand-d)}
.sp-test{border-radius:12px;border:1px solid var(--line);overflow:hidden;margin-top:10px}
.sp-test div{display:flex;gap:9px;padding:8px 11px;border-bottom:1px solid #f0f4f3;font-size:.84rem;line-height:1.5}
.sp-test div:last-child{border-bottom:0}
.sp-test i{margin-top:3px}.sp-test .p i{color:var(--brand)}.sp-test .f i{color:#b42318}
.sp-test small{display:block;color:var(--muted)}
@media (max-width:560px){.sp-stats{grid-template-columns:repeat(2,1fr)}.sp-log div{flex-wrap:wrap}}
</style>

<?php
  $spLbl = ['new' => 'নতুন', 'created' => 'তৈরি', 'updated' => 'আপডেট তৈরি', 'ai_call' => 'AI কল', 'needs_review' => 'রিভিউ',
            'skipped_duplicate' => 'ডুপ্লিকেট', 'skipped_roundup' => 'তালিকা-পাতা', 'update_pending' => 'সোর্সে আপডেট',
            'failed' => 'ব্যর্থ', 'gave_up' => 'থেমে গেছে', 'stale' => 'আটকে ছিল', 'linked_existing' => 'আগেই আছে',
            'new_despite_title' => 'নতুন (তথ্য আলাদা)', 'admin_ai' => 'এডমিন: তৈরি', 'admin_skip' => 'এডমিন: বাদ',
            'admin_update' => 'এডমিন: আপডেট', 'admin_ignore' => 'এডমিন: উপেক্ষা',
            'redated' => 'নতুন করে প্রকাশ', 'redated_same' => 'আগেই আছে', 'skipped_expired' => 'মেয়াদ শেষ'];
  $spCls = ['created' => 'good', 'updated' => 'good', 'failed' => 'bad', 'gave_up' => 'bad', 'stale' => 'warn',
            'needs_review' => 'warn', 'update_pending' => 'warn'];
  $spBaseDone = !empty($spBaseState['done']);
?>
<div class="a-card" id="spCard">
  <h2><i class="fa fa-fingerprint"></i>সোর্স ট্র্যাকিং (পোস্ট ID ধরে)</h2>
  <p class="sp-meta">
    <?php if ($spBaseDone): ?>
      বেসলাইন তৈরি <?= !empty($spBaseState['at']) ? e(time_ago($spBaseState['at'])) : '' ?> ·
    <?php else: ?>
      <b style="color:#9a5b00">বেসলাইন এখনো হয়নি</b> — প্রথম রানে সোর্সের সব পোস্ট শুধু তালিকায় উঠবে, AI ডাকা হবে না ·
    <?php endif; ?>
    আজ AI কল: <b><?= bn($spUsed) ?>/<?= bn($spCap) ?></b> · সোর্সে নতুন পোস্ট এলেই আনা হয় (তারিখের শর্ত নেই)
  </p>
  <div class="sp-stats">
    <div class="sp-stat"><b><?= bn($spc['new']) ?></b><span>নতুন (অপেক্ষায়)</span></div>
    <div class="sp-stat ok"><b><?= bn($spc['done']) ?></b><span>তৈরি হয়েছে</span></div>
    <div class="sp-stat <?= $spc['needs_review'] ? 'warn' : '' ?>"><b><?= bn($spc['needs_review']) ?></b><span>রিভিউ দরকার</span></div>
    <div class="sp-stat <?= $spc['update_pending'] ? 'warn' : '' ?>"><b><?= bn($spc['update_pending']) ?></b><span>সোর্সে আপডেট</span></div>
    <div class="sp-stat <?= $spc['failed'] ? 'err' : '' ?>"><b><?= bn($spc['failed']) ?></b><span>ব্যর্থ</span></div>
    <div class="sp-stat"><b><?= bn($spc['skipped_duplicate']) ?></b><span>ডুপ্লিকেট/বাদ</span></div>
    <div class="sp-stat"><b><?= bn($spc['baseline']) ?></b><span>বেসলাইন</span></div>
  </div>

  <div class="sp-tools">
    <form method="post"><?= csrf_field() ?><input type="hidden" name="do" value="sp_retry">
      <button class="btn sm sec" type="submit"><i class="fa fa-rotate-right"></i> ব্যর্থগুলো আবার চেষ্টা</button></form>
    <form method="post"><?= csrf_field() ?><input type="hidden" name="do" value="selftest">
      <button class="btn sm sec" type="submit"><i class="fa fa-vial"></i> স্ব-পরীক্ষা চালান</button></form>
    <form method="post"><?= csrf_field() ?><input type="hidden" name="do" value="sp_rebaseline">
      <button class="btn sm sec" type="submit" data-confirm="রিসেট করলে অপেক্ষমাণ নতুন/রিভিউ/ব্যর্থ পোস্টগুলো বেসলাইনে চলে যাবে (AI হবে না) এবং সোর্সের সব পোস্ট আবার বেসলাইনে উঠবে। আগে বানানো পোস্ট বা কোনো ডেটা মোছা হবে না। করবেন?"><i class="fa fa-arrows-rotate"></i> রিসেট ও নতুন বেসলাইন</button></form>
  </div>

  <?php if ($selftest !== null): ?>
    <?php $stOk = !array_filter($selftest['rows'], function ($r) { return !$r['pass']; }); ?>
    <div class="sp-test">
      <div class="<?= $stOk && empty($selftest['error']) ? 'p' : 'f' ?>"><i class="fa <?= $stOk && empty($selftest['error']) ? 'fa-circle-check' : 'fa-circle-xmark' ?>"></i>
        <b>স্ব-পরীক্ষা: <?= !empty($selftest['error']) ? e($selftest['error']) : ($stOk ? 'সব পাস ✓' : 'কিছু ফেল করেছে') ?></b>
        <small style="margin-left:auto">নকল ডেটা ও নকল AI — আসল OpenAI-তে কিছু যায়নি, ডেটাবেজে কিছু থেকে যায়নি</small></div>
      <?php foreach ($selftest['rows'] as $r): ?>
        <div class="<?= $r['pass'] ? 'p' : 'f' ?>"><i class="fa <?= $r['pass'] ? 'fa-check' : 'fa-xmark' ?>"></i>
          <span><?= e($r['name']) ?><small><?= e($r['detail']) ?></small></span></div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <details class="sp-sec" <?= $spReview ? 'open' : '' ?>>
    <summary><i class="fa fa-user-check"></i> রিভিউ দরকার <span class="n <?= $spReview ? 'warn' : '' ?>"><?= bn(count($spReview)) ?></span></summary>
    <?php if (!$spReview): ?><div class="sp-empty">কিছু নেই।</div><?php endif; ?>
    <?php foreach ($spReview as $r): ?>
      <div class="sp-item">
        <div class="sp-t"><a href="<?= e($r['source_link']) ?>" target="_blank" rel="noopener noreferrer"><?= e($r['title_raw']) ?> <i class="fa fa-arrow-up-right-from-square" style="font-size:.7rem"></i></a></div>
        <div class="sp-sub">
          <?php if ($r['match_post_id']): ?>মিলেছে আমাদের: <a href="<?= e(au('post?id=' . (int)$r['match_post_id'])) ?>">#<?= (int)$r['match_post_id'] ?> <?= e(mb_substr((string)$r['my_title'], 0, 70)) ?></a><br><?php endif; ?>
          <?= e((string)$r['note']) ?>
        </div>
        <div class="sp-acts">
          <button type="button" class="btn sm" data-sp-act="ai" data-id="<?= (int)$r['source_id'] ?>"><i class="fa fa-wand-magic-sparkles"></i> নতুন হিসেবে তৈরি করুন (AI)</button>
          <button type="button" class="btn sm sec" data-sp-act="skip" data-id="<?= (int)$r['source_id'] ?>"><i class="fa fa-ban"></i> ডুপ্লিকেট, বাদ দিন</button>
        </div>
      </div>
    <?php endforeach; ?>
  </details>

  <details class="sp-sec" <?= $spUpd ? 'open' : '' ?>>
    <summary><i class="fa fa-pen-to-square"></i> সোর্সে আপডেট হয়েছে <span class="n <?= $spUpd ? 'warn' : '' ?>"><?= bn(count($spUpd)) ?></span></summary>
    <?php if (!$spUpd): ?><div class="sp-empty">কিছু নেই।</div><?php endif; ?>
    <?php foreach ($spUpd as $r): $pub = (int)($r['my_status'] ?? 0) === 1; ?>
      <div class="sp-item">
        <div class="sp-t"><a href="<?= e($r['source_link']) ?>" target="_blank" rel="noopener noreferrer"><?= e($r['title_raw']) ?> <i class="fa fa-arrow-up-right-from-square" style="font-size:.7rem"></i></a></div>
        <div class="sp-sub">আমাদের পোস্ট: <a href="<?= e(au('post?id=' . (int)$r['my_post_id'])) ?>">#<?= (int)$r['my_post_id'] ?> <?= e(mb_substr((string)$r['my_title'], 0, 70)) ?></a>
          — <?= $pub ? 'প্রকাশিত (লাইভ পোস্ট ছোঁয়া হবে না, আলাদা খসড়া হবে)' : 'খসড়া (এটাই নতুন করে লেখা হবে)' ?></div>
        <div class="sp-acts">
          <button type="button" class="btn sm" data-sp-act="update" data-id="<?= (int)$r['source_id'] ?>"><i class="fa fa-rotate"></i> আপডেট করুন</button>
          <button type="button" class="btn sm sec" data-sp-act="ignore" data-id="<?= (int)$r['source_id'] ?>"><i class="fa fa-eye-slash"></i> উপেক্ষা করুন</button>
        </div>
      </div>
    <?php endforeach; ?>
  </details>

  <details class="sp-sec" <?= $spFail ? 'open' : '' ?>>
    <summary><i class="fa fa-triangle-exclamation"></i> ব্যর্থ <span class="n <?= $spFail ? 'err' : '' ?>"><?= bn(count($spFail)) ?></span></summary>
    <?php if (!$spFail): ?><div class="sp-empty">কিছু নেই।</div><?php endif; ?>
    <?php foreach ($spFail as $r): ?>
      <div class="sp-item">
        <div class="sp-t"><a href="<?= e($r['source_link']) ?>" target="_blank" rel="noopener noreferrer"><?= e($r['title_raw']) ?></a></div>
        <div class="sp-sub">চেষ্টা: <?= bn((int)$r['tries']) ?>/<?= bn(AUTO_SP_MAX_TRIES) ?><?= (int)$r['tries'] >= AUTO_SP_MAX_TRIES ? ' — আর নিজে চেষ্টা হবে না' : ' — পরে নিজেই আবার চেষ্টা হবে' ?><br><?= e((string)$r['note']) ?></div>
      </div>
    <?php endforeach; ?>
  </details>

  <details class="sp-sec">
    <summary><i class="fa fa-layer-group"></i> বেসলাইনে থাকা সাম্প্রতিক পোস্ট <span class="n"><?= bn(count($spBase)) ?></span></summary>
    <p class="hint" style="margin-top:0">বেসলাইনের সময় সোর্সে আগে থেকেই ছিল, তাই নিজে থেকে AI-তে যায়নি। এর মধ্যে যেগুলো আমাদের সাইটে নেই,
      দরকার হলে এখান থেকে হাতে তৈরি করুন। (সোর্স পুরনো পোস্টের তারিখও বদলায় — তাই আগে দেখে নিন।)</p>
    <?php if (!$spBase): ?><div class="sp-empty">কিছু নেই।</div><?php endif; ?>
    <?php foreach ($spBase as $r): ?>
      <div class="sp-item">
        <div class="sp-t"><a href="<?= e($r['source_link']) ?>" target="_blank" rel="noopener noreferrer"><?= e($r['title_raw']) ?></a></div>
        <div class="sp-sub">সোর্সের তারিখ: <?= e(auto_bn_digits(date('d/m/Y', strtotime((string)$r['source_date'])))) ?></div>
        <div class="sp-acts">
          <button type="button" class="btn sm sec" data-sp-act="ai" data-id="<?= (int)$r['source_id'] ?>" data-ask="এই পোস্টটি AI দিয়ে তৈরি করবেন? (১টি AI কল)"><i class="fa fa-wand-magic-sparkles"></i> AI দিয়ে তৈরি করুন</button>
          <button type="button" class="btn sm sec" data-sp-act="skip" data-id="<?= (int)$r['source_id'] ?>"><i class="fa fa-ban"></i> বাদ</button>
        </div>
      </div>
    <?php endforeach; ?>
  </details>

  <details class="sp-sec">
    <summary><i class="fa fa-scale-balanced"></i> সিদ্ধান্তের খাতা (সর্বশেষ ৩০)</summary>
    <?php if (!$spDec): ?><div class="sp-empty">এখনো কিছু নেই।</div><?php else: ?>
      <div class="sp-log">
        <?php foreach ($spDec as $d): ?>
          <div><span class="t"><?= e(date('d/m H:i', strtotime($d['created_at']))) ?></span>
            <span class="d <?= $spCls[$d['decision']] ?? '' ?>"><?= e($spLbl[$d['decision']] ?? $d['decision']) ?></span>
            <span><?= e((string)$d['reason']) ?></span></div>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </details>
</div>

<form method="post" class="a-card">
  <?= csrf_field() ?>
  <input type="hidden" name="do" value="save">
  <h2><i class="fa fa-sliders"></i>অটোমেশন সেটিংস</h2>

  <div class="sw-row" style="padding-top:0">
    <div class="tx"><b>স্বয়ংক্রিয় চালু</b>
      <span>চালু থাকলে প্রতি ১০ মিনিটে নতুন পোস্ট খুঁজবে (নিচের ক্রন বসানো থাকতে হবে)। তৈরি পোস্ট নিজে প্রকাশ হবে না — আপনি রিভিউ করে প্রকাশ করবেন।</span></div>
    <label class="sw"><input type="checkbox" name="auto_enabled" value="1" <?= $enabled ? 'checked' : '' ?>><i></i></label>
  </div>

  <div class="grid auto" style="margin-top:10px">
    <div>
      <label>OpenAI API Key</label>
      <input type="password" name="auto_openai_key" autocomplete="new-password"
             placeholder="<?= $hasKey ? '•••••••• (সেট করা আছে — বদলাতে চাইলে নতুনটা দিন)' : 'sk-...' ?>">
      <?php if ($hasKey): ?>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500;font-size:.78rem;margin-top:5px">
          <input type="checkbox" class="chk" name="clear_key" value="1"> key মুছে ফেলুন</label>
      <?php endif; ?>
    </div>
    <div>
      <label>মডেলের নাম</label>
      <input type="text" name="auto_model" value="<?= e(setting('auto_model', 'gpt-5.6-luna')) ?>">
    </div>
    <div>
      <label>নোটিফিকেশন ইমেইল</label>
      <input type="email" name="auto_notify_email" value="<?= e(setting('auto_notify_email', 'support.cakricircular@gmail.com')) ?>">
    </div>
    <div>
      <label>প্রতি রানে পোস্ট (ক্রন)</label>
      <input type="number" name="auto_batch" min="1" max="5" value="<?= e(setting('auto_batch', '1')) ?>">
      <p class="hint">১০ মিনিট পর পর ক্রনে ১টি করে = ৩০ মিনিটে ৩টি। সাইটে চাপ পড়ে না।</p>
    </div>
    <div>
      <label>দিনে সর্বোচ্চ AI কল</label>
      <input type="number" name="auto_daily_cap" min="1" max="200" value="<?= e(setting('auto_daily_cap', '10')) ?>">
      <p class="hint">এর বেশি হলে সেদিন আর AI ডাকা হবে না (হাতে চাপলেও)। ব্যর্থ চেষ্টাও গোনা হয়।</p>
    </div>
    <div>
      <label>খরচের হিসাব (ঐচ্ছিক, $ প্রতি ১০ লাখ টোকেন)</label>
      <div style="display:flex;gap:6px">
        <input type="text" inputmode="decimal" name="auto_price_in" placeholder="ইনপুট" value="<?= e(setting('auto_price_in', '')) ?>">
        <input type="text" inputmode="decimal" name="auto_price_out" placeholder="আউটপুট" value="<?= e(setting('auto_price_out', '')) ?>">
      </div>
      <p class="hint">দিলে লগে প্রতিটি পোস্টের আনুমানিক খরচ দেখাবে। না দিলে শুধু টোকেন সংখ্যা।</p>
    </div>
    <div>
      <label>সোর্স সাইট</label>
      <input type="url" name="auto_source" value="<?= e(setting('auto_source', 'https://bdgovtjob.net')) ?>">
    </div>
  </div>

  <h2 style="margin-top:18px"><i class="fa fa-envelope"></i>ইমেইল (SMTP)</h2>
  <p class="hint" style="margin-top:-6px">Hostinger ইমেইল: Host <b>smtp.hostinger.com</b>, Port <b>465</b>, SSL। Gmail হলে App Password লাগবে।</p>
  <div class="grid auto">
    <div><label>SMTP Host</label><input type="text" name="smtp_host" value="<?= e(setting('smtp_host', '')) ?>" placeholder="smtp.hostinger.com"></div>
    <div><label>Port</label><input type="number" name="smtp_port" value="<?= e(setting('smtp_port', '465')) ?>"></div>
    <div><label>এনক্রিপশন</label>
      <select name="smtp_secure">
        <?php foreach (['ssl' => 'SSL (465)', 'tls' => 'TLS (587)', 'none' => 'নেই'] as $k => $v): ?>
          <option value="<?= $k ?>" <?= setting('smtp_secure', 'ssl') === $k ? 'selected' : '' ?>><?= $v ?></option>
        <?php endforeach; ?>
      </select></div>
    <div><label>ইউজারনেম (পুরো ইমেইল)</label><input type="text" name="smtp_user" value="<?= e(setting('smtp_user', '')) ?>" autocomplete="off"></div>
    <div><label>পাসওয়ার্ড</label>
      <input type="password" name="smtp_pass" autocomplete="new-password" placeholder="<?= $hasPass ? '•••••••• (সেট করা আছে)' : '' ?>"></div>
    <div><label>প্রেরকের ইমেইল</label><input type="email" name="smtp_from" value="<?= e(setting('smtp_from', '')) ?>" placeholder="ইউজারনেমের মতোই"></div>
    <div><label>প্রেরকের নাম</label><input type="text" name="smtp_from_name" value="<?= e(setting('smtp_from_name', setting('site_name', 'চাকরি সার্কুলার'))) ?>"></div>
  </div>

  <div class="save-bar"><button class="btn" type="submit"><i class="fa fa-floppy-disk"></i> সেভ করুন</button></div>
</form>

<div class="a-card">
  <h2><i class="fa fa-clock"></i>ক্রন বসানো (একবারই)</h2>
  <p class="hint" style="margin-top:0">Hostinger hPanel → <b>Advanced → Cron Jobs</b> → ধরন <b>PHP</b> → নিচের পথ দিন → সময়: মিনিটের ঘরে <b>*/10</b>, বাকি সব ঘরে <b>*</b> (প্রতি ১০ মিনিটে)</p>
  <div class="cron-box"><code><?= e(APP_ROOT . '/cron.php') ?></code></div>
  <p class="hint">পুরো কমান্ড দরকার হলে (Custom):</p>
  <div class="cron-box"><code><?= e($cronCmd) ?></code></div>
  <p class="hint">কোনো কারণে PHP ক্রন কাজ না করলে বিকল্প — URL ক্রন (বাইরের cron সেবায় দিন, গোপন রাখুন):</p>
  <div class="cron-box"><code><?= e($cronUrl) ?></code></div>
  <form method="post" style="margin-top:8px">
    <?= csrf_field() ?>
    <button class="btn sm sec" name="do" value="new_key" data-confirm="নতুন কী বানালে পুরনো URL আর কাজ করবে না। করবেন?"><i class="fa fa-rotate"></i> নতুন কী বানান</button>
  </form>
</div>

<div class="a-card">
  <h2><i class="fa fa-list-ul"></i>লগ (সর্বশেষ ৪০)</h2>
  <?php if (!$logs): ?>
    <div class="auto-log" id="autoLog"><p style="text-align:center;color:var(--muted);padding:20px">এখনো কিছু চলেনি।</p></div>
  <?php else: ?>
    <div class="auto-log" id="autoLog">
      <?php foreach ($logs as $l): ?>
        <div class="al <?= e($l['level']) ?>">
          <span class="t"><?= e(date('d/m H:i', strtotime($l['created_at']))) ?></span>
          <span class="m"><?= e($l['msg']) ?></span>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>

<script>
(function () {
  var box = document.getElementById('autoRunBox'); if (!box) return;
  var msg = document.getElementById('autoRunMsg');
  var one = document.getElementById('autoRunOne'), all = document.getElementById('autoRunAll'), stop = document.getElementById('autoStop');
  var TOKEN = <?= json_encode(csrf_token()) ?>, REVIEW = <?= json_encode(au('posts?review=1')) ?>;
  var running = false, loop = false, made = 0, badRow = 0, jobId = '', poll = null, waited = 0;

  function post(d) {
    var fd = new FormData(); fd.append('_token', TOKEN);
    for (var k in d) fd.append(k, d[k]);
    return fetch(location.href, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) { return r.json(); });
  }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }
  function drawLog(rows) {
    var el = document.getElementById('autoLog'); if (!el || !rows) return;
    el.innerHTML = rows.map(function (l) {
      return '<div class="al ' + esc(l.level) + '"><span class="t">' + esc(l.t) + '</span><span class="m">' + esc(l.msg) + '</span></div>';
    }).join('');
  }
  function setBusy(b) { running = b; box.hidden = !b; one.disabled = b; all.disabled = b; }
  function say(o) { (window.ccAlert || function (x) { alert(x.text || x); })(o); }

  /* নিচের "শেষ রানের ফলাফল" প্যানেল */
  var IC = { 'new': ['fa-circle-check', 'ok'], 'skip': ['fa-forward', 'skip'], 'fail': ['fa-triangle-exclamation', 'warn'], 'stop': ['fa-circle-stop', 'err'] };
  var allEvents = [];
  function drawResult(s, live) {
    var el = document.getElementById('runResult'); if (!el || !s) return;
    var evs = live ? allEvents : (s.events || []);
    var h = '<div class="rr-head"><i class="fa fa-flag-checkered"></i> ' + (live ? 'এই চালানোর ফলাফল' : 'শেষ রানের ফলাফল') + '<span>এইমাত্র</span></div>';
    evs.forEach(function (x) {
      var c = IC[x.type] || IC.skip;
      h += '<div class="rr-row ' + c[1] + '"><i class="fa ' + c[0] + '"></i><div><b>' + esc(x.text) + '</b>' +
           (x.hint ? '<small>' + esc(x.hint) + '</small>' : '') + '</div></div>';
    });
    h += '<div class="rr-stop ' + (s.fatal ? 'err' : '') + '"><i class="fa ' + (s.fatal ? 'fa-circle-exclamation' : 'fa-circle-info') + '"></i>' +
         '<div><b>কেন থামল: ' + esc(s.stop || s.msg || '—') + '</b>' + (s.hint ? '<small>সমাধান: ' + esc(s.hint) + '</small>' : '') + '</div></div>';
    el.innerHTML = h;
  }

  function finish(text, type) {
    setBusy(false); loop = false;
    if (made > 0) {
      say({ type: 'ok', icon: 'fa-wand-magic-sparkles', title: 'নতুন ' + made + 'টি পোস্ট এসেছে',
            text: 'রিভিউর অপেক্ষায় আছে — দেখে প্রকাশ করুন।', link: REVIEW, linkText: 'রিভিউ করুন', ok: 'পরে' });
    } else {
      say({ type: type || 'info', title: type === 'dan' ? 'থেমে গেছে' : 'শেষ হয়েছে', text: text });
    }
    made = 0;
  }

  /* কাজ শেষ হলো কিনা কয়েক সেকেন্ড পরপর দেখি */
  function watch() {
    clearInterval(poll); waited = 0;
    var lastOk = Date.now();
    poll = setInterval(function () {
      waited += 4;
      /* টানা ৩ মিনিট কোনো উত্তর নেই — লাল নয়, শুধু জানিয়ে দিই */
      if (Date.now() - lastOk > 180000) {
        clearInterval(poll);
        finish('অনেকক্ষণ অবস্থা জানা যায়নি — পাতা রিফ্রেশ করলে নিচে ফলাফল দেখবেন।', 'info');
        return;
      }
      post({ do: 'log_ajax' }).then(function (d) {
        lastOk = Date.now();
        drawLog(d.rows);
        var j = d.job || {};
        msg.textContent = (loop ? 'এ পর্যন্ত নতুন ' + made + 'টি — ' : '') + 'AI লিখছে… (' + waited + ' সেকেন্ড)';
        if (j.id !== jobId) return;
        if (j.state === 'done') {
          clearInterval(poll);
          var s = j.sum || {};
          made += (s.created || 0);
          badRow = (s.created || 0) ? 0 : badRow + 1;
          allEvents = allEvents.concat(s.events || []);
          drawResult(s, true);
          if (loop && !s.fatal && badRow < 4 && (s.found || 0) > 0) {
            setTimeout(start, 2500);                         /* পরেরটি */
          } else {
            /* পপআপেও কেন থামল আর কী করতে হবে */
            var t = esc(s.stop || s.msg || 'শেষ') + (s.hint ? '<br><small style="color:#64757a">সমাধান: ' + esc(s.hint) + '</small>' : '');
            finish(t, s.fatal ? 'dan' : 'info');
          }
        } else if (j.state === 'dead') {
          clearInterval(poll); badRow++;
          if (loop && badRow < 4) setTimeout(start, 3000);
          else finish('কাজটা মাঝপথে থেমে গেছে — নিচের লগে কারণ দেখুন।', 'dan');
        }
      }).catch(function () {});
    }, 4000);
  }

  /* শুরুর উত্তর না এলে — কাজটা হয়তো পেছনে চলছে, কয়েকবার খোঁজ নিই */
  function findJob(n) {
    post({ do: 'log_ajax' }).then(function (d) {
      drawLog(d.rows);
      var j = d.job || {};
      if (j.id && (j.state === 'running' || j.state === 'done')) { jobId = j.id; watch(); return; }
      if (n < 8) setTimeout(function () { findJob(n + 1); }, 4000);
      else finish('কাজটা শুরু হয়নি। একটু পরে আবার চাপুন।', 'info');
    }).catch(function () {
      if (n < 8) setTimeout(function () { findJob(n + 1); }, 4000);
      else finish('এই মুহূর্তে অবস্থা জানা যাচ্ছে না — কিছুক্ষণ পর পাতা রিফ্রেশ করে ফলাফল দেখুন।', 'info');
    });
  }

  function start() {
    if (!running) allEvents = [];
    setBusy(true);
    msg.textContent = loop ? ('চলছে… এ পর্যন্ত নতুন ' + made + 'টি') : 'চলছে… একটি পোস্ট প্রসেস হচ্ছে';
    post({ do: 'run_ajax' }).then(function (d) {
      jobId = d.id || '';
      if (d.busy) msg.textContent = 'আগের কাজটি এখনো চলছে — সেটা শেষ হওয়া পর্যন্ত দেখাচ্ছি…';
      watch();
    }).catch(function () { findJob(0); });
  }

  one.onclick = function () { if (!running) { loop = false; made = 0; badRow = 0; start(); } };
  all.onclick = function () { if (!running) { loop = true;  made = 0; badRow = 0; start(); } };
  stop.onclick = function () { loop = false; msg.textContent = 'বর্তমানটি শেষ হলে থামবে…'; };

  /* সোর্স ট্র্যাকিং তালিকার বোতাম — রিভিউ/আপডেট/বেসলাইন */
  document.querySelectorAll('[data-sp-act]').forEach(function (b) {
    b.addEventListener('click', function () {
      var ask = b.getAttribute('data-ask');
      if (ask && !confirm(ask)) return;
      var item = b.closest('.sp-item'), btns = item ? item.querySelectorAll('button') : [b];
      Array.prototype.forEach.call(btns, function (x) { x.disabled = true; });
      post({ do: 'sp_act', act: b.getAttribute('data-sp-act'), id: b.getAttribute('data-id') }).then(function (d) {
        if (!d || !d.ok) {
          say({ type: 'dan', title: 'হয়নি', text: (d && d.msg) || 'আবার চেষ্টা করুন।' });
          Array.prototype.forEach.call(btns, function (x) { x.disabled = false; });
          return;
        }
        if (item) { item.classList.add('sp-done'); var a = item.querySelector('.sp-acts'); if (a) a.innerHTML = '<span class="sp-ok">' + esc(d.msg) + '</span>'; }
        if (d.run && !running) { loop = false; made = 0; badRow = 0; start(); }
      }).catch(function () { Array.prototype.forEach.call(btns, function (x) { x.disabled = false; }); });
    });
  });

  /* পাতা খুললে আগের কাজ চলমান থাকলে সেটাও দেখাই */
  post({ do: 'log_ajax' }).then(function (d) {
    var j = d.job || {};
    if (j.state === 'running') { jobId = j.id; setBusy(true); watch(); }
  }).catch(function () {});
})();
</script>

<?php admin_end(); ?>
