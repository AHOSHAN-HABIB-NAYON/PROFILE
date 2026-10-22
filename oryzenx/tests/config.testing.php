<?php
// Test configuration. Uses a dedicated database (default oryzenx_test). Override with env vars in CI.
return [
    'installed' => true,
    'app_url' => 'https://test.oryzenx.local',
    'base_path' => '',
    'app_key' => base64_encode(str_repeat('k', 32)),
    'debug' => true,
    'demo_mode' => true,
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('DB_PORT') ?: 3306),
        'name' => getenv('DB_NAME') ?: 'oryzenx_test',
        'user' => getenv('DB_USER') ?: 'oryzenx',
        'pass' => getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'devpass',
    ],
    'mail' => ['driver' => 'log'],
    'storage_path' => sys_get_temp_dir() . '/oryzenx-test-storage',
];
