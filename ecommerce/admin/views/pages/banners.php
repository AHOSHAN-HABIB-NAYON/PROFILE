<?php
/**
 * @var array $rows @var ?array $edit
 */
$b = $edit ?? [];
$dt = static fn($v) => $v ? date('Y-m-d\TH:i', strtotime($v)) : '';
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Banners</h1><p class="muted small">Hero slider on the home page · images are auto-cropped to 2:1 and compressed to WebP</p></div></div>
  <div class="a-split">
    <section class="a-card">
      <?php if (!$rows): ?>
        <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-images', 'title' => 'No banners yet', 'text' => 'Without banners the home page shows a branded gradient hero.']) ?>
      <?php else: ?>
      <div class="banner-list">
        <?php foreach ($rows as $row): $live = (int)$row['is_active'] === 1 && (!$row['starts_at'] || strtotime($row['starts_at']) <= time()) && (!$row['ends_at'] || strtotime($row['ends_at']) > time()); ?>
          <article class="banner-item">
            <img src="<?= e(image_url($row['image'], 'sm', $row['ext'])) ?>" alt="" width="320" height="160" loading="lazy">
            <div class="banner-meta">
              <strong><?= e($row['title'] ?: 'Untitled banner') ?></strong>
              <span class="muted small d-block"><?= e($row['link'] ?: 'No link') ?> · order <?= (int)$row['sort_order'] ?></span>
              <span class="small d-block muted"><?= $row['starts_at'] ? 'From ' . e(date('d M Y H:i', strtotime($row['starts_at']))) : '' ?> <?= $row['ends_at'] ? ' until ' . e(date('d M Y H:i', strtotime($row['ends_at']))) : '' ?></span>
              <?= $live ? '<span class="badge badge-success">Live</span>' : '<span class="badge badge-muted">Not showing</span>' ?>
            </div>
            <div class="row-actions">
              <a class="icon-btn icon-btn-sm" href="<?= e(url('/admin/banners', ['edit' => $row['id']])) ?>" aria-label="Edit"><i class="fa-solid fa-pen" aria-hidden="true"></i></a>
              <button type="button" class="icon-btn icon-btn-sm danger" data-action="post" data-url="<?= e(url('/admin/banners/' . $row['id'] . '/delete')) ?>" data-confirm="Move this banner to trash?" aria-label="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>
          </article>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    <section class="a-card a-sticky">
      <h2 class="a-card-title"><i class="fa-solid <?= $edit ? 'fa-pen' : 'fa-plus' ?>" aria-hidden="true"></i> <?= $edit ? 'Edit banner' : 'Add banner' ?></h2>
      <form method="post" action="<?= e(url('/admin/banners/save')) ?>" enctype="multipart/form-data" data-ajax data-no-spa>
        <input type="hidden" name="id" value="<?= (int)($b['id'] ?? 0) ?>">
        <div class="field">
          <label class="label" for="b-img">Image <?= $edit ? '(leave empty to keep current)' : '<span class="req">*</span>' ?></label>
          <?php if (!empty($b['image'])): ?><img src="<?= e(image_url($b['image'], 'sm', $b['ext'])) ?>" alt="" class="banner-preview" width="320" height="160"><?php endif; ?>
          <input id="b-img" class="input" type="file" name="image" accept="image/jpeg,image/png,image/webp" data-preview-target="#b-preview"<?= $edit ? '' : ' required' ?>>
          <div class="image-grid" id="b-preview"></div>
        </div>
        <div class="field"><label class="label" for="b-title">Title</label><input id="b-title" class="input" name="title" value="<?= e($b['title'] ?? '') ?>" maxlength="191"></div>
        <div class="field"><label class="label" for="b-sub">Subtitle</label><input id="b-sub" class="input" name="subtitle" value="<?= e($b['subtitle'] ?? '') ?>" maxlength="300"></div>
        <div class="grid-2">
          <div class="field"><label class="label" for="b-cta">Button text</label><input id="b-cta" class="input" name="cta_text" value="<?= e($b['cta_text'] ?? '') ?>" maxlength="60" placeholder="এখনই কিনুন"></div>
          <div class="field"><label class="label" for="b-link">Link</label><input id="b-link" class="input" name="link" value="<?= e($b['link'] ?? '') ?>" placeholder="/category/mens-fashion"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="b-start">Start</label><input id="b-start" class="input" type="datetime-local" name="starts_at" value="<?= e($dt($b['starts_at'] ?? null)) ?>"></div>
          <div class="field"><label class="label" for="b-end">End</label><input id="b-end" class="input" type="datetime-local" name="ends_at" value="<?= e($dt($b['ends_at'] ?? null)) ?>"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="b-sort">Sort order</label><input id="b-sort" class="input" type="number" name="sort_order" value="<?= (int)($b['sort_order'] ?? 0) ?>"></div>
          <label class="switch-row"><input type="checkbox" name="is_active" value="1"<?= (int)($b['is_active'] ?? 1) === 1 ? ' checked' : '' ?>><span class="toggle"></span><span>Active</span></label>
        </div>
        <div class="form-actions">
          <?php if ($edit): ?><a href="<?= e(url('/admin/banners')) ?>" class="btn btn-ghost">Cancel</a><?php endif; ?>
          <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save banner</button>
        </div>
      </form>
    </section>
  </div>
</div>
