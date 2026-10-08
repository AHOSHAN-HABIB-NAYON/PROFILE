<?php
declare(strict_types=1);

// Shared setup for every page and API request.

const APP_ROOT = __DIR__ . '/..';

$configFile = APP_ROOT . '/config.php';
if (!is_file($configFile)) {
    // Not set up yet: pages go to the setup wizard, API calls get a JSON error.
    if (defined('JOMA_API')) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        exit('{"error":{"code":"setup_required","message":"ওয়েবসাইট এখনো সেটআপ করা হয়নি।"}}');
    }
    header('Location: install.php');
    exit;
}

$GLOBALS['config'] = require $configFile;

require __DIR__ . '/Http.php';
require __DIR__ . '/Db.php';
require __DIR__ . '/Auth.php';
require __DIR__ . '/Cbor.php';
require __DIR__ . '/Crypto.php';
require __DIR__ . '/WebAuthn.php';
require __DIR__ . '/GoogleAuth.php';
require __DIR__ . '/Wallet.php';

date_default_timezone_set('Asia/Dhaka');

function config(string $key, mixed $default = null): mixed
{
    $value = $GLOBALS['config'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function e(?string $text): string
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Security headers shared by the HTML pages. */
function send_page_headers(): void
{
    header("Content-Security-Policy: default-src 'self'; "
        . "script-src 'self' https://accounts.google.com/gsi/client; "
        . "frame-src https://accounts.google.com/gsi/; "
        . "connect-src 'self' https://accounts.google.com/gsi/; "
        . "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; "
        . "img-src 'self' data: https://*.googleusercontent.com; "
        . "font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    // Google's sign-in popup needs to talk back to this page.
    header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
}

/** Versioned asset URL, so browsers pick up changed files. */
function asset(string $path): string
{
    $file = APP_ROOT . '/assets/' . $path;
    $version = is_file($file) ? (string) filemtime($file) : '1';
    return 'assets/' . $path . '?v=' . $version;
}

/** Whole taka in Bengali digits with lakh grouping: 50000 → "৫০,০০০". */
function bn_taka(int|float $amount): string
{
    $digits = (string) (int) $amount;
    $last3 = substr($digits, -3);
    $rest = substr($digits, 0, -3);
    $grouped = $rest !== '' ? preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest) . ',' . $last3 : $last3;
    return strtr($grouped, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪',
        '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
}
