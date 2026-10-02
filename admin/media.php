<?php
/** Admin: media library + built-in image compressor. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Media']);

$tab = input('tab') === 'compressor' ? 'compressor' : 'library';
$q = mb_substr(input('q'), 0, 80);
?>
<div class="page" data-init="<?= $tab === 'compressor' ? 'compressor' : 'media-library' ?>">
  <div class="adm-title"><h1>Media</h1></div>
  <nav class="tabs">
    <a class="tab <?= $tab === 'library' ? 'active' : '' ?>" href="<?= e(url('/admin/media')) ?>"><i class="fa-solid fa-photo-film"></i>Library</a>
    <a class="tab <?= $tab === 'compressor' ? 'active' : '' ?>" href="<?= e(url('/admin/media?tab=compressor')) ?>"><i class="fa-solid fa-compress"></i>Image compressor</a>
  </nav>
<?php if ($tab === 'library'):
    $where = '1'; $p = [];
    if ($q !== '') { $where = '(original_name LIKE ? OR path LIKE ? OR usage_tag LIKE ?)'; $l = '%' . addcslashes($q, '%_\\') . '%'; $p = [$l, $l, $l]; }
    $pg = paginate((int)val("SELECT COUNT(*) FROM media WHERE $where", $p), 48, max(1, input_int('page', 1)));
    $items = rows("SELECT * FROM media WHERE $where ORDER BY id DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
    $total = row('SELECT COALESCE(SUM(size),0) s, COALESCE(SUM(original_size),0) o FROM media'); ?>
  <label class="file-drop mb-2" data-media-drop>
    <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" data-media-upload>
    <i class="fa-solid fa-cloud-arrow-up" style="font-size:1.6rem;color:var(--primary)"></i>
    <strong>Drop images here or tap to upload</strong>
    <span class="tiny">JPG, PNG, WebP, PDF · up to <?= (int)setting('media.max_upload_mb', 10) ?> MB · images are compressed to ~<?= (int)setting('media.target_percent', 10) ?>% automatically<?= setting_bool('media.compress_enabled') ? '' : ' (auto-compression is OFF)' ?></span>
    <div class="upload-progress" style="width:100%"><i></i></div>
  </label>
  <form class="toolbar" method="get" action="<?= e(url('/admin/media')) ?>" data-get-form>
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="Search file name or usage…"></div>
    <span class="tiny muted"><?= number_format($pg['total']) ?> files · <?= human_bytes((int)$total['s']) ?><?= $total['o'] > $total['s'] ? ' (saved ' . human_bytes((int)$total['o'] - (int)$total['s']) . ')' : '' ?></span>
  </form>
  <div class="media-grid">
    <?php foreach ($items as $m): $isImg = str_starts_with($m['mime'], 'image/'); ?>
      <button type="button" class="media-item" data-action="media-detail" data-media='<?= e(json_encode(['id' => (int)$m['id'], 'url' => media_url($m['path']), 'abs' => abs_url($m['path']), 'path' => $m['path'], 'name' => $m['original_name'], 'size' => human_bytes((int)$m['size']),
          'original' => $m['original_size'] ? human_bytes((int)$m['original_size']) : null, 'saved' => $m['original_size'] ? round(100 - $m['size'] / $m['original_size'] * 100) : 0, 'dim' => $m['width'] ? $m['width'] . '×' . $m['height'] : '', 'img' => $isImg, 'tag' => $m['usage_tag']], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) ?>'>
        <div class="ph"><?php if ($isImg): ?><img src="<?= e(media_url($m['thumb'] ?: $m['path'])) ?>" alt="" loading="lazy"><?php else: ?><i class="fa-regular fa-file-pdf" style="font-size:2rem;color:var(--danger)"></i><?php endif ?></div>
        <div class="mi-meta truncate"><?= e($m['original_name'] ?: basename($m['path'])) ?><br><?= human_bytes((int)$m['size']) ?><?= $m['original_size'] && $m['original_size'] > $m['size'] ? ' · −' . round(100 - $m['size'] / $m['original_size'] * 100) . '%' : '' ?></div>
      </button>
    <?php endforeach ?>
  </div>
  <?php if (!$items): ?><div class="card empty"><div class="icon-box"><i class="fa-regular fa-images"></i></div>No media yet.</div><?php endif ?>
  <?php admin_pager($pg, '/admin/media?' . http_build_query(array_filter(['q' => $q]))) ?>
<?php else: ?>
  <section class="card card-pad-lg">
    <p class="muted small">Compress images in your browser before saving — nothing leaves your device until you click <b>Save to library</b>. Defaults come from Settings → Media.</p>
    <div class="form-grid">
      <div class="form-group wide"><label class="file-drop"><input type="file" accept="image/jpeg,image/png,image/webp" data-cmp-file><i class="fa-regular fa-image" style="font-size:1.5rem;color:var(--primary)"></i><strong data-file-label>Choose an image (JPG, JPEG, PNG, WebP)</strong></label></div>
      <div class="form-group"><label class="label">Target size: <b data-cmp-target-label><?= (int)setting('media.target_percent', 10) ?>%</b> of original</label><input type="range" min="1" max="100" value="<?= (int)setting('media.target_percent', 10) ?>" data-cmp-target style="width:100%"></div>
      <div class="form-group"><label class="label">Output format</label><select class="select" data-cmp-format><option value="image/webp">WebP (best)</option><option value="image/jpeg">JPEG</option><option value="keep">Keep original</option></select></div>
      <div class="form-group"><label class="label">Max width/height (px)</label><input class="input" type="number" min="100" max="8000" value="<?= (int)setting('media.max_dimension', 1920) ?>" data-cmp-max></div>
      <div class="form-group"><label class="label">Minimum quality</label><input class="input" type="number" min="10" max="95" value="<?= (int)setting('media.min_quality', 45) ?>" data-cmp-minq></div>
    </div>
    <div class="grid-2 mt-1" data-cmp-result hidden>
      <figure class="card" style="margin:0"><figcaption class="small"><b>Original</b> · <span data-cmp-orig-size></span> · <span data-cmp-orig-dim></span></figcaption><img data-cmp-orig alt="Original" style="margin-top:8px;border-radius:10px;max-height:320px;object-fit:contain;width:100%"></figure>
      <figure class="card" style="margin:0"><figcaption class="small"><b>Compressed</b> · <span data-cmp-new-size></span> · <span data-cmp-new-dim></span> · <b class="rt-up" data-cmp-saved></b></figcaption><img data-cmp-new alt="Compressed" style="margin-top:8px;border-radius:10px;max-height:320px;object-fit:contain;width:100%"></figure>
    </div>
    <div class="row wrap mt-2" data-cmp-actions hidden>
      <a class="btn btn-ghost" data-cmp-download download><i class="fa-solid fa-download"></i>Download</a>
      <button type="button" class="btn btn-soft" data-cmp-save><i class="fa-solid fa-floppy-disk"></i>Save to library</button>
      <button type="button" class="btn" data-cmp-replace><i class="fa-solid fa-arrows-rotate"></i>Replace an existing image…</button>
    </div>
  </section>
<?php endif ?>
</div>
