<?php
/**
 * Media upload (staff): stores, compresses and registers files in the
 * media library. Used by the media manager, rich editor and pickers.
 */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';

if (!is_post()) fail(t('err.bad_request'), 405);
$u = require_perm('media');
rate_limit('upload:' . $u['id'], 120, 3600);
if (empty($_FILES['file'])) fail(t('err.file_missing'));

$kind = input('kind') === 'document' ? 'document' : 'image';
$opts = [];
if (input('compress') !== '') $opts['compress'] = input_bool('compress');
if (input_int('target') > 0) $opts['target_percent'] = min(100, input_int('target'));
if (input('keep_format') === '1') $opts['webp'] = false;
try {
    $f = store_upload($_FILES['file'], $kind, $opts);
} catch (RuntimeException $e) {
    fail($e->getMessage(), 422);
}
$id = media_register($f, (string)$_FILES['file']['name'], mb_substr(input('tag'), 0, 40) ?: null);
audit('media_upload', 'media', $id, $f['path']);
ok(t('media.uploaded'), [
    'media' => ['id' => $id, 'url' => media_url($f['path']), 'path' => $f['path'], 'thumb' => $f['thumb'] ? media_url($f['thumb']) : null,
        'size' => $f['size'], 'original_size' => $f['original_size'], 'saved' => $f['original_size'] ? round(100 - $f['size'] / $f['original_size'] * 100, 1) : 0,
        'width' => $f['width'], 'height' => $f['height']],
]);
