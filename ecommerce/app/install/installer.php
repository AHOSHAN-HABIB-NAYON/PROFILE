<?php
/**
 * One-time web installer.
 *
 * Runs only while config.php does not exist (see app/bootstrap.php). The owner
 * opens the domain, enters database + store + admin details, and the installer:
 *   1. checks server requirements,
 *   2. tests the MySQL connection,
 *   3. imports database/schema.sql (+ system rows, + optional sample catalog),
 *   4. creates the owner admin account and basic store settings,
 *   5. writes config.php with freshly generated secret keys.
 * After that config.php exists and this file is never reached again.
 */

session_name('ns_install');
session_start();
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$h = static fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$csrf = $_SESSION['install_csrf'] ??= bin2hex(random_bytes(16));

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
$basePath = (PHP_SAPI === 'cli-server' || $scriptDir === '/' || $scriptDir === '.') ? '' : rtrim($scriptDir, '/');
$host = preg_replace('/[^a-z0-9.:\-\[\]]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
$detectedUrl = ($https ? 'https' : 'http') . '://' . $host . $basePath;

// ------------------------------------------------------------------ requirements
$checks = [
    ['PHP 8.1 বা নতুন (বর্তমান: ' . PHP_VERSION . ')', version_compare(PHP_VERSION, '8.1.0', '>=')],
    ['PDO MySQL extension', extension_loaded('pdo_mysql')],
    ['GD (ছবি কম্প্রেশন) + WebP', extension_loaded('gd') && function_exists('imagewebp')],
    ['mbstring', extension_loaded('mbstring')],
    ['sodium (এনক্রিপশন)', extension_loaded('sodium')],
    ['cURL (কুরিয়ার/পিক্সেল API)', extension_loaded('curl')],
    ['fileinfo (আপলোড যাচাই)', extension_loaded('fileinfo')],
    ['মূল ফোল্ডারে config.php লেখার অনুমতি', is_writable(ROOT_PATH)],
];
foreach (['storage/cache', 'storage/logs', 'storage/backups', 'storage/tmp', 'public/uploads'] as $dir) {
    $checks[] = [$dir . ' লেখার অনুমতি', is_dir(ROOT_PATH . '/' . $dir) && is_writable(ROOT_PATH . '/' . $dir)];
}
$blocking = array_filter($checks, static fn($c) => !$c[1] && !str_contains($c[0], 'config.php'));

// ------------------------------------------------------------------ handle submit
$errors = [];
$done = null;
$old = $_POST + [
    'db_host' => 'localhost', 'db_name' => '', 'db_user' => '', 'db_pass' => '', 'app_url' => $detectedUrl,
    'store_name' => '', 'whatsapp' => '+8801757827996', 'admin_name' => '', 'admin_email' => '', 'admin_pass' => '', 'sample' => '1',
];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $in = array_map(static fn($v) => is_string($v) ? trim($v) : '', $_POST);
    if (!hash_equals($csrf, $in['_csrf'] ?? '')) {
        $errors[] = 'সেশনের মেয়াদ শেষ। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।';
    }
    if ($blocking) {
        $errors[] = 'সার্ভারের প্রয়োজনীয়তা পূরণ হয়নি (নিচের তালিকা দেখুন)।';
    }
    foreach (['db_host' => 'Database host', 'db_name' => 'Database name', 'db_user' => 'Database user', 'store_name' => 'স্টোরের নাম', 'admin_name' => 'অ্যাডমিনের নাম', 'admin_email' => 'অ্যাডমিন ইমেইল'] as $k => $label) {
        if (($in[$k] ?? '') === '') {
            $errors[] = $label . ' দিন।';
        }
    }
    $email = strtolower($in['admin_email'] ?? '');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'সঠিক ইমেইল দিন।';
    }
    $pass = (string)($_POST['admin_pass'] ?? '');
    if (strlen($pass) < 10 || !preg_match('/[a-z]/', $pass) || !preg_match('/[A-Z]/', $pass) || !preg_match('/\d/', $pass) || !preg_match('/[^A-Za-z0-9]/', $pass)) {
        $errors[] = 'পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে এবং বড় হাতের অক্ষর, ছোট হাতের অক্ষর, সংখ্যা ও একটি চিহ্ন (যেমন @ # !) থাকতে হবে।';
    }
    $appUrl = rtrim($in['app_url'] ?? '', '/');
    if (!preg_match('#^https?://[^\s/]+(/[^\s]*)?$#i', $appUrl)) {
        $errors[] = 'সাইটের সঠিক URL দিন (যেমন https://yourshop.com)।';
    }

    if (!$errors) {
        try {
            $pdo = new PDO(
                sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $in['db_host'], $in['db_name']),
                $in['db_user'], (string)($_POST['db_pass'] ?? ''),
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
            );
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        } catch (PDOException $e) {
            $errors[] = 'ডেটাবেসে কানেক্ট করা যায়নি। Host, নাম, ইউজার ও পাসওয়ার্ড আবার দেখুন। (' . preg_replace('/\s+/', ' ', $e->getMessage()) . ')';
        }
    }

    if (!$errors) {
        $hasAdmins = false;
        try {
            $hasAdmins = (bool)$pdo->query('SELECT 1 FROM admins LIMIT 1')->fetchColumn();
        } catch (PDOException $e) {
            $hasAdmins = false; // table not created yet
        }
        if ($hasAdmins) {
            $errors[] = 'এই ডেটাবেসে আগে থেকেই স্টোর ইনস্টল করা আছে। নতুন (খালি) ডেটাবেস ব্যবহার করুন, অথবা আগের config.php ফাইলটি আবার আপলোড করুন।';
        }
    }

    if (!$errors) {
        try {
            $run = static function (PDO $pdo, string $sql): void {
                $sql = preg_replace('/^\s*--.*$/m', '', $sql);
                foreach (preg_split('/;\s*\n/', $sql) as $stmt) {
                    if (trim($stmt) !== '') {
                        $pdo->exec($stmt);
                    }
                }
            };
            $run($pdo, (string)file_get_contents(ROOT_PATH . '/database/schema.sql'));
            $seed = (string)file_get_contents(ROOT_PATH . '/database/seed.sql');
            $marker = strpos($seed, '-- Sample catalog');
            $run($pdo, $marker === false ? $seed : substr($seed, 0, $marker));          // icons, plugins, couriers, tracking
            if (($in['sample'] ?? '') === '1' && $marker !== false) {
                $run($pdo, substr($seed, $marker));                                      // demo categories/products/coupon
            }

            $pdo->prepare('INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, "owner")')
                ->execute([$in['admin_name'], $email, password_hash($pass, PASSWORD_DEFAULT)]);

            $wa = preg_replace('/[^\d+]/', '', $in['whatsapp'] ?? '');
            $settings = ['store_name' => $in['store_name'], 'pwa_short_name' => mb_substr($in['store_name'], 0, 12)];
            if ($wa !== '') {
                $settings['whatsapp_number'] = $wa;
                $settings['contact_phone'] = $wa;
            }
            $stmt = $pdo->prepare('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
            foreach ($settings as $k => $v) {
                $stmt->execute([$k, $v]);
            }

            // Build config.php from the example template with real values + new secrets.
            $values = [
                'APP_ENV' => 'production', 'APP_URL' => $appUrl,
                'APP_KEY' => bin2hex(random_bytes(32)), 'INSTALL_KEY' => bin2hex(random_bytes(12)),
                'DB_HOST' => $in['db_host'], 'DB_NAME' => $in['db_name'], 'DB_USER' => $in['db_user'], 'DB_PASS' => (string)($_POST['db_pass'] ?? ''),
                'STORE_NAME' => $in['store_name'], 'STORE_WHATSAPP' => $wa ?: '+8801757827996', 'STORE_PHONE' => $wa ?: '+8801757827996', 'STORE_EMAIL' => $email,
            ];
            $config = (string)file_get_contents(ROOT_PATH . '/config.example.php');
            foreach ($values as $const => $val) {
                $config = preg_replace(
                    "/define\\('" . $const . "',\\s*'[^']*'\\);/",
                    "define('" . $const . "', " . str_replace(['\\', '$'], ['\\\\', '\\$'], var_export($val, true)) . ");",
                    $config,
                    1
                );
            }
            $config = preg_replace('#\s*// >>> REPLACE <<<[^\n]*#', '', $config);
            $config = str_replace('Copy this file to "config.php"', 'Generated by the web installer on ' . date('Y-m-d H:i') . ' — keep it private', $config);

            if (@file_put_contents(ROOT_PATH . '/config.php', $config, LOCK_EX) === false) {
                $done = ['manual' => true, 'config' => $config];
            } else {
                @chmod(ROOT_PATH . '/config.php', 0640);
                $done = ['manual' => false];
            }
            unset($_SESSION['install_csrf']);
        } catch (Throwable $e) {
            $errors[] = 'ইনস্টল করার সময় সমস্যা হয়েছে: ' . preg_replace('/\s+/', ' ', $e->getMessage());
        }
    }
}
?><!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>স্টোর ইনস্টলেশন</title>
<style>
  :root { --p:#4f46e5; --s:#7c3aed; --bg:#f4f5fb; --b:#e4e7f0; --t:#0f172a; --m:#64748b; --ok:#16a34a; --err:#dc2626; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: 'Hind Siliguri', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif; background: radial-gradient(circle at 10% 0%, #e0e7ff, transparent 45%), var(--bg); color: var(--t); line-height:1.6; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; }
  .brand { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
  .mark { width:46px; height:46px; border-radius:14px; background:linear-gradient(135deg,var(--p),var(--s)); color:#fff; display:grid; place-items:center; font-size:22px; font-weight:800; }
  h1 { font-size:1.5rem; margin:0; } h2 { font-size:1.05rem; margin:0 0 12px; }
  .card { background:#fff; border:1px solid var(--b); border-radius:18px; padding:20px; margin-bottom:16px; box-shadow:0 4px 14px rgba(15,23,42,.06); }
  .grid { display:grid; gap:0 14px; } @media (min-width:640px){ .grid { grid-template-columns:1fr 1fr; } }
  label { display:block; font-weight:600; font-size:.92rem; margin-bottom:4px; }
  .field { margin-bottom:14px; }
  input[type=text], input[type=password], input[type=email], input[type=url] { width:100%; min-height:48px; padding:10px 14px; border:1.5px solid var(--b); border-radius:12px; font-size:16px; font-family:inherit; }
  input:focus { outline:none; border-color:var(--p); box-shadow:0 0 0 4px #e0e7ff; }
  .hint { color:var(--m); font-size:.82rem; margin-top:4px; }
  .check { display:flex; gap:10px; align-items:center; font-weight:500; }
  .check input { width:20px; height:20px; accent-color:var(--p); }
  .req li { list-style:none; padding:4px 0; font-size:.92rem; } .req { padding:0; margin:0; columns: 2 260px; }
  .ok { color:var(--ok); } .bad { color:var(--err); }
  .alert { background:#fee2e2; color:var(--err); border-radius:12px; padding:12px 14px; margin-bottom:16px; }
  .alert p { margin:2px 0; }
  .success { background:#dcfce7; color:var(--ok); }
  button, .btn { display:inline-flex; align-items:center; justify-content:center; min-height:52px; padding:0 24px; border:0; border-radius:14px; background:linear-gradient(135deg,var(--p),var(--s)); color:#fff; font-size:1rem; font-weight:700; cursor:pointer; text-decoration:none; font-family:inherit; }
  button { width:100%; }
  .btn-ghost { background:#fff; color:var(--p); border:1.5px solid var(--b); }
  .actions { display:flex; gap:10px; flex-wrap:wrap; }
  textarea { width:100%; min-height:260px; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; border:1px solid var(--b); border-radius:12px; padding:10px; }
  ol li { margin-bottom:6px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span class="mark">🛍</span><div><h1>স্টোর ইনস্টলেশন</h1><div class="hint">মাত্র একবার — তথ্যগুলো দিন, বাকি সব অটোমেটিক হবে</div></div></div>

<?php if ($done): ?>
  <div class="card">
    <div class="alert success"><strong>✅ ইনস্টলেশন সফল হয়েছে!</strong><br>ডেটাবেস তৈরি হয়েছে, অ্যাডমিন অ্যাকাউন্ট খোলা হয়েছে।</div>
    <?php if ($done['manual']): ?>
      <p><strong>একটি কাজ বাকি:</strong> সার্ভার <code>config.php</code> ফাইল লিখতে দেয়নি। File Manager-এ সাইটের মূল ফোল্ডারে (যেখানে <code>index.php</code> আছে) <code>config.php</code> নামে নতুন ফাইল তৈরি করে নিচের সব লেখা পেস্ট করে সেভ করুন, তারপর সাইট রিফ্রেশ করুন।</p>
      <textarea readonly onclick="this.select()"><?= $h($done['config']) ?></textarea>
    <?php else: ?>
      <ol>
        <li>অ্যাডমিন প্যানেলে লগইন করুন: <strong><?= $h($old['admin_email']) ?></strong></li>
        <li>Settings থেকে লোগো, রং, যোগাযোগ ও ডেলিভারি চার্জ ঠিক করুন।</li>
        <li>Plugins থেকে কুরিয়ার (Steadfast/Pathao/RedX/BD Courier) ও Meta Pixel যুক্ত করুন।</li>
        <li>নিরাপত্তার জন্য Account থেকে 2FA চালু করুন।</li>
      </ol>
      <div class="actions">
        <a class="btn" href="<?= $h($basePath) ?>/admin/login">অ্যাডমিন প্যানেলে যান</a>
        <a class="btn btn-ghost" href="<?= $h($basePath) ?>/">স্টোর দেখুন</a>
      </div>
    <?php endif; ?>
  </div>
<?php else: ?>

  <?php if ($errors): ?>
    <div class="alert"><?php foreach ($errors as $err): ?><p>• <?= $h($err) ?></p><?php endforeach; ?></div>
  <?php endif; ?>

  <div class="card">
    <h2>১. সার্ভার যাচাই</h2>
    <ul class="req">
      <?php foreach ($checks as [$label, $ok]): ?>
        <li class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✔' : '✖' ?> <?= $h($label) ?></li>
      <?php endforeach; ?>
    </ul>
    <?php if ($blocking): ?><p class="hint bad">✖ চিহ্নিত বিষয়গুলো ঠিক করুন (hPanel → Advanced → PHP Configuration থেকে extension চালু করুন, অথবা ফোল্ডারের permission 755 দিন)।</p><?php endif; ?>
  </div>

  <form method="post" autocomplete="off">
    <input type="hidden" name="_csrf" value="<?= $h($csrf) ?>">

    <div class="card">
      <h2>২. ডেটাবেস</h2>
      <p class="hint">Hostinger: hPanel → Databases → MySQL Databases থেকে নতুন ডেটাবেস ও ইউজার তৈরি করে তথ্যগুলো এখানে দিন।</p>
      <div class="grid">
        <div class="field"><label for="db_host">Database Host</label><input type="text" id="db_host" name="db_host" value="<?= $h($old['db_host']) ?>" required><div class="hint">সাধারণত localhost</div></div>
        <div class="field"><label for="db_name">Database Name</label><input type="text" id="db_name" name="db_name" value="<?= $h($old['db_name']) ?>" placeholder="u123456789_shop" required></div>
        <div class="field"><label for="db_user">Database User</label><input type="text" id="db_user" name="db_user" value="<?= $h($old['db_user']) ?>" placeholder="u123456789_shop" required></div>
        <div class="field"><label for="db_pass">Database Password</label><input type="password" id="db_pass" name="db_pass" value="<?= $h($old['db_pass']) ?>"></div>
      </div>
    </div>

    <div class="card">
      <h2>৩. স্টোরের তথ্য</h2>
      <div class="grid">
        <div class="field"><label for="store_name">স্টোরের নাম</label><input type="text" id="store_name" name="store_name" value="<?= $h($old['store_name']) ?>" placeholder="যেমন: আমার শপ" required></div>
        <div class="field"><label for="whatsapp">WhatsApp নাম্বার</label><input type="text" id="whatsapp" name="whatsapp" value="<?= $h($old['whatsapp']) ?>" placeholder="+8801XXXXXXXXX"></div>
      </div>
      <div class="field"><label for="app_url">সাইটের ঠিকানা (URL)</label><input type="url" id="app_url" name="app_url" value="<?= $h($old['app_url']) ?>" required><div class="hint">অটোমেটিক শনাক্ত করা হয়েছে। SSL চালু থাকলে https:// রাখুন।</div></div>
      <label class="check"><input type="checkbox" name="sample" value="1"<?= ($old['sample'] ?? '') === '1' ? ' checked' : '' ?>> নমুনা পণ্য ও ক্যাটাগরি যোগ করুন (পরে মুছে ফেলা যাবে)</label>
    </div>

    <div class="card">
      <h2>৪. অ্যাডমিন অ্যাকাউন্ট</h2>
      <div class="grid">
        <div class="field"><label for="admin_name">আপনার নাম</label><input type="text" id="admin_name" name="admin_name" value="<?= $h($old['admin_name']) ?>" required></div>
        <div class="field"><label for="admin_email">ইমেইল (লগইনের জন্য)</label><input type="email" id="admin_email" name="admin_email" value="<?= $h($old['admin_email']) ?>" required></div>
      </div>
      <div class="field"><label for="admin_pass">পাসওয়ার্ড</label><input type="password" id="admin_pass" name="admin_pass" minlength="10" required autocomplete="new-password"><div class="hint">কমপক্ষে ১০ অক্ষর — বড় হাতের, ছোট হাতের অক্ষর, সংখ্যা ও চিহ্ন (যেমন Shop@2026bd)</div></div>
    </div>

    <button type="submit"<?= $blocking ? ' disabled' : '' ?>>ইনস্টল করুন</button>
  </form>
<?php endif; ?>
</div>
</body>
</html>
