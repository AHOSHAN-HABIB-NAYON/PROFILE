<?php /** @var array $recent */ ?>
<div class="admin-head"><div><h1><i class="fa-solid fa-compress text-primary"></i> <?= e(t('admin.compressor')) ?></h1><p class="muted small mb-0"><?= e(t('admin.compressor_d')) ?></p></div></div>
<div class="admin-grid">
    <form class="card form" method="post" action="<?= e(url('/admin/compressor')) ?>" enctype="multipart/form-data" data-ajax data-component="compressor">
        <?= csrf_field() ?>
        <div class="field drop" data-component="file-preview">
            <label for="cmp-file" class="drop-zone"><i class="fa-solid fa-cloud-arrow-up"></i><span><?= e(t('admin.drop_image')) ?></span><small class="muted">JPG · JPEG · PNG · WEBP · ≤ <?= e(setting('img_max_upload_mb')) ?>MB</small></label>
            <input class="sr-only" type="file" id="cmp-file" name="image" accept="image/jpeg,image/png,image/webp" required>
            <img class="upload-thumb" alt="" hidden><span class="hint" data-file-info></span>
        </div>
        <div class="field">
            <label for="cmp-q"><?= e(t('set.img_quality')) ?>: <b data-q-out><?= (int)setting('img_quality') ?></b>%</label>
            <input type="range" id="cmp-q" name="quality" min="10" max="100" value="<?= (int)setting('img_quality') ?>" class="w-full">
        </div>
        <div class="grid grid-2">
            <div class="field"><label for="cmp-f"><?= e(t('set.img_format')) ?></label><select class="select" id="cmp-f" name="format">
                <?php foreach (['webp' => 'WebP', 'jpg' => 'JPG', 'png' => 'PNG', 'keep' => 'Keep'] as $k => $l): ?><option value="<?= $k ?>" <?= setting('img_format') === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select></div>
            <div class="field"><label for="cmp-w"><?= e(t('set.img_max_width')) ?></label><input class="input" type="number" id="cmp-w" name="max_width" value="<?= (int)setting('img_max_width') ?>" min="0" max="8000"></div>
        </div>
        <label class="switch"><input type="checkbox" name="thumb" value="1" <?= setting('img_thumbnail') === '1' ? 'checked' : '' ?>><span class="track"></span><?= e(t('set.img_thumbnail')) ?></label>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> <?= e(t('admin.compress')) ?></button>
        <div class="cmp-result" hidden>
            <div class="stat-grid stat-grid-3">
                <div class="stat"><span class="label"><?= e(t('admin.original')) ?></span><span class="value" data-r="original"></span></div>
                <div class="stat"><span class="label"><?= e(t('admin.compressed_size')) ?></span><span class="value text-primary" data-r="compressed"></span></div>
                <div class="stat"><span class="label"><?= e(t('admin.saved')) ?></span><span class="value text-success" data-r="saved"></span></div>
            </div>
            <img class="cmp-preview mt-1" alt="" data-r="img">
            <div class="row-gap mt-1"><a class="btn btn-sm btn-primary" data-r="download" download data-no-spa><i class="fa-solid fa-download"></i> <?= e(t('admin.download')) ?></a>
                <button class="btn btn-sm btn-outline" type="button" data-action="copy" data-r="copy"><i class="fa-regular fa-copy"></i> URL</button></div>
        </div>
    </form>
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('admin.recent')) ?></h2>
        <?php if (!$recent): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
        <div class="thumb-grid">
            <?php foreach ($recent as $r): ?>
                <a href="<?= e($r['url']) ?>" target="_blank" rel="noopener" data-no-spa class="thumb"><img src="<?= e($r['url']) ?>" alt="" loading="lazy"><small><?= e(fmt_bytes($r['size'])) ?></small></a>
            <?php endforeach; ?>
        </div>
    </section>
</div>
