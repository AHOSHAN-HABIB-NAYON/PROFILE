<?php
// Copy to config.local.php (or use the web installer at /install).
return [
    'installed'   => true,
    'env'         => 'production',
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'probaho',
        'user' => 'probaho_user',
        'pass' => 'change-me',
        'charset' => 'utf8mb4',
    ],
    // Generate with: php -r "echo base64_encode(random_bytes(32));"
    'app_key'     => 'PASTE-A-RANDOM-BASE64-KEY',
    'base_url'    => '',
    'force_https' => true,
];
