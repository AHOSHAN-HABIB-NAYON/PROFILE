<?php
/* =========================================================
   এডমিন প্যানেল — কোর (auth, permission, layout, router)
   URL: /{admin_slug}/...   (ডিফল্ট /v2admin)
   ========================================================= */
header('X-Robots-Tag: noindex, nofollow');

/* গুরুত্বপূর্ণ: এডমিনের পেজ আগে বাফারে জমা হয়, তাই সেভ/ডিলিটের পরে
   রিডাইরেক্ট করলে "headers already sent" হয়ে সাদা পেজ আসবে না */
if (!ob_get_level()) ob_start();
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');

$AS   = setting('admin_slug', DEFAULT_ADMIN_SLUG);
$mod  = $ADMIN_SEG[0] ?? 'dashboard';
$sub  = $ADMIN_SEG[1] ?? '';
function au(string $p = ''): string { return url(setting('admin_slug', DEFAULT_ADMIN_SLUG) . '/' . ltrim($p, '/')); }

/* সেভ/ডিলিটের পরে নিরাপদ রিডাইরেক্ট — আগে যা প্রিন্ট হয়েছে সব ফেলে দিয়ে পাঠায় */
function admin_go(string $url): void
{
    while (ob_get_level() > 0) ob_end_clean();
    if (!headers_sent()) {
        header('Location: ' . $url, true, 303);
        exit;
    }
    /* একেবারে শেষ ভরসা — হেডার চলে গেলে জাভাস্ক্রিপ্টে পাঠাই (সাদা পেজ নয়) */
    echo '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' . e($url) . '">'
       . '<script>location.replace(' . json_encode($url) . ');</script>'
       . '<p style="font-family:system-ui;padding:20px">সংরক্ষণ হয়েছে… <a href="' . e($url) . '">এখানে চাপুন</a></p>';
    exit;
}

/* ---------- লগআউট ---------- */
if ($mod === 'logout') {
    $_SESSION = []; session_destroy();
    admin_go(au());
}

/* ---------- লগইন ---------- */
function admin_user(): ?array
{
    static $u = null;
    if ($u !== null) return $u;
    if (empty($_SESSION['admin_id'])) return null;
    $u = one("SELECT * FROM admins WHERE id = ? AND is_active = 1 LIMIT 1", [$_SESSION['admin_id']]);
    return $u;
}
function can(string $perm): bool
{
    $u = admin_user();
    if (!$u) return false;
    if ($u['role'] === 'super') return true;
    $p = json_decode($u['perms'] ?: '[]', true) ?: [];
    return in_array('all', $p, true) || in_array($perm, $p, true);
}
function need(string $perm): void
{
    if (!can($perm)) {
        echo '<div class="a-card" style="padding:26px;text-align:center;color:#c0392b">'
           . '<i class="fa fa-lock" style="font-size:1.6rem;display:block;margin-bottom:10px"></i>'
           . 'এই অংশে আপনার প্রবেশাধিকার নেই।</div>';
        admin_end();
        exit;
    }
}

$LOGIN_ERR = '';
if (!admin_user()) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['username'])) {
        $ip = client_ip();
        $fails = (int)col("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", [$ip]);
        if ($fails >= 6) {
            $LOGIN_ERR = 'অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।';
        } elseif (!csrf_check()) {
            $LOGIN_ERR = 'সেশন মেয়াদ শেষ। আবার চেষ্টা করুন।';
        } else {
            $u = one("SELECT * FROM admins WHERE username = ? AND is_active = 1 LIMIT 1", [trim($_POST['username'])]);
            if ($u && password_verify((string)$_POST['password'], $u['pass'])) {
                session_regenerate_id(true);
                $_SESSION['admin_id'] = (int)$u['id'];
                q("UPDATE admins SET last_login = NOW() WHERE id = ?", [$u['id']]);
                q("DELETE FROM login_attempts WHERE ip = ?", [$ip]);
                admin_go(au());
            }
            q("INSERT INTO login_attempts (ip, username, created_at) VALUES (?,?,NOW())", [$ip, mb_substr((string)$_POST['username'], 0, 60)]);
            $LOGIN_ERR = 'ইউজারনেম বা পাসওয়ার্ড ভুল।';
        }
    }
    require __DIR__ . '/login.php';
    exit;
}

/* এডমিনে কিছু সেভ হলেই কনটেন্ট ভার্সন বাড়ে → সাইটে সাথে সাথে লাইভ আপডেট */
if ($_SERVER['REQUEST_METHOD'] === 'POST') { register_shutdown_function('bump_ver'); }

/* =========================================================
   লেআউট
   ========================================================= */
$MENU = [
    ['dashboard',  'ড্যাশবোর্ড',        'fa-gauge-high',         ''],
    ['posts',      'পোস্ট সমূহ',        'fa-newspaper',          'posts'],
    ['post',       'নতুন পোস্ট',        'fa-plus',               'posts'],
    ['categories', 'ক্যাটাগরি',         'fa-folder-tree',        'categories'],
    ['banners',    'ব্যানার',           'fa-images',             'banners'],
    ['ads',        'বিজ্ঞাপন',          'fa-crown',              'posts'],
    ['automation', 'অটোমেশন',          'fa-robot',              'settings'],
    ['notices',    'নোটিশ',             'fa-bullhorn',           'notices'],
    ['reports',    'রিপোর্ট',           'fa-flag',               'reports'],
    ['analytics',  'অ্যানালিটিকস',      'fa-chart-line',         'analytics'],
    ['users',      'এডমিন ও মডারেটর',  'fa-user-shield',        'users'],
    ['settings',   'সেটিংস',            'fa-gear',               'settings'],
];

function admin_start(string $title): void
{
    global $mod, $MENU;
    $me = admin_user();
    ?>
<!doctype html>
<html lang="bn"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title><?= e($title) ?> — এডমিন</title>
<meta name="theme-color" content="#0b544e">
<script>try{if(localStorage.getItem('cc_admin_theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}</script>
<link rel="icon" href="<?= e(site_favicon()) ?>">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<style>
:root{--brand:#0f766e;--brand-d:#0b544e;--brand-2:#16a08a;--brand-l:#e6f4f1;--ink:#13211f;--ink-2:#2c4540;--muted:#64757a;--line:#e4eae8;
  --bg:#f3f7f6;--card:#fff;--soft:#f6faf9;--chip:#eef4f2;--danger:#e03b2f;--ok:#12804a;--r:13px;color-scheme:light;
  --hd-grad:linear-gradient(135deg,#083d39 0%,#0b544e 48%,#0f766e 100%)}
html[data-theme="dark"]{--brand:#2bb3a0;--brand-d:#5fd6c3;--brand-2:#34c4b0;--brand-l:#12332f;--ink:#e6efed;--ink-2:#c6d4d0;--muted:#8fa39e;
  --line:#22332f;--bg:#0a1312;--card:#111c1b;--soft:#152321;--chip:#182927;color-scheme:dark;
  --hd-grad:linear-gradient(135deg,#03221f 0%,#053532 60%,#074a45 100%)}
*{box-sizing:border-box}
html{overflow-x:hidden}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hind Siliguri",system-ui,sans-serif;
  font-size:15px;line-height:1.7;overflow-x:hidden;max-width:100%}
img,table,pre{max-width:100%}
a{color:inherit;text-decoration:none}
.a-wrap{display:flex;min-height:100vh}
.a-side{width:270px;flex:none;background:var(--card);color:var(--ink-2);position:fixed;top:0;bottom:0;left:0;
  border-right:1px solid var(--line);display:flex;flex-direction:column;transition:transform .3s cubic-bezier(.3,.9,.4,1);z-index:60}
.a-side .top{padding:15px 16px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--line)}
.a-side .top img{width:40px;height:40px;border-radius:12px;background:var(--card);object-fit:cover;box-shadow:0 2px 8px rgba(16,40,36,.12)}
.a-side .top b{color:var(--ink);font-size:1rem;line-height:1.25;display:block}
.a-side .top small{display:block;font-size:.74rem;color:var(--muted)}
.a-menu{flex:1;overflow-y:auto;padding:12px 10px}
.a-menu a{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:14px;font-size:.95rem;
  font-weight:600;margin-bottom:4px;color:var(--ink-2);transition:.16s}
.a-menu a i{width:38px;height:38px;flex:none;border-radius:12px;background:var(--chip);color:var(--ink-2);
  display:grid;place-items:center;font-size:.95rem;transition:.16s}
.a-menu a:hover{background:var(--soft)}
.a-menu a.on{background:var(--brand-l);color:var(--brand-d)}
.a-menu a.on i{background:var(--brand);color:#fff;box-shadow:0 4px 12px rgba(15,118,110,.3)}
.a-menu a.danger{color:var(--danger)}
.a-menu a.danger i{background:#fdecea;color:var(--danger)}
.a-menu a.danger:hover{background:#fdf3f2}
.a-side .bot{padding:12px;border-top:1px solid var(--line);font-size:.84rem;color:var(--muted)}
.a-side .bot a{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:10px}
.a-side .bot a:hover{background:var(--soft);color:var(--brand-d)}
.a-main{flex:1;margin-left:270px;min-width:0;max-width:100%}
.a-wrap{max-width:100vw}
.a-top{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--card) 95%,transparent);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line);padding:11px 16px;display:flex;align-items:center;gap:11px}
.a-top h1{font-size:1.06rem;margin:0;font-weight:700}
.a-burger{display:none;width:42px;height:42px;border:1px solid var(--line);border-radius:13px;background:var(--card);
  color:var(--ink);font-size:1.05rem;transition:.16s}
.a-burger:active{transform:scale(.93)}
.a-brand{display:none;align-items:center;gap:10px;min-width:0;flex:1}
.a-brand img{width:40px;height:40px;border-radius:12px;object-fit:cover;flex:none;box-shadow:0 2px 8px rgba(16,40,36,.12)}
.a-brand b{display:block;font-size:1rem;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a-brand small{display:block;font-size:.72rem;color:var(--muted);line-height:1.3}
.a-tools{display:none;gap:7px;margin-left:auto}
.a-tools a{width:42px;height:42px;border:1px solid var(--line);border-radius:13px;background:var(--card);
  display:grid;place-items:center;color:var(--ink-2);font-size:1rem;transition:.16s}
.a-tools a:active{transform:scale(.93)}
.a-tools a.out{color:var(--danger)}
.a-body{padding:18px;max-width:1140px;min-width:0}
.a-page{display:none;font-size:1.35rem;font-weight:700;margin:16px 16px 0}
.a-card{background:var(--card);border:1px solid var(--line);border-radius:18px;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 6px 18px rgba(16,40,36,.04);padding:16px;margin-bottom:12px}
.a-card h2{font-size:1rem;margin:0 0 12px;font-weight:700;display:flex;align-items:center;gap:10px}
.a-card h2 i{width:34px;height:34px;flex:none;border-radius:11px;background:var(--brand-l);color:var(--brand);
  display:grid;place-items:center;font-size:.9rem}
.grid{display:grid;gap:10px}
.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
label{display:block;font-size:.84rem;font-weight:600;margin-bottom:5px;color:var(--ink-2)}
input[type=text],input[type=email],input[type=password],input[type=url],input[type=date],input[type=number],select,textarea{
  width:100%;border:1px solid var(--line);border-radius:11px;background:var(--soft);padding:10px 13px;font:inherit;font-size:.93rem;transition:.16s}
textarea{min-height:120px;resize:vertical;line-height:1.8}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brand);background:var(--card);box-shadow:0 0 0 3px rgba(15,118,110,.09)}
.btn{display:inline-flex;align-items:center;gap:7px;border:0;background:var(--brand);color:#fff;padding:9px 18px;
  border-radius:999px;font:inherit;font-weight:600;font-size:.88rem;cursor:pointer;transition:.16s;
  box-shadow:0 3px 10px rgba(15,118,110,.22)}
.btn:active{transform:scale(.96)}
.btn:hover{background:var(--brand-d)}
.btn.sec{background:var(--chip);color:var(--ink-2)}
.btn.dan{background:var(--danger)}
.btn.sm{padding:6px 14px;font-size:.81rem;border-radius:999px;box-shadow:none}
.btn.sec{box-shadow:none}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{padding:10px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle}
th{background:var(--soft);font-weight:600;font-size:.84rem;color:var(--ink-2)}
tr:hover td{background:var(--soft)}
body{transition:background-color .25s,color .25s}
.a-side .top{background:var(--hd-grad);color:#fff;border-bottom:0;padding:18px 16px}
.a-side .top b{color:#fff}.a-side .top small{color:rgba(255,255,255,.8)}
.a-side .top img{border-radius:50%;padding:2px;background:#fff}
.a-menu a.on i{background:linear-gradient(135deg,var(--brand),var(--brand-2))}
.stat{transition:transform .18s}.stat:hover{transform:translateY(-2px)}
.th-tg{width:42px;height:42px;border:1px solid var(--line);border-radius:13px;background:var(--card);color:var(--ink-2);display:grid;place-items:center;font-size:1rem;cursor:pointer}
.th-tg .fa-sun{display:none}html[data-theme="dark"] .th-tg .fa-sun{display:inline-block}html[data-theme="dark"] .th-tg .fa-moon{display:none}
.a-top .th-tg{margin-left:auto}
@media(max-width:900px){.a-top .th-tg{margin-left:0}}
html[data-theme="dark"] .stat .si,html[data-theme="dark"] .set-item .ic{background:rgba(255,255,255,.07)}
html[data-theme="dark"] input,html[data-theme="dark"] select,html[data-theme="dark"] textarea{color:var(--ink)}
html[data-theme="dark"] .msg.ok,html[data-theme="dark"] .pill.on{background:rgba(18,128,74,.18);color:#6ee7a0}
html[data-theme="dark"] .msg.err,html[data-theme="dark"] .pill.off{background:rgba(224,59,47,.16);color:#fca5a0}

.tbl-wrap{overflow-x:auto}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.76rem;font-weight:600}
.pill.on{background:#e7f6ef;color:var(--ok)}.pill.off{background:#fdecea;color:var(--danger)}
.pill.mut{background:var(--chip);color:var(--muted)}
.msg{padding:11px 14px;border-radius:11px;font-size:.89rem;margin-bottom:14px}
.msg.ok{background:#e7f6ef;color:var(--ok)}.msg.err{background:#fdecea;color:var(--danger)}
.grid.stats{grid-template-columns:repeat(4,1fr)}
/* ছোট ঘরগুলো — জায়গা থাকলে এক লাইনেই কয়েকটা বসবে */
.grid.auto{grid-template-columns:repeat(auto-fit,minmax(168px,1fr))}
@media(max-width:420px){ .grid.auto{grid-template-columns:repeat(auto-fit,minmax(135px,1fr))} }
.lnk-row{border:1px solid var(--line);border-radius:14px;padding:11px;background:var(--soft)}
/* অটোমেশন */
.run-box{display:flex;align-items:center;gap:10px;background:#eef2ff;color:#3f4fb8;border:1px solid #d9defa;
  border-radius:12px;padding:9px 12px;margin-bottom:10px;font-weight:600;font-size:.87rem}
.run-box span{flex:1}
.run-box[hidden]{display:none}
.run-result{margin-top:12px;display:grid;gap:6px}
.run-result:empty{display:none}
.rr-head{display:flex;align-items:center;gap:7px;font-weight:700;font-size:.86rem;color:var(--ink-2);margin-bottom:2px}
.rr-head span{margin-left:auto;font-weight:500;font-size:.75rem;color:var(--muted)}
.rr-row,.rr-stop{display:flex;gap:9px;align-items:flex-start;padding:8px 11px;border-radius:11px;font-size:.84rem;line-height:1.55}
.rr-row i,.rr-stop i{margin-top:3px;flex:none}
.rr-row b,.rr-stop b{display:block;font-weight:600}
.rr-row small,.rr-stop small{display:block;font-size:.76rem;opacity:.85;margin-top:2px}
.rr-row.ok{background:#e7f6ef;color:#0e6b40}
.rr-row.skip{background:var(--chip);color:var(--ink-2)}
.rr-row.warn{background:#fff7e8;color:#8a5a08}
.rr-row.err{background:#fdecea;color:#9b2c20}
.rr-stop{background:#eef2ff;color:#3f4fb8;border:1px solid #d9defa}
.rr-stop.err{background:#fdecea;color:#9b2c20;border-color:#f5c9c3}
.cron-box{background:#0f1a18;color:#d6ece7;border-radius:10px;padding:9px 12px;margin:6px 0 10px;overflow-x:auto}
.cron-box code{font-size:.78rem;white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace}
.auto-log{display:grid;gap:4px;max-height:420px;overflow:auto}
.auto-log .al{display:flex;gap:10px;font-size:.8rem;padding:6px 10px;border-radius:8px;background:var(--soft);line-height:1.5}
.auto-log .al .t{flex:none;color:var(--muted);font-variant-numeric:tabular-nums}
.auto-log .al .m{min-width:0;word-break:break-word}
.auto-log .al.warn{background:#fff7e8;color:#7a5306}
.auto-log .al.error{background:#fdecea;color:#9b2c20}
.pill.auto{background:#eef2ff;color:#3f4fb8}
.review-banner{border:1px solid #f0dcb6;background:#fffaf0;border-radius:14px;padding:12px 14px;margin-bottom:12px;font-size:.87rem;color:#6b5636}
.review-banner b{color:#4a3a14}
.review-banner .note{margin-top:7px;background:var(--card);border-radius:9px;padding:7px 10px;white-space:pre-line;color:#8a5a08}

/* প্রিমিয়াম কার্ড */
.prem-card{border-color:#f0e2c4;background:linear-gradient(180deg,#fffdf7,#fffaf0)}
.prem-card h2 i{background:linear-gradient(135deg,#c98410,#e6b445);color:#fff}

/* লেখার টুলবার */
.ed-tools{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:7px;margin-bottom:8px;
  background:var(--soft);border:1px solid var(--line);border-radius:12px}
.ed-tools button,.ed-tools .clr{width:34px;height:34px;border-radius:9px;border:1px solid transparent;background:var(--card);
  color:var(--ink-2);display:grid;place-items:center;font-size:.88rem;cursor:pointer;padding:0;transition:.15s;position:relative}
.ed-tools button:hover,.ed-tools .clr:hover{background:var(--brand);border-color:var(--brand);color:#fff}
.ed-tools button:active{transform:scale(.9)}
.ed-tools .clr input{position:absolute;inset:0;opacity:0;cursor:pointer;padding:0;border:0}
.ed-tools .sep{width:1px;height:22px;background:var(--line);margin:0 3px}

/* ধরন বাছাইয়ের আইকন সারি */
.seg{display:flex;gap:4px}
.seg button{flex:1;height:40px;border:1px solid var(--line);background:var(--card);border-radius:10px;
  color:var(--ink-2);font-size:.9rem;cursor:pointer;transition:.15s}
.seg button.on{background:var(--brand);border-color:var(--brand);color:#fff;box-shadow:0 3px 9px rgba(15,118,110,.25)}
.seg button:active{transform:scale(.93)}

/* ছবি ও পিডিএফের প্রিভিউ + মুছে ফেলার বাটন */
.med{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--soft);margin-bottom:8px}
.med img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.med.pdf{padding:13px 12px;display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap}
.med.pdf a{font-weight:600;font-size:.86rem;color:#b03a2b}
.med.pdf a i{margin-left:0;margin-right:6px}
.med-x{position:absolute;top:7px;left:7px;display:inline-flex;align-items:center;gap:6px;margin:0;
  background:color-mix(in srgb,var(--card) 95%,transparent);border:1px solid var(--line);border-radius:999px;padding:4px 11px;
  font-size:.75rem;font-weight:600;color:var(--danger);cursor:pointer}
.med-x input{margin:0;width:15px;height:15px;accent-color:var(--danger)}
.med.pdf .med-x{position:static;background:var(--card)}

/* সব বাটনের মাপ এক রকম */
.btn,.btn.sm,.btn.sec,.btn.dan{height:40px;padding:0 18px;justify-content:center;line-height:1}
.btn.sm{height:34px;padding:0 14px;font-size:.82rem}
.save-bar .btn{height:44px;padding:0 24px}
.row-act .btn,.row-act .ibtn{height:34px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:17px;padding:15px;display:flex;align-items:center;gap:13px;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 6px 18px rgba(16,40,36,.04)}
.stat .si{width:52px;height:52px;flex:none;border-radius:16px;display:grid;place-items:center;font-size:1.25rem;
  background:var(--brand-l);color:var(--brand)}
.stat .si.y{background:#fdf3e0;color:#b8790d}
.stat .si.g{background:#e7f6ef;color:#127a45}
.stat .si.r{background:#fdecea;color:var(--danger)}
.stat .si.b{background:#e8f0fd;color:#2a62c9}
.stat .si.p{background:#f2ebfd;color:#6b3fc9}
.stat .si.o{background:#fdeee3;color:#c2621a}
.stat .sx{min-width:0;flex:1}
.stat .sl{display:block;font-size:.86rem;font-weight:600;color:var(--ink-2);line-height:1.4}
.stat b{display:block;font-size:1.5rem;font-weight:700;line-height:1.3;color:var(--ink)}
.stat span{font-size:.79rem;color:var(--muted)}
.thumb{width:46px;height:46px;border-radius:9px;object-fit:cover;background:var(--chip)}
.row-act{display:flex;gap:6px;justify-content:flex-start}
.chk{width:17px;height:17px;accent-color:var(--brand)}
.hint{font-size:.79rem;color:var(--muted);margin-top:5px}

/* সেকশনের হেডিং */
.a-sec{display:flex;align-items:center;gap:10px;margin:22px 0 14px;font-size:1rem;font-weight:700}
.a-sec i{width:34px;height:34px;flex:none;border-radius:11px;background:var(--brand-l);color:var(--brand);
  display:grid;place-items:center;font-size:.92rem}
.a-sec:first-child{margin-top:0}

/* চালু/বন্ধ সুইচ */
.sw-row{display:flex;align-items:flex-start;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}
.sw-row:last-child{border-bottom:0}
.sw-row .tx{flex:1;min-width:0}
.sw-row .tx b{display:block;font-size:.93rem;font-weight:700;margin-bottom:2px}
.sw-row .tx span{font-size:.81rem;color:var(--muted);line-height:1.6;display:block}
.sw{position:relative;flex:none;width:52px;height:30px;display:inline-block;margin-top:2px}
.sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2}
.sw i{position:absolute;inset:0;background:var(--line);border-radius:999px;transition:.22s}
.sw i::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;
  background:var(--card);box-shadow:0 2px 6px rgba(0,0,0,.18);transition:.22s}
.sw input:checked + i{background:var(--brand)}
.sw input:checked + i::after{transform:translateX(22px)}

/* তালিকা + প্রোগ্রেস (ব্রাউজার/ওএস/টপ পেজ) */
.plist-bar{display:grid;gap:7px}
.pbar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:11px 14px;border-radius:12px;background:var(--soft);overflow:hidden;font-size:.9rem;font-weight:600}
.pbar .fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#d9f0e8,#eaf7f3);border-radius:12px;z-index:0}
.pbar .nm,.pbar .vl{position:relative;z-index:1;min-width:0}
.pbar .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-2)}
.pbar .vl{color:var(--brand-d);font-weight:700;flex:none}

/* ---------- ব্যানার কার্ড ---------- */
.bn-grid{display:grid;gap:14px;grid-template-columns:repeat(2,1fr)}
.bn-card{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 8px 20px rgba(16,40,36,.05);transition:.18s}
.bn-card:hover{border-color:var(--line);box-shadow:0 12px 26px rgba(16,40,36,.1)}
.bn-img{position:relative;display:block;aspect-ratio:856/292;background:var(--chip);overflow:hidden}
.bn-img img{width:100%;height:100%;object-fit:cover;display:block}
.bn-img .idx{position:absolute;top:9px;right:9px;background:rgba(9,25,22,.72);color:#fff;
  font-size:.72rem;font-weight:700;padding:3px 11px;border-radius:999px;backdrop-filter:blur(4px)}
.bn-img .off-mask{position:absolute;inset:0;background:rgba(255,255,255,.62);display:grid;place-items:center;
  font-weight:700;color:var(--muted);font-size:.85rem}
.bn-body{padding:12px 13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bn-body .nm{flex:1;min-width:0;font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bn-body .nm.none{color:var(--muted);font-weight:500}
.bn-lnk{display:block;padding:0 13px 11px;font-size:.76rem;color:var(--muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bn-lnk i{margin-left:0;margin-right:5px;color:var(--brand)}
.bn-edit{padding:0 13px 13px;display:grid;gap:9px}
.bn-edit input{font-size:.86rem;padding:8px 11px}
@media(max-width:700px){ .bn-grid{grid-template-columns:1fr} }

/* ---------- এক লাইনের লিস্ট (রিপোর্ট / নোটিশ) ---------- */
.a-list{display:grid;gap:8px}
.a-row{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);
  max-width:100%;overflow:hidden;
  border-radius:14px;background:var(--card);transition:.16s}
.a-row:hover{border-color:var(--line);background:var(--soft)}
.a-row.new{border-right:3px solid var(--brand)}
.a-row .rw-th{width:44px;height:44px;flex:none;border-radius:11px;object-fit:cover;background:var(--chip)}
.a-row .rw-tx{flex:1;min-width:0}
.a-row .rw-tx b{display:block;font-size:.89rem;font-weight:700;line-height:1.45;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a-row .rw-tx small{display:block;font-size:.74rem;color:var(--muted);line-height:1.45;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a-row .rw-act{display:flex;gap:5px;flex:none}
.ibtn{width:33px;height:33px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--ink-2);
  display:grid;place-items:center;font-size:.82rem;cursor:pointer;transition:.16s;padding:0}
.ibtn:hover{background:var(--brand);border-color:var(--brand);color:#fff}
.ibtn.dan:hover{background:var(--danger);border-color:var(--danger)}
.ibtn.ok:hover{background:var(--ok);border-color:var(--ok)}
.ibtn:active{transform:scale(.9)}
.a-row.prem-live{border-color:#eddcb4;background:linear-gradient(180deg,#fffdf7,#fffaf0)}
.a-row.sm{padding:8px 11px;gap:9px;border-radius:12px;color:inherit}
.a-row.sm .rw-tx b{font-size:.87rem}
.a-row.sm .rw-tx small{font-size:.73rem}
.a-row.sm .ibtn{width:29px;height:29px;font-size:.74rem}
.rw-full{display:none}

/* নিজস্ব কনফার্মেশন */
.cc-ask{position:fixed;inset:0;z-index:260;display:grid;place-items:center;padding:20px}
.ca-mask{position:absolute;inset:0;background:rgba(9,25,22,.55)}
.ca-box{position:relative;background:var(--card);border-radius:22px;padding:26px 22px 20px;max-width:340px;width:100%;
  text-align:center;box-shadow:0 26px 70px rgba(0,0,0,.3);animation:amIn .26s cubic-bezier(.2,.9,.3,1.2) both}
.ca-ic{width:64px;height:64px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;font-size:1.5rem;color:#fff}
.ca-ic.warn{background:linear-gradient(135deg,#d99311,#eeb03f)}
.ca-ic.dan{background:linear-gradient(135deg,#c0392b,#e2604f)}
.ca-ic.ok{background:linear-gradient(135deg,var(--brand),var(--brand-2))}
.ca-ic.info{background:linear-gradient(135deg,#3f4fb8,#6675d8)}
.ca-yes.ok{background:var(--brand)}.ca-yes.info{background:#3f4fb8}
.ca-box h3{margin:0 0 7px;font-size:1.08rem;font-weight:700}
.ca-box p{margin:0 0 18px;color:var(--muted);font-size:.9rem;line-height:1.65}
.ca-act{display:flex;gap:9px}
.ca-act button{flex:1;height:42px;border:0;border-radius:999px;font:inherit;font-weight:700;font-size:.9rem;cursor:pointer}
.ca-no{background:var(--chip);color:var(--ink-2)}
.ca-yes{background:var(--brand);color:#fff}
.ca-yes.dan{background:var(--danger)}
.ca-act button:active{transform:scale(.96)}

/* বিস্তারিত দেখার পপআপ */
.a-modal{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:18px}
.am-mask{position:absolute;inset:0;background:rgba(9,25,22,.5)}
.am-box{position:relative;background:var(--card);border-radius:20px;max-width:560px;width:100%;max-height:82vh;
  overflow-y:auto;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:amIn .26s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes amIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.am-x{position:absolute;top:12px;left:12px;width:34px;height:34px;border-radius:50%;border:0;background:var(--chip);
  color:var(--ink-2);font-size:.9rem;cursor:pointer}
.am-x:hover{background:var(--danger);color:#fff}
.am-body h3{margin:0 0 12px;font-size:1.08rem;font-weight:700;line-height:1.5;padding-left:40px}
.am-meta{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
.am-meta span{background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:3px 12px;
  font-size:.78rem;font-weight:600;color:var(--ink-2)}
.am-text{font-size:.93rem;line-height:1.85;color:var(--ink-2);white-space:pre-wrap;word-break:break-word;
  background:var(--soft);border:1px solid var(--line);border-radius:13px;padding:13px 15px}
.am-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}

/* লেখার প্রিভিউ */
.prev-box{max-width:620px;padding:0}
.prev-hd{position:sticky;top:0;background:var(--soft);border-bottom:1px solid var(--line);
  padding:14px 18px 13px 54px;font-weight:700;font-size:.92rem;border-radius:20px 20px 0 0}
.prev-hd i{color:var(--brand);margin-left:0;margin-right:8px}
.prev-body{padding:16px 18px 20px;font-size:.95rem;line-height:1.85;color:var(--ink-2);word-break:break-word}
.prev-body img{max-width:100%;border-radius:10px}
.prev-body table{width:100%;border-collapse:collapse}
.prev-body a{pointer-events:auto}
.ed-tools button.prev{background:var(--brand);border-color:var(--brand);color:#fff}
.ed-tools button.prev:hover{background:var(--brand-d)}

/* ---------- সেটিংসের আলাদা ভাগ (মেনু → ভেতরে) ---------- */
.set-nav{display:grid;gap:10px;grid-template-columns:repeat(2,1fr)}
.set-item{display:flex;flex-direction:row-reverse;align-items:center;gap:12px;width:100%;text-align:right;border:1px solid var(--line);
  background:var(--card);border-radius:16px;padding:14px;font:inherit;cursor:pointer;transition:.16s;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 6px 16px rgba(16,40,36,.04)}
.set-item:hover{border-color:var(--brand);transform:translateY(-1px)}
.set-item:active{transform:scale(.99)}
.set-item .ic{width:46px;height:46px;flex:none;border-radius:14px;display:grid;place-items:center;font-size:1.06rem;
  background:var(--brand-l);color:var(--brand)}
.set-item .ic.y{background:#fdf3e0;color:#b8790d}
.set-item .ic.b{background:#e8f0fd;color:#2a62c9}
.set-item .ic.p{background:#f2ebfd;color:#6b3fc9}
.set-item .ic.r{background:#fdecea;color:var(--danger)}
.set-item .tx{flex:1;min-width:0}
.set-item .tx b{display:block;font-size:.95rem;line-height:1.35}
.set-item .tx small{display:block;font-size:.78rem;color:var(--muted);line-height:1.45;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.set-item .go{color:var(--muted);font-size:.9rem;flex:none}
.set-back{display:inline-flex;flex-direction:row-reverse;align-items:center;gap:8px;border:1px solid var(--line);background:var(--card);
  float:right;clear:both;
  border-radius:999px;padding:8px 16px;font:inherit;font-weight:600;font-size:.86rem;color:var(--ink-2);
  cursor:pointer;margin-bottom:14px;transition:.16s}
.set-back:hover{border-color:var(--brand);color:var(--brand-d)}
.set-panel h2{clear:both}
@media(max-width:700px){ .set-nav{grid-template-columns:1fr} }

/* ---------- নিচে আটকানো সেভ বার (পেজের শেষে যেতে হবে না) ---------- */
.save-bar{position:sticky;bottom:0;z-index:40;display:flex;gap:10px;align-items:center;flex-wrap:wrap;
  margin:16px -18px -18px;padding:12px 18px calc(12px + env(safe-area-inset-bottom));
  background:color-mix(in srgb,var(--card) 95%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);
  box-shadow:0 -6px 20px rgba(16,40,36,.07)}
.save-bar .btn{padding:11px 24px;border-radius:999px;font-size:.92rem}
.save-bar .sp{flex:1}
.save-bar .note{font-size:.78rem;color:var(--muted)}
@media(max-width:900px){
  .save-bar{bottom:calc(58px + env(safe-area-inset-bottom));margin:16px -12px 0;padding:11px 12px}
  .save-bar .btn{flex:1;justify-content:center}
  .save-bar .note{display:none}
}

/* ফাইল আপলোডের প্রিভিউ */
.f-prev{width:74px;height:74px;border-radius:14px;object-fit:contain;background:var(--soft);
  border:1px solid var(--line);padding:5px;margin-bottom:8px}
input[type=file]{width:100%;border:1px solid var(--line);border-radius:11px;background:var(--soft);
  padding:9px 11px;font:inherit;font-size:.86rem}
.bar{height:8px;background:var(--chip);border-radius:999px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--brand);border-radius:999px}
@media(min-width:1400px){
  .a-body{max-width:1500px;margin:0 auto}
}
.a-mask{position:fixed;inset:0;background:rgba(9,25,22,.45);z-index:55;opacity:0;visibility:hidden;transition:.25s}
.a-mask.open{opacity:1;visibility:visible}
/* মোবাইল বটম মেনু (এডমিন) */
.a-bn{position:fixed;left:0;right:0;bottom:0;z-index:58;display:none;background:color-mix(in srgb,var(--card) 95%,transparent);
  backdrop-filter:blur(14px);border-top:1px solid var(--line);padding:4px 2px calc(4px + env(safe-area-inset-bottom));
  box-shadow:0 -6px 22px rgba(16,40,36,.07)}
.a-bn-in{display:flex;max-width:520px;margin:0 auto}
.a-bn a,.a-bn button{flex:1;border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:2px;
  padding:6px 0 4px;color:var(--muted);font:inherit;font-size:.66rem;font-weight:600;transition:color .2s}
.a-bn .i{width:36px;height:28px;border-radius:999px;display:grid;place-items:center;font-size:1.05rem;transition:.25s}
.a-bn a.on{color:var(--brand-d)}
.a-bn a.on .i{background:var(--brand-l);color:var(--brand)}
.a-bn a:active .i{transform:scale(.88)}
.a-bn .dot{position:absolute;top:2px;right:calc(50% - 16px);min-width:14px;height:14px;padding:0 4px;background:var(--danger);
  color:#fff;border-radius:999px;font-size:.56rem;font-weight:700;display:grid;place-items:center}
/* সেভ/ডিলিটের প্রিমিয়াম পপআপ */
.a-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:300;display:flex;align-items:center;gap:11px;
  background:var(--card);border:1px solid var(--line);border-right:4px solid var(--ok);border-radius:14px;
  padding:12px 18px 12px 14px;box-shadow:0 16px 44px rgba(16,40,36,.2);font-size:.92rem;font-weight:600;
  max-width:92vw;animation:atIn .34s cubic-bezier(.2,.9,.3,1.3) both}
.a-toast.err{border-right-color:var(--danger)}
.a-toast .ic{width:28px;height:28px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;
  font-size:.78rem;flex:none}
.a-toast.err .ic{background:var(--danger)}
.a-toast .bar{position:absolute;bottom:0;right:0;left:0;height:3px;border-radius:0 0 14px 14px;background:var(--ok);
  opacity:.35;transform-origin:right;animation:atBar 3.2s linear forwards}
.a-toast.err .bar{background:var(--danger)}
@keyframes atIn{from{opacity:0;transform:translateX(-50%) translateY(-16px) scale(.96)}to{opacity:1;transform:translateX(-50%)}}
@keyframes atBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.a-toast.out{opacity:0;transform:translateX(-50%) translateY(-12px);transition:.3s}
.f-prep{font-size:.78rem;color:var(--brand-d);margin-top:5px;display:none}
.f-prep.on{display:block}
@media(max-width:900px){
  .a-side{width:300px;max-width:86vw;transform:translateX(-103%);box-shadow:16px 0 44px rgba(9,25,22,.16)}
  .a-side.open{transform:none}
  .a-main{margin-left:0}
  .a-burger{display:grid;place-items:center}
  .a-brand{display:flex}
  .a-tools{display:flex}
  .a-top h1{display:none}
  .a-page{display:block}
  .stat{padding:13px;border-radius:16px;gap:11px}
  .stat .si{width:46px;height:46px;border-radius:14px;font-size:1.1rem}
  .stat b{font-size:1.35rem}
  .stat .sl{font-size:.82rem}
  .grid.stats{grid-template-columns:1fr 1fr;gap:11px}
  .a-row{padding:8px 9px;gap:7px;border-radius:12px}
  .a-row .rw-tx b{font-size:.84rem}
  .a-row .rw-tx small{font-size:.7rem}
  .a-row .pill{font-size:.68rem;padding:2px 8px}
  .a-row .rw-th{width:38px;height:38px;border-radius:10px}
  .ibtn{width:30px;height:30px;font-size:.76rem;border-radius:9px}
  .am-box{padding:16px;border-radius:17px}
  .g2,.g3,.g4{grid-template-columns:1fr}
  .a-body{padding:12px 12px 78px}
  .a-top{padding:10px 12px}
  .a-top h1{font-size:.98rem}
  .a-bn{display:block}
  .a-card{padding:13px;border-radius:15px}
  table{font-size:.85rem}
  th,td{padding:8px 6px}
  .btn{padding:10px 15px}
  .row-act{flex-wrap:wrap}
  input[type=text],input[type=email],input[type=password],input[type=url],input[type=date],input[type=number],select,textarea{font-size:16px}
}
@media(max-width:520px){
  /* টেবিল মোবাইলে কার্ডের মত এক লাইনে এক তথ্য */
  .tbl-card thead,.tbl-card tr.hd-row{display:none}
  .tbl-card tr{display:block;border:1px solid var(--line);border-radius:13px;margin-bottom:10px;padding:8px;background:var(--card)}
  .tbl-card td{display:flex;justify-content:space-between;gap:10px;border:0;padding:5px 4px;text-align:right}
  .tbl-card td::before{content:attr(data-l);font-weight:600;color:var(--ink-2);font-size:.8rem;flex:none}
  .tbl-card td:last-child{border-top:1px dashed var(--line);margin-top:4px;padding-top:8px}
}
</style>
</head><body>
<div class="a-wrap">
  <div class="a-mask" id="aMask"></div>
  <aside class="a-side" id="aSide">
    <div class="top">
      <img src="<?= e(site_logo()) ?>" alt="">
      <div><b><?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></b><small>এডমিন প্যানেল</small></div>
    </div>
    <nav class="a-menu">
      <?php foreach ($MENU as $m): if ($m[3] && !can($m[3])) continue; ?>
        <a href="<?= e(au($m[0] === 'dashboard' ? '' : $m[0])) ?>" class="<?= $mod === $m[0] ? 'on' : '' ?>">
          <i class="fa <?= e($m[2]) ?>"></i><?= e($m[1]) ?>
        </a>
      <?php endforeach; ?>
      <a class="danger" href="<?= e(au('logout')) ?>"><i class="fa fa-right-from-bracket"></i>লগআউট</a>
    </nav>
    <div class="bot">
      <a href="<?= e(au('profile')) ?>"><i class="fa fa-user" style="width:18px"></i><?= e($me['username']) ?></a>
      <a href="<?= e(url()) ?>" target="_blank"><i class="fa fa-arrow-up-right-from-square" style="width:18px"></i>সাইট দেখুন</a>
    </div>
  </aside>

  <div class="a-main">
    <div class="a-top">
      <button class="a-burger" id="aBurger" aria-label="মেনু"><i class="fa fa-bars"></i></button>
      <a class="a-brand" href="<?= e(au()) ?>">
        <img src="<?= e(site_logo()) ?>" alt="">
        <span style="min-width:0">
          <b><?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></b>
          <small>এডমিন প্যানেল</small>
        </span>
      </a>
      <h1><?= e($title) ?></h1>
      <button type="button" class="th-tg" id="aTheme" aria-label="ডার্ক মোড"><i class="fa fa-moon"></i><i class="fa fa-sun"></i></button>
      <div class="a-tools">
        <a href="<?= e(url()) ?>" target="_blank" aria-label="সাইট দেখুন"><i class="fa fa-arrow-up-right-from-square"></i></a>
        <a class="out" href="<?= e(au('logout')) ?>" aria-label="লগআউট"><i class="fa fa-right-from-bracket"></i></a>
      </div>
    </div>
    <h1 class="a-page"><?= e($title) ?></h1>
    <div class="a-body">
    <?php
}

function admin_end(): void
{
    global $mod;
    $newReports = 0;
    try { $newReports = (int)col("SELECT COUNT(*) FROM reports WHERE status = 0"); } catch (Throwable $e) {}
    ?>
    </div>
  </div>
</div>
<?php if (!empty($_SESSION['flash'])) show_flash(); ?>

<!-- মোবাইল বটম মেনু -->
<nav class="a-bn" aria-label="এডমিন মেনু">
  <div class="a-bn-in">
    <a href="<?= e(au()) ?>" class="<?= $mod === 'dashboard' ? 'on' : '' ?>"><span class="i"><i class="fa fa-gauge-high"></i></span>ড্যাশবোর্ড</a>
    <?php if (can('posts')): ?>
      <a href="<?= e(au('posts')) ?>" class="<?= $mod === 'posts' ? 'on' : '' ?>"><span class="i"><i class="fa fa-newspaper"></i></span>পোস্ট</a>
      <a href="<?= e(au('post')) ?>" class="<?= $mod === 'post' ? 'on' : '' ?>"><span class="i"><i class="fa fa-circle-plus"></i></span>নতুন</a>
    <?php endif; ?>
    <?php if (can('reports')): ?>
      <a href="<?= e(au('reports')) ?>" class="<?= $mod === 'reports' ? 'on' : '' ?>" style="position:relative">
        <?php if ($newReports): ?><span class="dot"><?= bn($newReports) ?></span><?php endif; ?>
        <span class="i"><i class="fa fa-flag"></i></span>রিপোর্ট</a>
    <?php endif; ?>
    <button type="button" id="aBnMenu"><span class="i"><i class="fa fa-bars"></i></span>মেনু</button>
  </div>
</nav>

<script>
/* =========================================================
   এডমিন প্যানেল রিলোড ছাড়াই চলবে — শুধু মাঝের অংশ বদলায়
   (হেডার, সাইডবার, বটম মেনু একবারই লোড হয়)
   ========================================================= */
document.addEventListener('click',function(e){
  if(!e.target.closest('#aTheme')) return;
  var d=document.documentElement.getAttribute('data-theme')==='dark';
  if(d) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme','dark');
  try{localStorage.setItem('cc_admin_theme', d?'light':'dark');}catch(x){}
});
(function(){
  var main=document.querySelector('.a-body');
  if(!main || !window.history || !window.fetch) return;
  var BASE=<?= json_encode(au()) ?>;
  var busy=false;

  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;top:0;left:0;height:3px;width:0;z-index:300;'+
    'background:linear-gradient(90deg,#0f766e,#7fe0cf);transition:width .2s ease,opacity .3s;opacity:0';
  document.body.appendChild(bar);
  function start(){ bar.style.opacity=1; bar.style.width='35%'; setTimeout(function(){bar.style.width='72%';},220); }
  function stop(){ bar.style.width='100%'; setTimeout(function(){bar.style.opacity=0;setTimeout(function(){bar.style.width=0;},300);},160); }

  function ok(a){
    if(!a || !a.href) return false;
    if(a.target==='_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-spa')) return false;
    if(a.getAttribute('href').charAt(0)==='#') return false;
    if(a.href.indexOf(BASE)!==0) return false;
    if(/logout/.test(a.href)) return false;
    return true;
  }

  function swap(url, push){
    if(busy) return; busy=true; start();
    fetch(url,{credentials:'same-origin',headers:{'X-Admin-SPA':'1'},cache:'no-store'})
      .then(function(r){ return r.text(); })
      .then(function(html){
        var doc=new DOMParser().parseFromString(html,'text/html');
        var nb=doc.querySelector('.a-body');
        if(!nb){ location.href=url; return; }

        main.innerHTML=nb.innerHTML;
        document.title=doc.title;

        var np=doc.querySelector('.a-page'), cp=document.querySelector('.a-page');
        if(np&&cp) cp.textContent=np.textContent;
        var nt=doc.querySelector('.a-top h1'), ct=document.querySelector('.a-top h1');
        if(nt&&ct) ct.textContent=nt.textContent;

        var nm=doc.querySelector('.a-menu'), cm=document.querySelector('.a-menu');
        if(nm&&cm) cm.innerHTML=nm.innerHTML;
        var nn=doc.querySelector('.a-bn-in'), cn=document.querySelector('.a-bn-in');
        if(nn&&cn) cn.innerHTML=nn.innerHTML;

        /* নতুন অংশের স্ক্রিপ্ট চালাই (innerHTML নিজে চালায় না) */
        main.querySelectorAll('script').forEach(function(old){
          var sc=document.createElement('script');
          if(old.src) sc.src=old.src; else sc.textContent=old.textContent;
          if(old.type) sc.type=old.type;
          if(sc.type==='text/template'){ return; }
          old.parentNode.replaceChild(sc, old);
        });

        if(push) history.pushState({adm:1},'',url);
        window.scrollTo(0,0);
        if(window.ccSetupSettings) window.ccSetupSettings();
        document.dispatchEvent(new CustomEvent('admin:ready'));
      })
      .catch(function(){ location.href=url; })
      .finally(function(){ busy=false; stop(); });
  }

  document.addEventListener('click',function(e){
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey) return;
    var a=e.target.closest('a');
    if(!ok(a)) return;
    e.preventDefault();
    var side=document.getElementById('aSide'), mask=document.getElementById('aMask');
    if(side){ side.classList.remove('open'); if(mask) mask.classList.remove('open'); document.body.style.overflow=''; }
    swap(a.href,true);
  });
  window.addEventListener('popstate',function(){ swap(location.href,false); });
  history.replaceState({adm:1},'',location.href);
})();

/* ---------- সেভ পপআপ নিজে থেকে মিলিয়ে যাবে ---------- */
(function(){
  var t=document.querySelector('.a-toast');
  if(!t) return;
  function kill(){t.classList.add('out');setTimeout(function(){t.remove();},320);}
  t.addEventListener('click',kill);
  setTimeout(kill,3200);
})();

/* ---------- বিস্তারিত দেখার পপআপ ---------- */
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-view]');
  if(b){
    var row=b.closest('.a-row'); if(!row) return;
    var full=row.querySelector('.rw-full'); if(!full) return;
    var html = (full.tagName === 'SCRIPT') ? full.textContent : full.innerHTML;
    var m=document.createElement('div');
    m.className='a-modal';
    m.innerHTML='<div class="am-mask"></div><div class="am-box" role="dialog">'+
                '<button type="button" class="am-x"><i class="fa fa-xmark"></i></button>'+
                '<div class="am-body">'+html+'</div></div>';
    document.body.appendChild(m);
    document.body.style.overflow='hidden';
    function kill(){ m.remove(); document.body.style.overflow=''; }
    m.addEventListener('click',function(ev){
      if(ev.target.closest('.am-mask')||ev.target.closest('.am-x')) kill();
    });
    document.addEventListener('keydown',function esc(ev){ if(ev.key==='Escape'){kill();document.removeEventListener('keydown',esc);} });
    return;
  }
});

/* ---------- সেটিংসের ভাগগুলো খোলা/বন্ধ ---------- */
function ccSetupSettings(){
  var nav=document.getElementById('setNav');
  if(!nav) return;
  var panels=document.querySelectorAll('.set-panel');
  function open(id){
    nav.hidden=true;
    panels.forEach(function(p){ p.hidden = (p.id!==id); });
    try{ sessionStorage.setItem('cc_set_panel', id); }catch(e){}
    window.scrollTo({top:0,behavior:'auto'});
  }
  function home(){
    nav.hidden=false;
    panels.forEach(function(p){ p.hidden=true; });
    try{ sessionStorage.removeItem('cc_set_panel'); }catch(e){}
    window.scrollTo({top:0,behavior:'auto'});
  }
  if(!window.__ccSetBound){
    window.__ccSetBound = 1;
    document.addEventListener('click',function(e){
      var it=e.target.closest('[data-panel]');
      if(it){ var p=document.getElementById(it.getAttribute('data-panel')); if(p){ ccOpenPanel(it.getAttribute('data-panel')); } }
      else if(e.target.closest('.set-back')) ccHomePanel();
    });
  }
  window.ccOpenPanel=open; window.ccHomePanel=home;
  var last=null;
  try{ last=sessionStorage.getItem('cc_set_panel'); }catch(e){}
  if(last && document.getElementById(last)) open(last); else home();
}
ccSetupSettings();

/* ---------- ড্রয়ার ---------- */
(function(){
  var side=document.getElementById('aSide'), mask=document.getElementById('aMask');
  function open(){side.classList.add('open');mask.classList.add('open');document.body.style.overflow='hidden';}
  function close(){side.classList.remove('open');mask.classList.remove('open');document.body.style.overflow='';}
  document.addEventListener('click',function(e){
    if(e.target.closest('#aBurger')||e.target.closest('#aBnMenu')) side.classList.contains('open')?close():open();
    else if(e.target.closest('#aMask')) close();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();

/* ---------- নিজস্ব কনফার্মেশন পপআপ (ব্রাউজারের "domain says" নয়) ---------- */
/* এক বোতামের সুন্দর বার্তা — সফল / সতর্কতা / ত্রুটি */
window.ccAlert = function (opt) {
  var o = typeof opt === 'string' ? { text: opt } : (opt || {});
  var type = o.type || 'ok';
  var icon = o.icon || (type === 'ok' ? 'fa-circle-check' : (type === 'dan' ? 'fa-circle-exclamation' : 'fa-circle-info'));
  var d = document.createElement('div');
  d.className = 'cc-ask';
  d.innerHTML =
    '<div class="ca-mask"></div>' +
    '<div class="ca-box" role="dialog">' +
      '<div class="ca-ic ' + type + '"><i class="fa ' + icon + '"></i></div>' +
      '<h3>' + (o.title || '') + '</h3>' +
      '<p>' + (o.text || '') + '</p>' +
      '<div class="ca-act">' +
        (o.link ? '<a class="ca-yes ' + type + '" href="' + o.link + '" style="display:grid;place-items:center;text-decoration:none">' + (o.linkText || 'দেখুন') + '</a>' : '') +
        '<button type="button" class="' + (o.link ? 'ca-no' : 'ca-yes ' + type) + '">' + (o.ok || 'ঠিক আছে') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(d);
  function done() { d.remove(); }
  d.querySelector('.ca-act button').onclick = done;
  d.querySelector('.ca-mask').onclick = done;
};

window.ccConfirm = function (opt) {
  return new Promise(function (resolve) {
    var o = typeof opt === 'string' ? { text: opt } : (opt || {});
    var d = document.createElement('div');
    d.className = 'cc-ask';
    d.innerHTML =
      '<div class="ca-mask"></div>' +
      '<div class="ca-box" role="dialog">' +
        '<div class="ca-ic ' + (o.type || 'warn') + '"><i class="fa ' + (o.icon || 'fa-triangle-exclamation') + '"></i></div>' +
        '<h3>' + (o.title || 'নিশ্চিত করুন') + '</h3>' +
        '<p>' + (o.text || 'আপনি কি নিশ্চিত?') + '</p>' +
        '<div class="ca-act">' +
          '<button type="button" class="ca-no">' + (o.no || 'না, থাক') + '</button>' +
          '<button type="button" class="ca-yes ' + (o.type || 'warn') + '">' + (o.yes || 'হ্যাঁ, করুন') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
    document.body.style.overflow = 'hidden';
    function done(v) { d.remove(); document.body.style.overflow = ''; resolve(v); }
    d.querySelector('.ca-yes').onclick = function () { done(true); };
    d.querySelector('.ca-no').onclick  = function () { done(false); };
    d.querySelector('.ca-mask').onclick = function () { done(false); };
    setTimeout(function () { d.querySelector('.ca-yes').focus(); }, 60);
  });
};

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-confirm]');
  if (!b || b.dataset.okd === '1') return;
  e.preventDefault();
  e.stopPropagation();
  var danger = /মুছ|ডিলিট|delete/i.test(b.getAttribute('data-confirm') || '');
  window.ccConfirm({
    text: b.getAttribute('data-confirm'),
    type: danger ? 'dan' : 'warn',
    icon: danger ? 'fa-trash-can' : 'fa-circle-question',
    yes:  danger ? 'হ্যাঁ, মুছে ফেলুন' : 'হ্যাঁ, করুন'
  }).then(function (ok) {
    if (!ok) return;
    b.dataset.okd = '1';
    if (b.tagName === 'A') { location.href = b.href; return; }
    if (b.form) {                       /* বাটনের name/value সহ সাবমিট */
      if (b.name) {
        var h = document.createElement('input');
        h.type = 'hidden'; h.name = b.name; h.value = b.value;
        b.form.appendChild(h);
      }
      if (b.form.requestSubmit) b.form.requestSubmit(); else b.form.submit();
      return;
    }
    b.click();
  });
}, true);
document.addEventListener('change',function(e){
  if(e.target.id==='checkAll'){
    document.querySelectorAll('.chk-item').forEach(function(c){c.checked=e.target.checked;});
  }
});

/* =========================================================
   ছবি আপলোডের আগেই ব্রাউজারে ছোট করে নেওয়া
   → বড় ছবিও সেকেন্ডে আপলোড হয়, সার্ভারের লিমিটে আটকায় না
   ইনপুটে data-maxw / data-ratio / data-kb দিলে সেই মাপে যাবে
   ========================================================= */
(function(){
  function readable(b){return b>=1048576?(b/1048576).toFixed(1)+' MB':Math.round(b/1024)+' KB';}
  function note(input){
    var n=input.parentNode.querySelector('.f-prep');
    if(!n){n=document.createElement('div');n.className='f-prep';input.parentNode.appendChild(n);}
    return n;
  }
  function shrink(file,maxW,ratio,targetKb){
    return new Promise(function(res,rej){
      if(!/^image\//.test(file.type)||/svg/.test(file.type)) return res(null);
      var img=new Image(), url=URL.createObjectURL(file);
      img.onload=function(){
        URL.revokeObjectURL(url);
        var w=img.width,h=img.height,sx=0,sy=0,sw=w,sh=h;
        if(ratio){
          if(w/h>ratio){sw=Math.round(h*ratio);sh=h;} else {sw=w;sh=Math.round(w/ratio);}
          sx=Math.round((w-sw)/2); sy=Math.round((h-sh)/2);
        }
        var outW=Math.min(maxW,sw), outH=ratio?Math.round(outW/ratio):Math.round(sh*(outW/sw));
        var c=document.createElement('canvas');c.width=outW;c.height=outH;
        var ctx=c.getContext('2d');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,outW,outH);
        ctx.drawImage(img,sx,sy,sw,sh,0,0,outW,outH);
        var qs=[.86,.78,.7,.62,.54,.46,.38], i=0;
        (function next(){
          c.toBlob(function(b){
            if(!b) return rej();
            if(b.size<=targetKb*1024||i>=qs.length-1){
              res(new File([b], (file.name.replace(/\.[^.]+$/,''))+'.jpg', {type:'image/jpeg'}));
            } else { i++; next(); }
          },'image/jpeg',qs[i]);
        })();
      };
      img.onerror=function(){URL.revokeObjectURL(url);res(null);};
      img.src=url;
    });
  }
  document.addEventListener('change',function(e){
    var inp=e.target;
    if(inp.type!=='file'||!inp.files||!inp.files.length) return;
    if(!/image/.test(inp.getAttribute('accept')||'')) return;
    var f=inp.files[0];
    if(!/^image\//.test(f.type)||/svg/.test(f.type)) return;
    var maxW=parseInt(inp.getAttribute('data-maxw')||'1600',10);
    var ratio=parseFloat(inp.getAttribute('data-ratio')||'0')||null;
    var kb=parseInt(inp.getAttribute('data-kb')||'300',10);
    var n=note(inp); n.className='f-prep on'; n.textContent='ছবি প্রস্তুত করা হচ্ছে…';
    var files=Array.prototype.slice.call(inp.files);
    Promise.all(files.map(function(file){return shrink(file,maxW,ratio,kb).catch(function(){return null;});}))
      .then(function(outs){
        var dt=new DataTransfer(), changed=false, before=0, after=0;
        files.forEach(function(file,i){
          before+=file.size;
          var o=outs[i]&&outs[i].size<file.size?outs[i]:file;
          after+=o.size; if(o!==file) changed=true;
          dt.items.add(o);
        });
        if(changed){ inp.files=dt.files; n.textContent='✓ ছবি ছোট করা হয়েছে: '+readable(before)+' → '+readable(after); }
        else n.className='f-prep';
      }).catch(function(){ n.className='f-prep'; });
  });
})();
</script>
</body></html>
    <?php
}

/* ---------- ফ্ল্যাশ মেসেজ ---------- */
function flash(string $type, string $msg): void { $_SESSION['flash'] = [$type, $msg]; }
function show_flash(): void
{
    if (empty($_SESSION['flash'])) return;
    [$t, $m] = $_SESSION['flash']; unset($_SESSION['flash']);
    $ok = $t !== 'err';
    echo '<div class="msg ' . e($t) . '">' . e($m) . '</div>';
    echo '<div class="a-toast ' . ($ok ? 'ok' : 'err') . '" role="status">'
       . '<span class="ic"><i class="fa ' . ($ok ? 'fa-check' : 'fa-exclamation') . '"></i></span>'
       . '<span>' . e($m) . '</span><span class="bar"></span></div>';
}

/* =========================================================
   মডিউল রাউটার
   ========================================================= */
$modules = ['dashboard','posts','post','categories','banners','ads','automation','notices','reports','analytics','users','settings','profile'];
$file = in_array($mod, $modules, true) ? $mod : 'dashboard';
require __DIR__ . '/' . $file . '.php';
