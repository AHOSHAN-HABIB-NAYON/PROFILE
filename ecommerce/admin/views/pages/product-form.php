<?php
/**
 * Product editor.
 * @var ?array $p @var array $images @var array $variants @var array $related @var array $categories
 */
$isNew = $p === null;
$v = static fn(string $k, $d = '') => $p[$k] ?? $d;
$checked = static fn(string $k, int $d = 0) => (int)($p[$k] ?? $d) === 1 ? ' checked' : '';
$colors = $p['colors'] ?? [];
$specs = $p['specifications'] ?? [];
$discount = $p ? Product::discountPercent($p) : 0;
$sections = ['basic' => 'Basic', 'pricing' => 'Pricing', 'inventory' => 'Inventory', 'variants' => 'Variants', 'images' => 'Images',
    'description' => 'Description', 'shipping' => 'Shipping', 'visibility' => 'Visibility', 'seo' => 'SEO', 'related' => 'Related'];
?>
<div class="a-page editor-page">
  <div class="page-head">
    <div>
      <a href="<?= e(url('/admin/products')) ?>" class="back-link"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Products</a>
      <h1 class="a-title"><?= $isNew ? 'Add product' : 'Edit product' ?></h1>
    </div>
    <?php if (!$isNew): ?><a class="btn btn-ghost btn-sm" href="<?= e(url('/product/' . $p['slug'])) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-eye" aria-hidden="true"></i> View</a><?php endif; ?>
  </div>

  <nav class="section-tabs" aria-label="Editor sections">
    <?php foreach ($sections as $id => $label): ?><a href="#sec-<?= e($id) ?>" data-no-spa><?= e($label) ?></a><?php endforeach; ?>
  </nav>

  <form class="editor" method="post" action="<?= e(url('/admin/products/save')) ?>" enctype="multipart/form-data" data-ajax data-no-spa data-product-editor>
    <input type="hidden" name="id" value="<?= (int)$v('id', 0) ?>">

    <section class="a-card" id="sec-basic">
      <h2 class="a-card-title"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Basic information</h2>
      <div class="field">
        <label class="label" for="pf-name">Product name <span class="req">*</span></label>
        <input id="pf-name" class="input" name="name" value="<?= e($v('name')) ?>" required maxlength="255" data-slug-source="#pf-slug">
      </div>
      <div class="field">
        <label class="label" for="pf-slug">Slug (URL)</label>
        <div class="input-prefix"><span><?= e(url('/product/')) ?></span><input id="pf-slug" class="input" name="slug" value="<?= e($v('slug')) ?>" maxlength="191" pattern="[a-z0-9]+(-[a-z0-9]+)*" data-slug-target<?= $isNew ? '' : ' data-slug-locked' ?>></div>
        <p class="field-hint small muted">Auto-generated from the name; edit to customise.</p>
      </div>
      <div class="grid-2">
        <div class="field">
          <label class="label" for="pf-sku">SKU</label>
          <input id="pf-sku" class="input" name="sku" value="<?= e($v('sku')) ?>" maxlength="80">
        </div>
        <div class="field">
          <label class="label" for="pf-tags">Keywords / tags</label>
          <input id="pf-tags" class="input" name="tags" value="<?= e($v('tags')) ?>" maxlength="500" placeholder="comma separated — helps search">
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label class="label" for="pf-cat">Category</label>
          <select id="pf-cat" class="input" name="category_id" data-parent-select="#pf-sub">
            <option value="">— None —</option>
            <?php foreach ($categories as $c): if ($c['parent_id']) continue; ?>
              <option value="<?= (int)$c['id'] ?>"<?= (int)$v('category_id') === (int)$c['id'] ? ' selected' : '' ?>><?= e($c['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label class="label" for="pf-sub">Subcategory</label>
          <select id="pf-sub" class="input" name="subcategory_id">
            <option value="">— None —</option>
            <?php foreach ($categories as $c): if (!$c['parent_id']) continue; ?>
              <option value="<?= (int)$c['id'] ?>" data-parent="<?= (int)$c['parent_id'] ?>"<?= (int)$v('subcategory_id') === (int)$c['id'] ? ' selected' : '' ?>><?= e($c['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="label" for="pf-short">Short description</label>
        <textarea id="pf-short" class="input" name="short_description" rows="2" maxlength="1000" data-counter><?= e($v('short_description')) ?></textarea>
      </div>
    </section>

    <section class="a-card" id="sec-pricing">
      <h2 class="a-card-title"><i class="fa-solid fa-tag" aria-hidden="true"></i> Pricing</h2>
      <div class="grid-3" data-pricing>
        <div class="field">
          <label class="label" for="pf-price">Price (৳) <span class="req">*</span></label>
          <input id="pf-price" class="input" name="price" type="number" step="0.01" min="0" value="<?= e($v('price')) ?>" required data-price>
        </div>
        <div class="field">
          <label class="label" for="pf-old">Old price (৳)</label>
          <input id="pf-old" class="input" name="old_price" type="number" step="0.01" min="0" value="<?= e($v('old_price')) ?>" data-old-price>
        </div>
        <div class="field">
          <label class="label" for="pf-disc">Discount (%)</label>
          <input id="pf-disc" class="input" type="number" step="1" min="0" max="95" value="<?= $discount ?: '' ?>" data-discount>
          <p class="field-hint small muted">Sets the old price automatically.</p>
        </div>
      </div>
    </section>

    <section class="a-card" id="sec-inventory">
      <h2 class="a-card-title"><i class="fa-solid fa-warehouse" aria-hidden="true"></i> Inventory</h2>
      <div class="grid-3">
        <div class="field">
          <label class="label" for="pf-stock">Stock quantity</label>
          <input id="pf-stock" class="input" name="stock" type="number" min="0" value="<?= (int)$v('stock', 0) ?>" data-stock-input>
          <p class="field-hint small muted" data-stock-hint hidden>Calculated from variants.</p>
        </div>
        <label class="switch-row"><input type="checkbox" name="track_stock" value="1"<?= $checked('track_stock', 1) ?>><span class="toggle"></span><span>Track stock<small class="muted d-block">Disable ordering at 0 (“স্টক শেষ”)</small></span></label>
        <label class="switch-row"><input type="checkbox" name="allow_backorder" value="1"<?= $checked('allow_backorder') ?>><span class="toggle"></span><span>Allow backorder<small class="muted d-block">Accept orders when out of stock</small></span></label>
      </div>
    </section>

    <section class="a-card" id="sec-variants">
      <h2 class="a-card-title"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Variants</h2>
      <div class="field">
        <label class="label" for="pf-sizes">Sizes</label>
        <input id="pf-sizes" class="input" name="sizes" value="<?= e(implode(', ', $p['sizes'] ?? [])) ?>" placeholder="e.g. M, L, XL, XXL" data-sizes>
        <p class="field-hint small muted">If sizes are set, customers must choose one (“সাইজ নির্বাচন করুন”).</p>
      </div>
      <div class="field">
        <span class="label">Colors</span>
        <div class="repeater" data-repeater="colors">
          <?php foreach ($colors ?: [] as $c): ?>
            <div class="repeater-row"><input class="input input-sm" name="color_name[]" value="<?= e($c['name']) ?>" placeholder="Color name" aria-label="Color name" data-color-name><input type="color" class="color-input" name="color_hex[]" value="<?= e($c['hex']) ?>" aria-label="Color"><button type="button" class="icon-btn icon-btn-sm danger" data-action="repeater-remove" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
          <?php endforeach; ?>
        </div>
        <template data-template="colors"><div class="repeater-row"><input class="input input-sm" name="color_name[]" placeholder="Color name" aria-label="Color name" data-color-name><input type="color" class="color-input" name="color_hex[]" value="#4f46e5" aria-label="Color"><button type="button" class="icon-btn icon-btn-sm danger" data-action="repeater-remove" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div></template>
        <button type="button" class="btn btn-sm btn-ghost" data-action="repeater-add" data-target="colors"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add color</button>
      </div>
      <div class="variants-head">
        <span class="label">Variant stock &amp; price</span>
        <button type="button" class="btn btn-sm btn-outline" data-action="variants-generate"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Generate from sizes/colors</button>
      </div>
      <div class="table-scroll">
        <table class="a-table variants-table" data-variants>
          <thead><tr><th>Size</th><th>Color</th><th>SKU</th><th>Price override</th><th>Stock</th></tr></thead>
          <tbody>
          <?php foreach ($variants as $i => $vr): ?>
            <tr>
              <td><?= e($vr['size'] ?: '—') ?><input type="hidden" name="variants[<?= $i ?>][size]" value="<?= e($vr['size']) ?>"></td>
              <td><?= e($vr['color'] ?: '—') ?><input type="hidden" name="variants[<?= $i ?>][color]" value="<?= e($vr['color']) ?>"></td>
              <td><input class="input input-sm" name="variants[<?= $i ?>][sku]" value="<?= e($vr['sku']) ?>" aria-label="Variant SKU"></td>
              <td><input class="input input-sm" type="number" step="0.01" min="0" name="variants[<?= $i ?>][price]" value="<?= e($vr['price']) ?>" placeholder="default" aria-label="Variant price"></td>
              <td><input class="input input-sm" type="number" min="0" name="variants[<?= $i ?>][stock]" value="<?= (int)$vr['stock'] ?>" aria-label="Variant stock" data-variant-stock></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <p class="muted small" data-variants-empty<?= $variants ? ' hidden' : '' ?>>No variants. Add sizes/colors then click “Generate” to manage stock per combination.</p>
    </section>

    <section class="a-card" id="sec-images">
      <h2 class="a-card-title"><i class="fa-solid fa-images" aria-hidden="true"></i> Images</h2>
      <?php if ($isNew): ?>
        <label class="dropzone">
          <input type="file" name="images[]" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-preview-target="#new-previews">
          <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
          <span><strong>Choose images</strong> or drag them here</span>
          <small class="muted">JPG, PNG, WEBP · up to 8 MB each · automatically resized & converted to WebP</small>
        </label>
        <div class="image-grid" id="new-previews"></div>
      <?php else: ?>
        <div class="dropzone" data-uploader data-url="<?= e(url('/admin/products/' . $p['id'] . '/images')) ?>" data-reorder="<?= e(url('/admin/products/' . $p['id'] . '/images/reorder')) ?>">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-label="Upload images" data-upload-input>
          <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
          <span><strong>Upload images</strong> or drag them here</span>
          <small class="muted">Compressed instantly (e.g. 5 MB → ~300–500 KB) · thumbnail, medium & large sizes generated</small>
          <span class="upload-progress" data-upload-progress hidden><span></span></span>
        </div>
        <div class="image-grid" data-image-list>
          <?php foreach ($images as $img): ?>
            <figure class="image-item" draggable="true" data-image-id="<?= (int)$img['id'] ?>">
              <img src="<?= e(image_url($img['path'], 'sm', $img['ext'])) ?>" alt="" width="120" height="120" loading="lazy">
              <figcaption><?= (int)$img['width'] ?>×<?= (int)$img['height'] ?> · <?= number_format($img['bytes'] / 1024) ?> KB</figcaption>
              <div class="image-tools">
                <button type="button" class="icon-btn icon-btn-sm" data-action="image-move" data-dir="-1" aria-label="Move left"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
                <button type="button" class="icon-btn icon-btn-sm" data-action="image-move" data-dir="1" aria-label="Move right"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                <button type="button" class="icon-btn icon-btn-sm danger" data-action="post" data-url="<?= e(url('/admin/products/images/' . $img['id'] . '/delete')) ?>" data-confirm="Delete this image permanently?" data-remove-closest=".image-item" aria-label="Delete image"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
              </div>
            </figure>
          <?php endforeach; ?>
        </div>
        <p class="muted small">First image is the main image. Drag to reorder.</p>
      <?php endif; ?>
      <div class="field">
        <label class="label" for="pf-video">Video URL (YouTube, optional)</label>
        <input id="pf-video" class="input" name="video_url" type="url" value="<?= e($v('video_url')) ?>" placeholder="https://www.youtube.com/watch?v=…">
      </div>
    </section>

    <section class="a-card" id="sec-description">
      <h2 class="a-card-title"><i class="fa-solid fa-align-left" aria-hidden="true"></i> Description</h2>
      <?= View::render('admin:partials/rich-editor', ['name' => 'description', 'value' => (string)$v('description'), 'id' => 'pf-desc']) ?>
      <div class="field">
        <span class="label">Specifications</span>
        <div class="repeater" data-repeater="specs">
          <?php foreach ($specs as $s): ?>
            <div class="repeater-row"><input class="input input-sm" name="spec_label[]" value="<?= e($s['label']) ?>" placeholder="Label" aria-label="Spec label"><input class="input input-sm" name="spec_value[]" value="<?= e($s['value']) ?>" placeholder="Value" aria-label="Spec value"><button type="button" class="icon-btn icon-btn-sm danger" data-action="repeater-remove" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
          <?php endforeach; ?>
        </div>
        <template data-template="specs"><div class="repeater-row"><input class="input input-sm" name="spec_label[]" placeholder="Label (e.g. কাপড়)" aria-label="Spec label"><input class="input input-sm" name="spec_value[]" placeholder="Value" aria-label="Spec value"><button type="button" class="icon-btn icon-btn-sm danger" data-action="repeater-remove" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div></template>
        <button type="button" class="btn btn-sm btn-ghost" data-action="repeater-add" data-target="specs"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add specification</button>
      </div>
      <div class="field">
        <label class="label" for="pf-features">Features (one per line)</label>
        <textarea id="pf-features" class="input" name="features" rows="4"><?= e(implode("\n", $p['features'] ?? [])) ?></textarea>
      </div>
    </section>

    <section class="a-card" id="sec-shipping">
      <h2 class="a-card-title"><i class="fa-solid fa-truck" aria-hidden="true"></i> Shipping</h2>
      <div class="grid-2">
        <div class="field">
          <label class="label" for="pf-weight">Weight (grams)</label>
          <input id="pf-weight" class="input" name="weight_grams" type="number" min="0" value="<?= (int)$v('weight_grams', 500) ?>">
          <p class="field-hint small muted">Sent to couriers when creating parcels.</p>
        </div>
        <label class="switch-row"><input type="checkbox" name="is_free_delivery" value="1"<?= $checked('is_free_delivery') ?>><span class="toggle"></span><span>Free delivery<small class="muted d-block">Order ships free when every item is free-delivery</small></span></label>
      </div>
    </section>

    <section class="a-card" id="sec-visibility">
      <h2 class="a-card-title"><i class="fa-solid fa-eye" aria-hidden="true"></i> Visibility</h2>
      <div class="grid-3">
        <div class="field">
          <label class="label" for="pf-status">Status</label>
          <select id="pf-status" class="input" name="status">
            <option value="active"<?= $v('status', 'active') === 'active' ? ' selected' : '' ?>>Active (visible)</option>
            <option value="draft"<?= $v('status') === 'draft' ? ' selected' : '' ?>>Draft (hidden)</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="pf-sort">Sort order</label>
          <input id="pf-sort" class="input" name="sort_order" type="number" value="<?= (int)$v('sort_order', 0) ?>">
        </div>
      </div>
      <div class="switch-grid">
        <label class="switch-row"><input type="checkbox" name="is_featured" value="1"<?= $checked('is_featured') ?>><span class="toggle"></span><span>Featured</span></label>
        <label class="switch-row"><input type="checkbox" name="is_flash_sale" value="1"<?= $checked('is_flash_sale') ?>><span class="toggle"></span><span>Flash sale</span></label>
        <label class="switch-row"><input type="checkbox" name="is_combo" value="1"<?= $checked('is_combo') ?>><span class="toggle"></span><span>Combo</span></label>
      </div>
    </section>

    <section class="a-card" id="sec-seo">
      <h2 class="a-card-title"><i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> SEO</h2>
      <div class="field">
        <label class="label" for="pf-seo-title">SEO title</label>
        <input id="pf-seo-title" class="input" name="seo_title" value="<?= e($v('seo_title')) ?>" maxlength="191" data-counter placeholder="Defaults to product name">
      </div>
      <div class="field">
        <label class="label" for="pf-seo-desc">SEO description</label>
        <textarea id="pf-seo-desc" class="input" name="seo_description" rows="2" maxlength="300" data-counter placeholder="Defaults to short description"><?= e($v('seo_description')) ?></textarea>
      </div>
      <div class="field">
        <label class="label" for="pf-meta">Meta / share image</label>
        <?php if ($v('meta_image')): ?><img src="<?= e(upload_url($v('meta_image'))) ?>" alt="" class="meta-preview" width="240" height="126"><?php endif; ?>
        <input id="pf-meta" class="input" type="file" name="meta_image" accept="image/jpeg,image/png,image/webp">
        <p class="field-hint small muted">1200×630 recommended. Defaults to the main product image.</p>
      </div>
    </section>

    <section class="a-card" id="sec-related">
      <h2 class="a-card-title"><i class="fa-solid fa-shapes" aria-hidden="true"></i> Related products</h2>
      <p class="muted small">Manually picked products show first; the rest are filled automatically from the same category.</p>
      <div class="picker" data-picker data-search="<?= e(url('/admin/products/search')) ?>">
        <label class="sr-only" for="pf-related">Search products</label>
        <input id="pf-related" class="input" type="search" placeholder="Search products to add…" autocomplete="off" data-picker-input>
        <div class="picker-results" data-picker-results hidden></div>
        <div class="chips" data-picker-chips>
          <?php foreach ($related as $rp): ?>
            <span class="chip-item"><?= e(str_limit($rp['name'], 40)) ?><input type="hidden" name="related[]" value="<?= (int)$rp['id'] ?>"><button type="button" data-action="chip-remove" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></span>
          <?php endforeach; ?>
        </div>
      </div>
    </section>

    <div class="save-bar">
      <span class="muted small" data-dirty-note hidden><i class="fa-solid fa-circle" aria-hidden="true"></i> Unsaved changes</span>
      <a href="<?= e(url('/admin/products')) ?>" class="btn btn-ghost">Cancel</a>
      <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> <?= $isNew ? 'Create product' : 'Save changes' ?></button>
    </div>
  </form>
</div>
