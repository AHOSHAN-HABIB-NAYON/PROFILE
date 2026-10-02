<?php
/**
 * Bangla / English translations.
 * Strings live in core/lang/{bn,en}.php. Content rows carry *_en / *_bn
 * columns, picked with loc().
 */
defined('APP') || exit;

const LANGS = ['bn' => 'বাংলা', 'en' => 'English'];

function lang(): string
{
    static $lang = null;
    if ($lang !== null) return $lang;
    $c = $_COOKIE['lang'] ?? '';
    if (isset(LANGS[$c])) return $lang = $c;
    $def = INSTALLED ? (string)setting('default_language', 'bn') : 'en';
    return $lang = isset(LANGS[$def]) ? $def : 'bn';
}

function set_lang(string $l): void
{
    if (!isset(LANGS[$l])) return;
    setcookie('lang', $l, ['expires' => time() + 31536000, 'path' => BASE_PATH . '/', 'secure' => IS_HTTPS, 'httponly' => false, 'samesite' => 'Lax']);
    $_COOKIE['lang'] = $l;
}

function lang_strings(string $l): array
{
    static $cache = [];
    return $cache[$l] ??= (require ROOT . '/core/lang/' . $l . '.php');
}

/** Translate a key, replacing {placeholders}. */
function t(string $key, array $vars = [], ?string $l = null): string
{
    $l ??= lang();
    $s = lang_strings($l)[$key] ?? lang_strings('en')[$key] ?? $key;
    foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
    return $s;
}

/** Pick the localized column of a DB row, falling back to the other language. */
function loc(?array $row, string $field, ?string $l = null): string
{
    if (!$row) return '';
    $l ??= lang();
    $other = $l === 'bn' ? 'en' : 'bn';
    $v = trim((string)($row[$field . '_' . $l] ?? ''));
    return $v !== '' ? $v : trim((string)($row[$field . '_' . $other] ?? ''));
}
