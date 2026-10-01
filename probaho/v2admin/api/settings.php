<?php
/** /v2admin/api/settings/save — persists any field declared in admin_settings_schema(). */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
admin_api('settings');
if ($action !== 'save') {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
$page = (string) input('page', '');
$schema = admin_settings_schema()[$page] ?? null;
if (!$schema) {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
$in = (array) input('settings', []);
$remove = (array) input('remove', []);
$changed = [];
try {
    foreach ($schema as $fields) {
        foreach ($fields as $key => $def) {
            $type = $def[1];
            if ($type === 'image') {
                if (in_array($key, $remove, true)) {
                    Upload::delete((string) Settings::get($key));
                    Settings::set($key, '');
                    $changed[] = $key;
                }
                $err = $_FILES['files']['error'][$key] ?? UPLOAD_ERR_NO_FILE;
                if ($err !== UPLOAD_ERR_NO_FILE) {
                    $file = ['name' => $_FILES['files']['name'][$key], 'type' => $_FILES['files']['type'][$key], 'tmp_name' => $_FILES['files']['tmp_name'][$key], 'error' => $err, 'size' => $_FILES['files']['size'][$key]];
                    $img = Upload::image($file, 'branding', 5242880, $key === 'og_image' ? 1600 : 1024, false);
                    Upload::delete((string) Settings::get($key));
                    Settings::set($key, $img['path']);
                    $changed[] = $key;
                }
                continue;
            }
            if (!array_key_exists($key, $in)) {
                continue;
            }
            $v = is_string($in[$key]) ? trim($in[$key]) : '';
            if ($type === 'secret' && $v === '') {
                continue; // keep existing secret
            }
            if ($type === 'toggle') {
                $v = $v === '1' ? '1' : '0';
            } elseif ($type === 'number') {
                $v = is_numeric($v) ? (string) (0 + $v) : '0';
            } elseif ($type === 'color') {
                $v = preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? $v : '#5b4bff';
            } elseif ($type === 'select') {
                if (!array_key_exists($v, (array) $def[2])) {
                    continue;
                }
            } elseif (in_array($key, ['support.telegram_url', 'support.whatsapp_url'], true) && $v !== '' && !preg_match('~^https://~', $v)) {
                fail($def[0] . ' অবশ্যই https:// দিয়ে শুরু হতে হবে।');
            }
            Settings::set($key, $v);
            $changed[] = $key;
        }
    }
} catch (DomainException $e) {
    fail($e->getMessage());
}
// A theme/branding change must invalidate cached assets in browsers only via ?v=; nothing else to do.
AdminAuth::log('settings.save', $page, ['keys' => array_values(array_filter($changed, static fn ($k) => !in_array($k, Settings::SECRET_KEYS, true)))]);
ok(['reload' => true], 'সেটিংস সংরক্ষণ হয়েছে ✓');
