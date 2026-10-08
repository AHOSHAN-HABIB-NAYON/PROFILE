<?php
/**
 * @var array $rows @var ?array $edit @var array $parents @var array $icons
 */
$c = $edit ?? [];
$icon = $c['icon'] ?? 'fa-solid fa-tag';
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Categories</h1><p class="muted small"><?= count($rows) ?> categories</p></div></div>

  <div class="a-split">
    <section class="a-card">
      <?php if (!$rows): ?>
        <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-table-cells-large', 'title' => 'No categories yet', 'text' => 'Create your first category with the form.']) ?>
      <?php else: ?>
      <div class="list">
        <?php foreach ($rows as $row): ?>
          <div class="list-row">
            <span class="cat-icon-box"><?= Category::iconHtml($row) ?></span>
            <span class="list-main">
              <strong><?= $row['parent_id'] ? '<span class="muted">' . e($row['parent_name']) . ' › </span>' : '' ?><?= e($row['name']) ?></strong>
              <span class="muted small d-block">/category/<?= e($row['slug']) ?> · <?= (int)$row['product_count'] ?> products · order <?= (int)$row['sort_order'] ?></span>
            </span>
            <span class="list-side">
              <?= $row['status'] === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-muted">Inactive</span>' ?>
              <?php if ((int)$row['is_free_delivery'] === 1): ?><span class="badge badge-primary">Free delivery</span><?php endif; ?>
            </span>
            <span class="row-actions">
              <a class="icon-btn icon-btn-sm" href="<?= e(url('/admin/categories', ['edit' => $row['id']])) ?>" aria-label="Edit"><i class="fa-solid fa-pen" aria-hidden="true"></i></a>
              <button type="button" class="icon-btn icon-btn-sm danger" data-action="post" data-url="<?= e(url('/admin/categories/' . $row['id'] . '/delete')) ?>" data-confirm="Move category “<?= e($row['name']) ?>” to trash? Products stay but lose this category link while it is deleted." aria-label="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </span>
          </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    <section class="a-card a-sticky">
      <h2 class="a-card-title"><i class="fa-solid <?= $edit ? 'fa-pen' : 'fa-plus' ?>" aria-hidden="true"></i> <?= $edit ? 'Edit category' : 'Add category' ?></h2>
      <form method="post" action="<?= e(url('/admin/categories/save')) ?>" enctype="multipart/form-data" data-ajax data-no-spa>
        <input type="hidden" name="id" value="<?= (int)($c['id'] ?? 0) ?>">
        <div class="field"><label class="label" for="c-name">Name <span class="req">*</span></label><input id="c-name" class="input" name="name" value="<?= e($c['name'] ?? '') ?>" required data-slug-source="#c-slug"></div>
        <div class="field"><label class="label" for="c-slug">Slug</label><input id="c-slug" class="input" name="slug" value="<?= e($c['slug'] ?? '') ?>" data-slug-target<?= $edit ? ' data-slug-locked' : '' ?>></div>
        <div class="field">
          <label class="label" for="c-parent">Parent</label>
          <select id="c-parent" class="input" name="parent_id">
            <option value="">— Top level —</option>
            <?php foreach ($parents as $pr): if ((int)$pr['id'] === (int)($c['id'] ?? 0)) continue; ?><option value="<?= (int)$pr['id'] ?>"<?= (int)($c['parent_id'] ?? 0) === (int)$pr['id'] ? ' selected' : '' ?>><?= e($pr['name']) ?></option><?php endforeach; ?>
          </select>
        </div>
        <div class="field"><label class="label" for="c-desc">Description</label><textarea id="c-desc" class="input" name="description" rows="2"><?= e($c['description'] ?? '') ?></textarea></div>

        <fieldset class="field">
          <legend class="label">Icon</legend>
          <div class="segmented">
            <label><input type="radio" name="icon_type" value="fa"<?= ($c['icon_type'] ?? 'fa') === 'fa' ? ' checked' : '' ?>><span>Font Awesome</span></label>
            <label><input type="radio" name="icon_type" value="image"<?= ($c['icon_type'] ?? '') === 'image' ? ' checked' : '' ?>><span>Upload image</span></label>
          </div>
          <div class="icon-choose">
            <span class="icon-preview" data-icon-preview><i class="<?= e($icon) ?>" aria-hidden="true"></i></span>
            <input type="hidden" name="icon" value="<?= e($icon) ?>" data-icon-input>
            <button type="button" class="btn btn-sm btn-outline" data-action="icon-picker"><i class="fa-solid fa-icons" aria-hidden="true"></i> Choose icon</button>
          </div>
          <label class="label small" for="c-iconimg">Custom icon image (square, optional)</label>
          <?php if (!empty($c['icon_image'])): ?><img src="<?= e(upload_url($c['icon_image'])) ?>" alt="" width="48" height="48" class="thumb-sm"><?php endif; ?>
          <input id="c-iconimg" class="input input-sm" type="file" name="icon_image" accept="image/png,image/webp,image/jpeg">
        </fieldset>

        <div class="field">
          <label class="label" for="c-image">Category image (shown on /categories)</label>
          <?php if (!empty($c['image'])): ?><img src="<?= e(upload_url($c['image'])) ?>" alt="" width="64" height="64" class="thumb-sm"><?php endif; ?>
          <input id="c-image" class="input input-sm" type="file" name="image" accept="image/png,image/webp,image/jpeg">
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="c-sort">Sort order</label><input id="c-sort" class="input" type="number" name="sort_order" value="<?= (int)($c['sort_order'] ?? 0) ?>"></div>
          <div class="field"><label class="label" for="c-status">Status</label><select id="c-status" class="input" name="status"><option value="active">Active</option><option value="inactive"<?= ($c['status'] ?? '') === 'inactive' ? ' selected' : '' ?>>Inactive</option></select></div>
        </div>
        <label class="switch-row"><input type="checkbox" name="is_free_delivery" value="1"<?= (int)($c['is_free_delivery'] ?? 0) === 1 ? ' checked' : '' ?>><span class="toggle"></span><span>Free delivery for this category</span></label>
        <details class="details"><summary>SEO</summary>
          <div class="field"><label class="label" for="c-seot">SEO title</label><input id="c-seot" class="input" name="seo_title" value="<?= e($c['seo_title'] ?? '') ?>" maxlength="191"></div>
          <div class="field"><label class="label" for="c-seod">SEO description</label><textarea id="c-seod" class="input" name="seo_description" rows="2" maxlength="300"><?= e($c['seo_description'] ?? '') ?></textarea></div>
        </details>
        <div class="form-actions">
          <?php if ($edit): ?><a href="<?= e(url('/admin/categories')) ?>" class="btn btn-ghost">Cancel</a><?php endif; ?>
          <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save category</button>
        </div>
      </form>
    </section>
  </div>
  <script type="application/json" data-icon-library><?= json_attr($icons) ?></script>
</div>
