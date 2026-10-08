<?php
declare(strict_types=1);

/**
 * One-time setup wizard. Asks for the database details, creates the database
 * (when the account is allowed to) and all tables, then writes config.php.
 * Once config.php exists this page refuses to run again.
 */

const ROOT = __DIR__;
$configFile = ROOT . '/config.php';

function h(?string $text): string
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");
header('Cache-Control: no-store');

session_name('joma_install');
session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Strict']);
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

$installed = is_file($configFile);

// --------------------------------------------------------------- requirements

$checks = [
    'PHP 8.1 বা নতুন (এখন ' . PHP_VERSION . ')' => version_compare(PHP_VERSION, '8.1.0', '>='),
    'PDO MySQL এক্সটেনশন' => extension_loaded('pdo_mysql'),
    'OpenSSL এক্সটেনশন' => extension_loaded('openssl'),
    'cURL এক্সটেনশন' => extension_loaded('curl'),
    'mbstring এক্সটেনশন' => extension_loaded('mbstring'),
    'ফোল্ডারে ফাইল লেখার অনুমতি' => is_writable(ROOT),
];
$ready = !in_array(false, $checks, true);

// The address the site is being opened at, as the default base URL.
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
$host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
$path = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
$detectedUrl = ($https ? 'https://' : 'http://') . $host . $path;

$form = [
    'base_url' => $detectedUrl,
    'db_host' => 'localhost',
    'db_port' => '3306',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    'google_client_id' => '',
];
$error = null;
$done = false;
$manualConfig = null;

// ---------------------------------------------------------------------- setup

if (!$installed && $ready && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    foreach ($form as $key => $default) {
        $form[$key] = trim((string) ($_POST[$key] ?? ''));
    }
    try {
        if (!hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) {
            throw new RuntimeException('ফর্মের মেয়াদ শেষ হয়ে গেছে। পেজটি আবার খুলে চেষ্টা করুন।');
        }
        $config = install($form);
        $php = configFile($config);
        if (@file_put_contents($configFile, $php, LOCK_EX) === false) {
            $manualConfig = $php; // Show it so it can be saved by hand.
        } else {
            @chmod($configFile, 0640);
        }
        $done = true;
        unset($_SESSION['csrf']);
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

/** Connects, creates the database if needed, creates the tables and returns the config. */
function install(array $form): array
{
    $baseUrl = rtrim($form['base_url'], '/');
    if (!preg_match('#^https?://[^/\s]+(/[^\s]*)?$#', $baseUrl)) {
        throw new RuntimeException('ওয়েবসাইটের ঠিকানা সঠিক নয়। যেমন: https://example.com');
    }
    foreach (['db_host' => 'ডেটাবেস হোস্ট', 'db_name' => 'ডেটাবেসের নাম', 'db_user' => 'ডেটাবেস ইউজার'] as $key => $label) {
        if ($form[$key] === '') {
            throw new RuntimeException("{$label} দিন।");
        }
    }
    if (!preg_match('/^[A-Za-z0-9_\-$]{1,64}$/', $form['db_name'])) {
        throw new RuntimeException('ডেটাবেসের নামে শুধু ইংরেজি অক্ষর, সংখ্যা আর _ থাকতে পারে।');
    }
    $port = (int) ($form['db_port'] ?: 3306);

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 10,
    ];
    try {
        $pdo = new PDO("mysql:host={$form['db_host']};port={$port};charset=utf8mb4", $form['db_user'], $form['db_pass'], $options);
    } catch (PDOException $e) {
        throw new RuntimeException('ডেটাবেসে ঢোকা যায়নি। ইউজার নাম, পাসওয়ার্ড আর হোস্ট আবার দেখুন। (' . dbReason($e) . ')');
    }

    // Create the database when the account may; shared hosting usually makes
    // you create it in the control panel first, which is fine too.
    $quoted = '`' . str_replace('`', '``', $form['db_name']) . '`';
    try {
        $pdo->exec("CREATE DATABASE IF NOT EXISTS {$quoted} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    } catch (PDOException) {
        // No permission to create databases; it must already exist.
    }
    try {
        $pdo->exec("USE {$quoted}");
    } catch (PDOException $e) {
        throw new RuntimeException("'{$form['db_name']}' ডেটাবেসটি পাওয়া যায়নি, আর এই ইউজারের নতুন ডেটাবেস বানানোর অনুমতি নেই। "
            . 'hPanel → Databases থেকে ডেটাবেস তৈরি করে সেই নাম দিন।');
    }

    $schema = (string) file_get_contents(ROOT . '/database/schema.sql');
    $schema = preg_replace('/^\s*--.*$/m', '', $schema);
    try {
        foreach (preg_split('/;\s*(\r?\n|$)/', $schema) as $statement) {
            if (trim($statement) !== '') {
                $pdo->exec($statement);
            }
        }
    } catch (PDOException $e) {
        throw new RuntimeException('টেবিল তৈরি করা যায়নি: ' . dbReason($e));
    }

    $config = require ROOT . '/config.sample.php';
    $config['base_url'] = $baseUrl;
    $config['db'] = [
        'host' => $form['db_host'],
        'port' => $port,
        'name' => $form['db_name'],
        'user' => $form['db_user'],
        'pass' => $form['db_pass'],
    ];
    $config['google_client_id'] = $form['google_client_id'];
    $config['webauthn']['rp_id'] = (string) parse_url($baseUrl, PHP_URL_HOST);
    return $config;
}

function dbReason(PDOException $e): string
{
    $info = $e->errorInfo[1] ?? $e->getCode();
    return match ((int) $info) {
        1045 => 'ইউজার নাম বা পাসওয়ার্ড ভুল',
        1044 => 'এই ইউজারের ডেটাবেসটিতে অনুমতি নেই',
        2002, 2005 => 'ডেটাবেস সার্ভার পাওয়া যায়নি',
        default => 'কোড ' . $info,
    };
}

function configFile(array $config): string
{
    return "<?php\n// Written by install.php on " . date('Y-m-d H:i') . ".\n"
        . "// Holds the database password: never share or publish this file.\n"
        . "// To run setup again, delete this file and open install.php.\n\n"
        . 'return ' . var_export($config, true) . ";\n";
}

$appName = 'জমা ওয়ালেট';
?><!doctype html>
<html lang="bn">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title><?= h($appName) ?> — সেটআপ</title>
    <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body class="auth-page">
<main class="setup">
    <header class="setup-head">
        <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48"><rect x="4" y="11" width="40" height="30" rx="7" fill="currentColor" opacity=".25"/><rect x="4" y="7" width="34" height="30" rx="7" fill="currentColor"/><circle cx="31" cy="22" r="4" fill="#0B6E4F"/></svg>
        </span>
        <div>
            <h1><?= h($appName) ?> সেটআপ</h1>
            <p class="muted">ডেটাবেসের তথ্য দিন — বাকি সব নিজে থেকেই তৈরি হবে।</p>
        </div>
    </header>

    <section class="auth-card">
        <?php if ($installed && !$done): ?>
            <h2>সেটআপ আগেই করা হয়েছে ✓</h2>
            <p class="muted">নিরাপত্তার জন্য এই পেজ আর কাজ করবে না। আবার সেটআপ করতে চাইলে File Manager থেকে <code>config.php</code> মুছে এই পেজ খুলুন।</p>
            <a class="btn btn-primary btn-block" href="index.php">ওয়েবসাইটে যান</a>

        <?php elseif ($done): ?>
            <h2>সেটআপ সম্পন্ন হয়েছে 🎉</h2>
            <p>ডেটাবেস আর সব টেবিল তৈরি হয়েছে।</p>
            <?php if ($manualConfig !== null): ?>
                <p class="form-error">সার্ভার <code>config.php</code> লিখতে দেয়নি। File Manager-এ <code>config.php</code> নামে একটি ফাইল বানিয়ে নিচের লেখাটুকু হুবহু পেস্ট করুন:</p>
                <textarea class="config-box" readonly rows="14"><?= h($manualConfig) ?></textarea>
            <?php else: ?>
                <p class="muted"><code>config.php</code> সেভ হয়েছে। এই সেটআপ পেজ এখন থেকে বন্ধ থাকবে।</p>
            <?php endif; ?>
            <a class="btn btn-primary btn-block" href="index.php">ওয়েবসাইট খুলুন</a>

        <?php else: ?>
            <ul class="checks" aria-label="সার্ভারের প্রয়োজনীয়তা">
                <?php foreach ($checks as $label => $ok): ?>
                    <li class="<?= $ok ? 'ok' : 'bad' ?>"><span aria-hidden="true"><?= $ok ? '✓' : '✕' ?></span> <?= h($label) ?></li>
                <?php endforeach; ?>
            </ul>
            <?php if (!$ready): ?>
                <p class="form-error">উপরের লাল চিহ্ন দেওয়া জিনিসগুলো ঠিক না করা পর্যন্ত সেটআপ চলবে না। hPanel → Advanced → PHP Configuration থেকে PHP 8.1+ বেছে নিন।</p>
            <?php elseif (!$https && !in_array(parse_url($detectedUrl, PHP_URL_HOST), ['localhost', '127.0.0.1'], true)): ?>
                <p class="form-error">সাইটটি HTTPS ছাড়া খোলা হয়েছে। পাসকি আর Google লগইনের জন্য hPanel → Security → SSL চালু করে <strong>https://</strong> দিয়ে খুলুন।</p>
            <?php endif; ?>

            <?php if ($ready): ?>
            <form class="form" method="post" action="install.php" autocomplete="off">
                <input type="hidden" name="csrf" value="<?= h($_SESSION['csrf']) ?>">
                <label class="field">
                    <span>ওয়েবসাইটের ঠিকানা</span>
                    <input type="url" name="base_url" value="<?= h($form['base_url']) ?>" required>
                    <small>নিজে থেকে বসানো হয়েছে; সাধারণত বদলাতে হয় না।</small>
                </label>
                <fieldset class="setup-group">
                    <legend>ডেটাবেস (hPanel → Databases → MySQL Databases)</legend>
                    <label class="field">
                        <span>ডেটাবেসের নাম</span>
                        <input type="text" name="db_name" value="<?= h($form['db_name']) ?>" required placeholder="u123456789_joma">
                        <small>না থাকলে এই নামে নতুন ডেটাবেস বানানোর চেষ্টা করা হবে।</small>
                    </label>
                    <label class="field">
                        <span>ডেটাবেস ইউজার</span>
                        <input type="text" name="db_user" value="<?= h($form['db_user']) ?>" required placeholder="u123456789_joma">
                    </label>
                    <label class="field">
                        <span>ডেটাবেস পাসওয়ার্ড</span>
                        <input type="password" name="db_pass" value="" autocomplete="new-password">
                    </label>
                    <div class="setup-row">
                        <label class="field">
                            <span>হোস্ট</span>
                            <input type="text" name="db_host" value="<?= h($form['db_host']) ?>" required>
                        </label>
                        <label class="field">
                            <span>পোর্ট</span>
                            <input type="text" name="db_port" value="<?= h($form['db_port']) ?>" inputmode="numeric">
                        </label>
                    </div>
                </fieldset>
                <label class="field">
                    <span>Google Web Client ID (ঐচ্ছিক)</span>
                    <input type="text" name="google_client_id" value="<?= h($form['google_client_id']) ?>" placeholder="....apps.googleusercontent.com">
                    <small>এখন খালি রাখতে পারেন; পরে config.php-তে বসানো যাবে।</small>
                </label>
                <?php if ($error !== null): ?>
                    <p class="form-error" role="alert"><?= h($error) ?></p>
                <?php endif; ?>
                <button type="submit" class="btn btn-primary btn-block">ডেটাবেস তৈরি করে সেটআপ করুন</button>
            </form>
            <?php endif; ?>
        <?php endif; ?>
    </section>
</main>
</body>
</html>
