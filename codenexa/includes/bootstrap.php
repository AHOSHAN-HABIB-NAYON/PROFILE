<?php
/**
 * Core bootstrap: config, database, session, i18n and helpers.
 * Compatible with PHP 7.4+.
 */
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('CONFIG_FILE', ROOT . '/config.php');
define('CACHE_DIR', ROOT . '/data/cache');
define('APP_VERSION', '1.0.0');

ini_set('display_errors', '0');
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE && PHP_SAPI !== 'cli') {
    session_name('cnx_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_start();
}

/* ---------------------------------------------------------------- config */

function is_installed(): bool
{
    return is_file(CONFIG_FILE);
}

function config(?string $key = null, $default = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = is_installed() ? (array) require CONFIG_FILE : [];
    }
    if ($key === null) {
        return $cfg;
    }
    return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
}

/* -------------------------------------------------------------- database */

function make_pdo(array $db): PDO
{
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    if (($db['driver'] ?? 'mysql') === 'sqlite') {
        $path = $db['path'];
        if ($path[0] !== '/' && !preg_match('~^[A-Za-z]:[\\\\/]~', $path)) {
            $path = ROOT . '/' . $path;
        }
        $pdo = new PDO('sqlite:' . $path, null, null, $opts);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        return $pdo;
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;charset=utf8mb4%s',
        $db['host'],
        (int) ($db['port'] ?: 3306),
        $db['name'] !== '' ? ';dbname=' . $db['name'] : ''
    );
    $opts[PDO::ATTR_EMULATE_PREPARES] = false;
    return new PDO($dsn, $db['user'], $db['pass'], $opts);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = make_pdo(config('db'));
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function setting(string $key, string $default = ''): string
{
    static $all = null;
    if ($all === null) {
        $all = [];
        foreach (rows('SELECT k, v FROM settings') as $r) {
            $all[$r['k']] = (string) $r['v'];
        }
    }
    return isset($all[$key]) && $all[$key] !== '' ? $all[$key] : $default;
}

/* ----------------------------------------------------------------- urls */

function base_path(): string
{
    return rtrim((string) config('base', '/'), '/') . '/';
}

function url(string $page = 'home', array $params = []): string
{
    $base = base_path();
    if ($page === 'home' && !$params) {
        return $base;
    }
    if (config('pretty', false)) {
        $path = $page;
        if ($page === 'service' && isset($params['slug'])) {
            $path .= '/' . rawurlencode($params['slug']);
            unset($params['slug']);
        }
        return $base . $path . ($params ? '?' . http_build_query($params) : '');
    }
    return $base . '?' . http_build_query(['p' => $page] + $params);
}

function asset(string $path): string
{
    $file = ROOT . '/assets/' . $path;
    $v = is_file($file) ? filemtime($file) : APP_VERSION;
    return base_path() . 'assets/' . $path . '?v=' . $v;
}

/* -------------------------------------------------------------- escaping */

function e($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function lines(string $text): array
{
    return array_values(array_filter(array_map('trim', preg_split('/\R/', $text))));
}

/* ----------------------------------------------------------------- i18n */

const LANGS = ['en' => 'English', 'bn' => 'বাংলা', 'hi' => 'हिन्दी'];

function lang(): string
{
    static $lang = null;
    if ($lang === null) {
        $l = $_GET['lang'] ?? $_COOKIE['lang'] ?? 'en';
        $lang = isset(LANGS[$l]) ? $l : 'en';
        if (isset($_GET['lang']) && PHP_SAPI !== 'cli') {
            setcookie('lang', $lang, ['expires' => time() + 31536000, 'path' => '/', 'samesite' => 'Lax']);
        }
    }
    return $lang;
}

function t(string $key, array $vars = []): string
{
    static $dict = [];
    $l = lang();
    if (!isset($dict[$l])) {
        $dict[$l] = require ROOT . '/lang/' . $l . '.php';
        if ($l !== 'en') {
            $dict[$l] += require ROOT . '/lang/en.php';
        }
    }
    $s = $dict[$l][$key] ?? $key;
    foreach ($vars as $k => $v) {
        $s = str_replace('{' . $k . '}', (string) $v, $s);
    }
    return $s;
}

/* ------------------------------------------------------------- security */

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_check(): bool
{
    $sent = $_POST['_csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    return is_string($sent) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $sent);
}

function is_ajax(): bool
{
    return ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch';
}

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function slugify(string $s): string
{
    $s = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $s), '-'));
    return $s !== '' ? $s : 'item-' . substr(bin2hex(random_bytes(3)), 0, 6);
}

/* ---------------------------------------------------------------- cache */

function cache_get(string $key): ?array
{
    if (!config('cache', true)) {
        return null;
    }
    $f = CACHE_DIR . '/' . $key . '.json';
    if (!is_file($f)) {
        return null;
    }
    $d = json_decode((string) file_get_contents($f), true);
    return is_array($d) ? $d : null;
}

function cache_put(string $key, array $data): void
{
    if (!config('cache', true) || !is_dir(CACHE_DIR) || !is_writable(CACHE_DIR)) {
        return;
    }
    $tmp = CACHE_DIR . '/' . $key . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE)) !== false) {
        @rename($tmp, CACHE_DIR . '/' . $key . '.json');
    }
}

function cache_clear(): void
{
    foreach (glob(CACHE_DIR . '/*.json') ?: [] as $f) {
        @unlink($f);
    }
}

/* ------------------------------------------------------------ analytics */

function track_visit(): void
{
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if ($ua === '' || preg_match('/bot|crawl|spider|slurp|preview|monitor/i', $ua)) {
        return;
    }
    try {
        $day = date('Y-m-d');
        if (q('UPDATE visits SET hits = hits + 1 WHERE day = ?', [$day])->rowCount() === 0) {
            q('INSERT INTO visits (day, hits) VALUES (?, 1)', [$day]);
        }
    } catch (Throwable $e) {
        // analytics must never break a page
    }
}
