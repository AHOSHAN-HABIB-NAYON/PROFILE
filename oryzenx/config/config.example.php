<?php
// Copy to config/config.php (the web installer writes it for you) and keep it OUTSIDE the web root.
// Never commit config.php: it is listed in .gitignore. Values below are placeholders only.
return [
    'installed' => false,
    'version' => '1.0.0',
    'app_url' => 'https://bd.oryzenx.com',   // public base URL, no trailing slash
    'base_path' => '',                        // '' when served from the domain root
    'app_key' => 'CHANGE_ME_base64_32_random_bytes', // generate: php -r "echo base64_encode(random_bytes(32));"
    'debug' => false,                         // never true in production
    'demo_mode' => false,                     // true only for demos: allows demo seed data + simulated prices
    'trust_proxy' => false,                   // true only behind a trusted reverse proxy/CDN setting X-Forwarded-*
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'oryzenx',
        'user' => 'oryzenx',
        'pass' => 'CHANGE_ME',
    ],
    'mail' => [
        'driver' => 'smtp',                   // 'smtp' (production) or 'log' (development: writes to storage/mail)
    ],
    'storage_path' => null,                   // optional absolute path to a storage dir outside the web root
];
