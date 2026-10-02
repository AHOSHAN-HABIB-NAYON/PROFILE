<?php
// All secrets come from .env (never committed). See .env.example.
return [
    'installed'   => is_file(BASE_PATH . '/storage/installed.lock') && Env::get('DB_NAME') !== null,
    'debug'       => Env::get('APP_DEBUG', 'false') === 'true',
    'url'         => rtrim((string) Env::get('APP_URL', ''), '/'),
    'key'         => (string) Env::get('APP_KEY', ''),
    'timezone'    => 'Asia/Dhaka',
    'trust_proxy' => Env::get('TRUST_PROXY', 'false') === 'true',
    'db' => [
        'host'    => Env::get('DB_HOST', 'localhost'),
        'port'    => (int) Env::get('DB_PORT', '3306'),
        'name'    => Env::get('DB_NAME', ''),
        'user'    => Env::get('DB_USER', ''),
        'pass'    => Env::get('DB_PASS', ''),
        'charset' => 'utf8mb4',
    ],
    'session' => [
        'name'          => 'shop_sid',
        'admin_timeout' => 60 * 60 * 2, // 2 hours idle
    ],
    'upload' => [
        'max_bytes' => 10 * 1024 * 1024,
    ],
];
