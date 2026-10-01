<?php
/** /v2admin/api/crud/* — save, delete, toggle for declarative resources. */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
$resources = admin_resources();
$key = (string) input('resource', '');
if (!isset($resources[$key])) {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
$res = $resources[$key];
admin_api($res['ability']);
$table = $res['table'];

switch ($action) {
    case 'save':
        $id = input_int('id');
        $row = $id ? db()->row("SELECT * FROM `$table` WHERE id = ?", [$id]) : null;
        if ($id && !$row) {
            fail('পাওয়া যায়নি।', 404);
        }
        $in = (array) input('data', []);
        $data = [];
        try {
            foreach ($res['fields'] as $name => $f) {
                $v = $in[$name] ?? null;
                switch ($f['type']) {
                    case 'readonly':
                        continue 2;
                    case 'toggle':
                        $data[$name] = (string) $v === '1' ? 1 : 0;
                        break;
                    case 'number':
                        $data[$name] = (int) $v;
                        break;
                    case 'money':
                        $data[$name] = round((float) $v, 2);
                        break;
                    case 'date':
                        $data[$name] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? $v : null;
                        break;
                    case 'select':
                        $v = (string) $v;
                        if (!array_key_exists($v, $f['options'])) {
                            $v = (string) array_key_first($f['options']);
                        }
                        $data[$name] = ($v === '' && !empty($f['nullable'])) ? null : $v;
                        break;
                    case 'color':
                        $data[$name] = preg_match('/^#[0-9a-fA-F]{6}$/', (string) $v) ? $v : '#5b4bff';
                        break;
                    case 'image':
                        $files = $_FILES['files']['name'][$name] ?? null;
                        if (in_array($name, (array) input('remove', []), true)) {
                            Upload::delete($row[$name] ?? null);
                            $data[$name] = null;
                        }
                        if ($files) {
                            $file = ['name' => $_FILES['files']['name'][$name], 'type' => $_FILES['files']['type'][$name], 'tmp_name' => $_FILES['files']['tmp_name'][$name], 'error' => $_FILES['files']['error'][$name], 'size' => $_FILES['files']['size'][$name]];
                            if ($file['error'] !== UPLOAD_ERR_NO_FILE) {
                                $img = Upload::image($file, $f['folder'] ?? 'misc');
                                Upload::delete($row[$name] ?? null);
                                $data[$name] = $img['path'];
                            }
                        }
                        break;
                    case 'icon':
                        $data[$name] = mb_substr(trim((string) $v), 0, 255) ?: 'grid';
                        $files = $_FILES['files']['name'][$name] ?? null;
                        if ($files && $_FILES['files']['error'][$name] !== UPLOAD_ERR_NO_FILE) {
                            $file = ['name' => $_FILES['files']['name'][$name], 'type' => $_FILES['files']['type'][$name], 'tmp_name' => $_FILES['files']['tmp_name'][$name], 'error' => $_FILES['files']['error'][$name], 'size' => $_FILES['files']['size'][$name]];
                            $img = Upload::image($file, $f['folder'] ?? 'icons', 2097152, 256, false);
                            $data[$name] = $img['path'];
                        }
                        break;
                    case 'gallery':
                        $current = array_values(array_filter((array) json_decode((string) ($row[$name] ?? '[]'), true)));
                        $remove = (array) input('gallery_remove', []);
                        foreach ($remove as $r) {
                            if (in_array($r, $current, true)) {
                                Upload::delete($r);
                            }
                        }
                        $current = array_values(array_diff($current, $remove));
                        foreach (array_slice(Upload::files('gallery'), 0, 12) as $file) {
                            $current[] = Upload::image($file, $f['folder'] ?? 'gallery')['path'];
                        }
                        $data[$name] = json_encode(array_slice($current, 0, 20), JSON_UNESCAPED_SLASHES);
                        break;
                    case 'slug':
                        $base = trim((string) $v) !== '' ? (string) $v : (string) ($in[$f['from']] ?? '');
                        if ($base === '' && !empty($in['title_bn'])) {
                            $base = (string) $in['title_bn'];
                        }
                        $slug = $key === 'payment-methods' ? str_replace('-', '_', slugify($base)) : slugify($base);
                        $n = 1;
                        $try = $slug;
                        while (db()->val("SELECT 1 FROM `$table` WHERE `$name` = ? AND id <> ?", [$try, $id])) {
                            $try = $slug . '-' . (++$n);
                        }
                        if ($key === 'payment-methods' && $row && in_array($row[$name], ['binance_pay', 'qr'], true)) {
                            $try = $row[$name];
                        }
                        $data[$name] = $try;
                        break;
                    default:
                        $v = trim((string) $v);
                        if (isset($f['max'])) {
                            $v = mb_substr($v, 0, (int) $f['max']);
                        }
                        $data[$name] = $v === '' && empty($f['required']) ? ($f['type'] === 'textarea' ? '' : null) : $v;
                }
                if (!empty($f['required']) && (($data[$name] ?? '') === '' || $data[$name] === null)) {
                    fail($f['label'] . ' আবশ্যক।');
                }
            }
        } catch (DomainException $e) {
            fail($e->getMessage());
        }
        if ($key === 'products' && ($data['status'] ?? '') === 'published' && empty($row['published_at'])) {
            $data['published_at'] = now();
        }
        if ($row) {
            db()->update($table, $data, 'id = ?', [$id]);
        } else {
            $id = db()->insert($table, $data);
        }
        AdminAuth::log($key . '.save', (string) $id);
        $msg = 'সংরক্ষণ হয়েছে ✓';
        if ($key === 'products') {
            $stats = admin_product_published($id);
            if ($stats) {
                $msg .= ' · নোটিফিকেশন: ' . $stats['recipients'] . ' জন' . ($stats['push_sent'] ? ', পুশ ' . $stats['push_sent'] : '') . ($stats['emails'] ? ', ইমেইল ' . $stats['emails'] : '');
            }
        }
        ok(['redirect' => url('/v2admin/' . $key . '/' . $id)], $msg);
        break;

    case 'delete':
        if (!empty($res['nodelete'])) {
            fail('এটি মুছে ফেলা যায় না।');
        }
        $id = input_int('id');
        $row = db()->row("SELECT * FROM `$table` WHERE id = ?", [$id]);
        if (!$row) {
            fail('পাওয়া যায়নি।', 404);
        }
        if ($key === 'payment-methods' && in_array($row['code'], ['binance_pay', 'qr'], true)) {
            fail('সিস্টেম মেথড মুছে ফেলা যায় না — বন্ধ করে রাখুন।');
        }
        foreach ($res['fields'] as $name => $f) {
            if ($f['type'] === 'image') {
                Upload::delete($row[$name] ?? null);
            } elseif ($f['type'] === 'gallery') {
                foreach ((array) json_decode((string) ($row[$name] ?? '[]'), true) as $g) {
                    Upload::delete($g);
                }
            }
        }
        db()->q("DELETE FROM `$table` WHERE id = ?", [$id]);
        AdminAuth::log($key . '.delete', (string) $id);
        ok(['redirect' => url('/v2admin/' . $key)], 'মুছে ফেলা হয়েছে');
        break;

    case 'toggle':
        $field = (string) input('field', '');
        if (($res['fields'][$field]['type'] ?? '') !== 'toggle') {
            fail('অনুরোধটি সঠিক নয়।');
        }
        db()->q("UPDATE `$table` SET `$field` = 1 - `$field` WHERE id = ?", [input_int('id')]);
        AdminAuth::log($key . '.toggle', input_int('id') . ':' . $field);
        ok([], 'আপডেট হয়েছে');
        break;
}
