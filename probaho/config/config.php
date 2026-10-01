<?php
/**
 * Base configuration. Do not put secrets here — the installer writes them to
 * config/config.local.php, which overrides any key below and is git-ignored.
 */
return array_replace([
    'installed'   => false,
    'env'         => 'production',   // production | development
    'db' => [
        'host'    => 'localhost',
        'port'    => 3306,
        'name'    => '',
        'user'    => '',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
    // 32+ random bytes (base64) used to encrypt stored secrets & sign tokens.
    'app_key'     => '',
    // Optional absolute base URL, e.g. https://pay.example.com (auto-detected when empty).
    'base_url'    => '',
    'force_https' => false,
], is_file(__DIR__ . '/config.local.php') ? (require __DIR__ . '/config.local.php') : []);
