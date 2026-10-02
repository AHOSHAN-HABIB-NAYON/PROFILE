<?php
/**
 * One-time web installer (/install).
 *
 * Security: before anything is written, the installer creates
 * config/install-key.txt; the person installing must paste its contents,
 * proving they control the server's files. After success the installer
 * locks itself (storage/installed.lock) and /install returns 404.
 */
defined('APP') || exit;
require ROOT . '/database/seed.php';

send_security_headers();
start_session();
header('Cache-Control: no-store');

$keyFile = ROOT . '/config/install-key.txt';
if (!is_file($keyFile)) @file_put_contents($keyFile, strtoupper(bin2hex(random_bytes(6))) . "\n");
$installKey = is_file($keyFile) ? trim((string)file_get_contents($keyFile)) : '';

// ---------------------------------------------------------------- requirements
$req = [
    'PHP 8.1+' => version_compare(PHP_VERSION, '8.1.0', '>='),
    'PDO MySQL' => extension_loaded('pdo_mysql'),
    'mbstring' => extension_loaded('mbstring'),
    'GD (images)' => extension_loaded('gd'),
    'OpenSSL' => extension_loaded('openssl'),
    'cURL' => extension_loaded('curl'),
    'fileinfo' => extension_loaded('fileinfo'),
    'config/ writable' => is_writable(ROOT . '/config'),
    'storage/ writable' => is_writable(ROOT . '/storage'),
    'assets/uploads/ writable' => is_writable(ROOT . '/assets/uploads'),
];
$reqOk = !in_array(false, $req, true);

$errors = [];
$done = false;
$old = $_POST;
$val = fn(string $k, string $d = '') => e(isset($old[$k]) ? (string)$old[$k] : $d);

if (is_post()) {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_POST['_token'] ?? ''))) $errors[] = 'Session expired — please submit again.';
    if (!$installKey || !hash_equals($installKey, strtoupper(trim((string)($_POST['install_key'] ?? ''))))) $errors[] = 'Install key does not match config/install-key.txt.';
    if (!$reqOk) $errors[] = 'Fix the server requirements first.';
    $db = ['host' => trim((string)($_POST['db_host'] ?? 'localhost')), 'port' => (int)($_POST['db_port'] ?? 3306) ?: 3306, 'name' => trim((string)($_POST['db_name'] ?? '')),
        'user' => trim((string)($_POST['db_user'] ?? '')), 'pass' => (string)($_POST['db_pass'] ?? '')];
    $siteName = trim((string)($_POST['site_name'] ?? ''));
    $siteUrl = rtrim(trim((string)($_POST['site_url'] ?? '')), '/');
    $lang = in_array($_POST['lang'] ?? '', ['bn', 'en'], true) ? $_POST['lang'] : 'bn';
    $tz = in_array($_POST['timezone'] ?? '', timezone_identifiers_list(), true) ? $_POST['timezone'] : 'Asia/Dhaka';
    $aName = trim((string)($_POST['admin_name'] ?? ''));
    $aEmail = mb_strtolower(trim((string)($_POST['admin_email'] ?? '')));
    $aPass = (string)($_POST['admin_pass'] ?? '');
    if ($db['name'] === '' || $db['user'] === '') $errors[] = 'Database name and user are required.';
    if ($siteName === '') $errors[] = 'Site name is required.';
    if (!preg_match('~^https?://[^\s/]+(/[^\s]*)?$~', $siteUrl)) $errors[] = 'Site URL must look like https://example.com';
    if (mb_strlen($aName) < 2) $errors[] = 'Admin name is required.';
    if (!filter_var($aEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'Admin email is invalid.';
    if (mb_strlen($aPass) < 10 || !preg_match('~\d~', $aPass) || !preg_match('~\p{L}~u', $aPass)) $errors[] = 'Admin password: at least 10 characters with letters and numbers.';

    if (!$errors) {
        try {
            $pdo = db_connect($db['host'], $db['name'], $db['user'], $db['pass'], $db['port']);
            if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'")->fetchColumn()) {
                throw new RuntimeException('This database already contains an installation (table "users" exists). Use an empty database.');
            }
            $pdo->exec("ALTER DATABASE `" . str_replace('`', '', $db['name']) . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $sql = preg_replace('~^\s*--.*$~m', '', (string)file_get_contents(ROOT . '/database/schema.sql'));
            foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) $pdo->exec($stmt);

            $appKey = random_bytes(32);
            $enc = fn(string $plain): string => encrypt_with_key($plain, $appKey);
            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO users (name, email, password_hash, role, email_verified_at, lang) VALUES (?, ?, ?, "admin", NOW(), ?)')
                ->execute([$aName, $aEmail, password_hash($aPass, PASSWORD_BCRYPT, ['cost' => 12]), $lang]);
            $adminId = (int)$pdo->lastInsertId();
            $pdo->prepare('INSERT INTO user_security (user_id, password_changed_at) VALUES (?, NOW())')->execute([$adminId]);

            // Web Push keys so push works out of the box
            $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
            openssl_pkey_export($k, $vapidPriv);
            $d = openssl_pkey_get_details($k)['ec'];
            $vapidPub = b64url_encode("\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT));

            seed_database($pdo, ['admin_id' => $adminId, 'base_path' => (string)parse_url($siteUrl, PHP_URL_PATH), 'settings' => [
                'site_name' => [$siteName, 'general'], 'default_language' => [$lang, 'general'], 'pwa.name' => [$siteName, 'pwa'],
                'pwa.short_name' => [mb_substr($siteName, 0, 12), 'pwa'], 'contact.email' => [$aEmail, 'contact'], 'smtp.admin_email' => [$aEmail, 'smtp'],
                'smtp.from_name' => [$siteName, 'smtp'], 'pwa.vapid_public' => [$vapidPub, 'pwa'], 'pwa.vapid_private' => [$enc($vapidPriv), 'pwa'],
                'pwa.vapid_subject' => ['mailto:' . $aEmail, 'pwa'], 'content_version' => [(string)time(), 'system'], 'installed_at' => [date('c'), 'system'],
            ]]);
            $pdo->commit();

            $env = [
                'db_host' => $db['host'], 'db_port' => $db['port'], 'db_name' => $db['name'], 'db_user' => $db['user'], 'db_pass' => $db['pass'],
                'base_url' => $siteUrl, 'timezone' => $tz, 'app_key' => base64_encode($appKey), 'behind_cloudflare' => false,
            ];
            $php = "<?php\n// Generated by the installer on " . date('c') . ". Keep this file private.\ndefined('APP') || exit;\nreturn " . var_export($env, true) . ";\n";
            if (file_put_contents(ROOT . '/config/env.php', $php, LOCK_EX) === false) throw new RuntimeException('Could not write config/env.php');
            @chmod(ROOT . '/config/env.php', 0640);
            file_put_contents(ROOT . '/storage/installed.lock', date('c'));
            @unlink($keyFile);
            foreach (glob(ROOT . '/storage/cache/*') ?: [] as $f) @unlink($f);
            $done = true;
        } catch (Throwable $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            log_error($e);
            $msg = $e->getMessage();
            if ($e instanceof PDOException) $msg = 'Database error: ' . preg_replace('~\(.*?\)~', '', $msg);
            $errors[] = $msg;
        }
    }
}
$_SESSION['csrf'] ??= b64url_encode(random_bytes(32));
$detected = BASE_URL;
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Install</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap">
<style>
:root{--p:#3045d8;--bg:#f5f7fc;--card:#fff;--t:#13203a;--m:#69758b;--b:#e5e9f2}
*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans","Noto Sans Bengali",system-ui,sans-serif;background:var(--bg);color:var(--t);line-height:1.6}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px 60px}
.head{display:flex;gap:14px;align-items:center;margin-bottom:18px}.logo{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#3045d8,#7b61ff);color:#fff;display:grid;place-items:center;font-weight:800}
h1{font-size:1.4rem;margin:0}h2{font-size:1rem;margin:0 0 12px}
.card{background:var(--card);border:1px solid var(--b);border-radius:18px;padding:20px;margin-bottom:14px}
.grid{display:grid;gap:12px;grid-template-columns:1fr}@media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
label{display:block;font-size:.84rem;font-weight:600;margin-bottom:5px}
input,select{width:100%;height:46px;border:1px solid var(--b);border-radius:12px;padding:0 13px;font:inherit;background:#fff}
input:focus,select:focus{outline:none;border-color:var(--p);box-shadow:0 0 0 4px rgba(48,69,216,.12)}
.hint{font-size:.78rem;color:var(--m);margin-top:4px}
.req{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:.88rem}.ok{color:#20b67a}.bad{color:#ef5350}
.err{background:#fdecec;border:1px solid #f5c2c2;color:#9b1c1c;border-radius:12px;padding:12px 14px;margin-bottom:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:50px;padding:0 24px;border:0;border-radius:14px;background:var(--p);color:#fff;font:inherit;font-weight:700;cursor:pointer;width:100%;text-decoration:none}
code{background:#eef1fa;padding:2px 6px;border-radius:6px}
</style></head><body><div class="wrap">
<div class="head"><div class="logo">&lt;/&gt;</div><div><h1>Install your platform</h1><div class="hint">ইনস্টলেশন — শুধুমাত্র একবার চালানো হবে</div></div></div>
<?php if ($done): ?>
  <div class="card"><h2>🎉 Installation complete</h2>
    <p>Your site is ready. The installer is now locked.</p>
    <ul><li>Log in with <b><?= e($aEmail) ?></b></li><li>Configure <b>SMTP</b>, <b>payment methods</b>, <b>Google login</b> and <b>AI</b> in Admin → Settings.</li><li>Add the cron job shown in Admin → Security & Audit.</li></ul>
    <a class="btn" href="<?= e(rtrim($siteUrl, '/') . '/login?next=/admin') ?>">Go to admin login</a></div>
<?php else: ?>
  <?php if ($errors): ?><div class="err"><b>Please fix:</b><ul style="margin:6px 0 0"><?php foreach ($errors as $er): ?><li><?= e($er) ?></li><?php endforeach ?></ul></div><?php endif ?>
  <div class="card"><h2>1. Server requirements</h2><div class="req"><?php foreach ($req as $k => $ok): ?><span><?= e($k) ?></span><b class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✓ OK' : '✗ Missing' ?></b><?php endforeach ?></div></div>
  <form method="post" autocomplete="off">
    <input type="hidden" name="_token" value="<?= e($_SESSION['csrf']) ?>">
    <div class="card"><h2>2. Verify ownership</h2>
      <label for="ik">Install key</label><input id="ik" name="install_key" required value="<?= $val('install_key') ?>" placeholder="XXXXXXXXXXXX">
      <p class="hint">Open <code>config/install-key.txt</code> in your hosting File Manager and paste the code. This stops anyone else from installing on your server.</p></div>
    <div class="card"><h2>3. MySQL database</h2><p class="hint" style="margin-top:-6px">Create an empty database (utf8mb4) and user in your hosting panel first.</p><div class="grid">
      <div><label>Host</label><input name="db_host" required value="<?= $val('db_host', 'localhost') ?>"></div>
      <div><label>Port</label><input name="db_port" type="number" value="<?= $val('db_port', '3306') ?>"></div>
      <div><label>Database name</label><input name="db_name" required value="<?= $val('db_name') ?>"></div>
      <div><label>Username</label><input name="db_user" required value="<?= $val('db_user') ?>"></div>
      <div><label>Password</label><input name="db_pass" type="password" value=""></div>
    </div></div>
    <div class="card"><h2>4. Website</h2><div class="grid">
      <div><label>Site name</label><input name="site_name" required value="<?= $val('site_name') ?>"></div>
      <div><label>Site URL</label><input name="site_url" required value="<?= $val('site_url', $detected) ?>"><p class="hint">Use https:// in production.</p></div>
      <div><label>Default language</label><select name="lang"><option value="bn">বাংলা</option><option value="en" <?= ($old['lang'] ?? '') === 'en' ? 'selected' : '' ?>>English</option></select></div>
      <div><label>Timezone</label><input name="timezone" value="<?= $val('timezone', 'Asia/Dhaka') ?>"></div>
    </div></div>
    <div class="card"><h2>5. Administrator account</h2><div class="grid">
      <div><label>Name</label><input name="admin_name" required value="<?= $val('admin_name') ?>"></div>
      <div><label>Email</label><input name="admin_email" type="email" required value="<?= $val('admin_email') ?>"></div>
      <div><label>Password</label><input name="admin_pass" type="password" required minlength="10" autocomplete="new-password"><p class="hint">10+ characters, letters and numbers.</p></div>
    </div></div>
    <button class="btn" type="submit" <?= $reqOk ? '' : 'disabled' ?>>Install now</button>
  </form>
<?php endif ?>
</div></body></html>
