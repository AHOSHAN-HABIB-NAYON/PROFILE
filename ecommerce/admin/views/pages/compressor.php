<div class="a-page narrow">
  <div class="page-head"><div><h1 class="a-title">Image Compressor</h1><p class="muted small">Adaptive resize + WebP/JPEG encoding. Quality is reduced only until the size target is met (never below a visual-quality floor).</p></div></div>
  <form class="a-card" method="post" action="<?= e(url('/admin/compressor')) ?>" enctype="multipart/form-data" data-ajax data-no-spa data-compressor>
    <label class="dropzone">
      <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required data-preview-target="#cmp-preview">
      <i class="fa-solid fa-file-image" aria-hidden="true"></i>
      <span><strong>Choose an image</strong> (up to 8 MB)</span>
      <small class="muted">e.g. 5 MB → ~500 KB, 1 MB → ~100 KB</small>
    </label>
    <div class="image-grid" id="cmp-preview"></div>
    <div class="grid-3">
      <div class="field"><label class="label" for="cmp-w">Max width (px)</label><input id="cmp-w" class="input" type="number" name="max_width" value="1600" min="100" max="6000"></div>
      <div class="field"><label class="label" for="cmp-f">Format</label><select id="cmp-f" class="input" name="format"><option value="webp">WebP (smallest)</option><option value="jpg">JPEG (compatible)</option></select></div>
      <div class="field"><label class="label" for="cmp-t">Target size (KB, optional)</label><input id="cmp-t" class="input" type="number" name="target_kb" min="10" placeholder="Auto (~10%)"></div>
    </div>
    <button class="btn btn-primary" type="submit"><i class="fa-solid fa-compress" aria-hidden="true"></i> Compress</button>
    <div class="compress-result" data-compress-result hidden></div>
  </form>
</div>
