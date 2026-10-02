<?php
/** @var ?array $p */
$v = static fn (string $k, $d = '') => $p[$k] ?? $d;
$dtl = static fn ($x) => $x ? date('Y-m-d\TH:i', strtotime($x)) : '';
$pid = (int) ($p['id'] ?? 0);
?>
<div class="page-a" data-page="product-form" data-product-id="<?= $pid ?>">
  <div class="toolbar-top">
    <a href="/admin/products" class="small muted"><i class="fa fa-angle-left"></i> সব পণ্য</a>
    <?php if ($pid): ?><a href="/product/<?= e(rawurlencode($p['slug'])) ?>" target="_blank" rel="noopener" class="btn btn-ghost btn-sm"><i class="fa fa-eye"></i> সাইটে দেখুন</a><?php endif; ?>
  </div>
  <form data-api="/admin/api/products/save" data-product-form class="form-layout" novalidate>
    <input type="hidden" name="id" value="<?= $pid ?>">
    <div class="stack">
      <section class="card">
        <h3 class="card-title">মূল তথ্য</h3>
        <div class="field"><label>পণ্যের নাম <span class="req">*</span></label><input name="name" value="<?= e($v('name')) ?>" required maxlength="190"></div>
        <div class="grid-2">
          <div class="field"><label>ক্যাটাগরি</label><select name="category_id"><option value="">— নির্বাচন করুন —</option>
            <?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>"<?= (int) $v('category_id', 0) === (int) $c['id'] ? ' selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select></div>
          <div class="field"><label>SKU</label><input name="sku" value="<?= e($v('sku')) ?>" maxlength="60"></div>
        </div>
        <div class="field"><label>URL স্লাগ</label><input name="slug" value="<?= e($v('slug')) ?>" placeholder="খালি রাখলে নাম থেকে তৈরি হবে" maxlength="180"><p class="field-hint">/product/<b data-slug-preview><?= e($v('slug')) ?></b></p></div>
        <div class="field"><label>সংক্ষিপ্ত বিবরণ</label><textarea name="short_description" rows="2" maxlength="500"><?= e($v('short_description')) ?></textarea></div>
      </section>

      <section class="card">
        <h3 class="card-title">বিস্তারিত বিবরণ</h3>
        <div class="editor" data-editor>
          <div class="editor-bar" role="toolbar" aria-label="এডিটর টুলবার">
            <button type="button" data-cmd="formatBlock" data-val="h2" title="হেডিং">H2</button>
            <button type="button" data-cmd="formatBlock" data-val="h3" title="সাব-হেডিং">H3</button>
            <button type="button" data-cmd="formatBlock" data-val="p" title="প্যারাগ্রাফ"><i class="fa fa-paragraph"></i></button>
            <button type="button" data-cmd="bold" title="বোল্ড"><i class="fa fa-bold"></i></button>
            <button type="button" data-cmd="italic" title="ইটালিক"><i class="fa fa-italic"></i></button>
            <button type="button" data-cmd="underline" title="আন্ডারলাইন"><i class="fa fa-underline"></i></button>
            <button type="button" data-cmd="highlight" title="হাইলাইট"><i class="fa fa-paint-brush"></i></button>
            <button type="button" data-cmd="insertUnorderedList" title="বুলেট লিস্ট"><i class="fa fa-list-ul"></i></button>
            <button type="button" data-cmd="insertOrderedList" title="নম্বর লিস্ট"><i class="fa fa-list-ol"></i></button>
            <button type="button" data-cmd="formatBlock" data-val="blockquote" title="উদ্ধৃতি"><i class="fa fa-quote-left"></i></button>
            <button type="button" data-cmd="table" title="টেবিল"><i class="fa fa-table"></i></button>
            <button type="button" data-cmd="link" title="লিংক"><i class="fa fa-link"></i></button>
            <button type="button" data-cmd="image" title="ছবি"><i class="fa fa-image"></i></button>
            <button type="button" data-cmd="removeFormat" title="ফরম্যাট মুছুন"><i class="fa fa-eraser"></i></button>
            <button type="button" data-cmd="html" title="HTML"><i class="fa fa-code"></i></button>
          </div>
          <div class="editor-area rich-text" contenteditable="true" data-editor-area aria-label="পণ্যের বিবরণ"><?= $v('description') /* stored sanitized */ ?></div>
          <textarea name="description" class="editor-html" data-editor-html hidden><?= e($v('description')) ?></textarea>
          <input type="file" accept="image/*" data-editor-file hidden>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3 class="card-title">ছবি</h3><span class="tiny muted">স্বয়ংক্রিয় কমপ্রেশন · WebP + JPEG · সর্বোচ্চ ২০টি</span></div>
        <div class="uploader" data-uploader data-upload-url="<?= $pid ? '/admin/api/products/' . $pid . '/images' : '' ?>">
          <div class="img-grid" data-img-grid data-order-url="<?= $pid ? '/admin/api/products/' . $pid . '/images/order' : '' ?>">
            <?php foreach ($images as $i => $img): ?>
              <div class="img-item" data-id="<?= (int) $img['id'] ?>" draggable="true">
                <img src="<?= e(img_url($img['path'], 'sm')) ?>" alt="" width="120" height="120" loading="lazy">
                <?= $i === 0 ? '<span class="img-main">প্রধান</span>' : '' ?>
                <div class="img-actions">
                  <button type="button" data-img-left aria-label="বামে সরান"><i class="fa fa-angle-left"></i></button>
                  <button type="button" data-img-replace aria-label="পরিবর্তন"><i class="fa fa-refresh"></i></button>
                  <button type="button" data-img-delete aria-label="মুছুন"><i class="fa fa-trash"></i></button>
                  <button type="button" data-img-right aria-label="ডানে সরান"><i class="fa fa-angle-right"></i></button>
                </div>
              </div>
            <?php endforeach; ?>
          </div>
          <label class="dropzone" data-dropzone>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-img-input hidden>
            <i class="fa fa-cloud-upload"></i><span>ছবি টেনে আনুন বা ক্লিক করুন</span><small>JPG/PNG/WebP · সর্বোচ্চ ১০MB প্রতিটি</small>
          </label>
          <?php if (!$pid): ?><p class="tiny muted">নির্বাচিত ছবিগুলো পণ্য সংরক্ষণের পরে আপলোড হবে।</p><?php endif; ?>
          <input type="file" accept="image/*" data-img-replace-input hidden>
        </div>
      </section>

      <section class="card">
        <h3 class="card-title">সাইজ</h3>
        <p class="tiny muted">সাইজ থাকলে কাস্টমারকে অবশ্যই সাইজ নির্বাচন করতে হবে। ক্লিক করে স্টক-আউট চিহ্নিত করুন।</p>
        <div class="size-editor" data-size-editor>
          <div class="size-chips" data-size-chips>
            <?php foreach ($sizes as $s): ?>
              <span class="size-chip<?= $s['is_available'] ? '' : ' off' ?>"><input type="hidden" name="sizes[]" value="<?= e($s['size']) ?>"><?php if (!$s['is_available']): ?><input type="hidden" name="sizes_unavailable[]" value="<?= e($s['size']) ?>"><?php endif; ?><button type="button" data-size-toggle><?= e($s['size']) ?></button><button type="button" data-size-remove aria-label="মুছুন"><i class="fa fa-times"></i></button></span>
            <?php endforeach; ?>
          </div>
          <div class="row-btns"><input type="text" class="input grow" data-size-input placeholder="যেমন: M, L, XL, 40, 42" maxlength="40"><button type="button" class="btn btn-soft btn-sm" data-size-add>যোগ করুন</button></div>
          <div class="quick-sizes"><?php foreach (['S', 'M', 'L', 'XL', 'XXL', '38', '40', '42', '44'] as $qs): ?><button type="button" class="chip" data-size-quick="<?= $qs ?>"><?= $qs ?></button><?php endforeach; ?></div>
        </div>
      </section>

      <section class="card">
        <h3 class="card-title">সম্পর্কিত পণ্য</h3>
        <div class="picker" data-picker data-name="related[]">
          <div class="picked" data-picked><?php foreach ($related as $r): ?><span class="pick-chip"><input type="hidden" name="related[]" value="<?= (int) $r['id'] ?>"><?= e($r['name']) ?><button type="button" data-unpick aria-label="সরান"><i class="fa fa-times"></i></button></span><?php endforeach; ?></div>
          <div class="picker-search"><input type="search" class="input" placeholder="পণ্য খুঁজে যোগ করুন…" data-picker-input autocomplete="off"><div class="picker-results" data-picker-results hidden></div></div>
          <p class="tiny muted">খালি রাখলে একই ক্যাটাগরির পণ্য স্বয়ংক্রিয়ভাবে দেখাবে।</p>
        </div>
      </section>

      <section class="card">
        <h3 class="card-title">SEO</h3>
        <div class="field"><label>SEO টাইটেল</label><input name="seo_title" value="<?= e($v('seo_title')) ?>" maxlength="190"></div>
        <div class="field"><label>SEO বিবরণ</label><textarea name="seo_description" rows="2" maxlength="400"><?= e($v('seo_description')) ?></textarea></div>
        <div class="field"><label>কীওয়ার্ড</label><input name="seo_keywords" value="<?= e($v('seo_keywords')) ?>" maxlength="400" placeholder="কমা দিয়ে আলাদা করুন"></div>
        <div class="field"><label>OG ছবি (সোশ্যাল শেয়ার)</label>
          <?php if ($v('og_image')): ?><div class="og-prev"><img src="/<?= e($v('og_image')) ?>" alt="" width="160" height="84"><label class="small"><input type="checkbox" name="remove_og_image" value="1"> মুছে ফেলুন</label></div><?php endif; ?>
          <input type="file" name="og_image_file" accept="image/*"><p class="field-hint">খালি থাকলে প্রথম পণ্যের ছবি ব্যবহার হবে।</p></div>
      </section>
    </div>

    <div class="stack sticky-col">
      <section class="card">
        <h3 class="card-title">মূল্য</h3>
        <div class="field"><label>বিক্রয় মূল্য (৳) <span class="req">*</span></label><input name="price" value="<?= e($v('price') !== '' ? (float) $v('price') : '') ?>" inputmode="decimal" required data-price></div>
        <div class="grid-2">
          <div class="field"><label>পুরাতন মূল্য (৳)</label><input name="old_price" value="<?= e($v('old_price') ? (float) $v('old_price') : '') ?>" inputmode="decimal" data-old-price></div>
          <div class="field"><label>ডিসকাউন্ট %</label><input name="discount_percent" inputmode="decimal" data-discount placeholder="অটো"></div>
        </div>
      </section>
      <section class="card">
        <h3 class="card-title">স্টক</h3>
        <div class="grid-2">
          <div class="field"><label>বর্তমান স্টক</label><input name="stock" value="<?= (int) $v('stock', 0) ?>" inputmode="numeric"></div>
          <div class="field"><label>লো স্টক সীমা</label><input name="low_stock_threshold" value="<?= e($v('low_stock_threshold') ?? '') ?>" inputmode="numeric" placeholder="ডিফল্ট <?= bn_num(setting('low_stock_threshold')) ?>"></div>
        </div>
        <?php if ($pid): ?><p class="tiny muted">বিক্রি হয়েছে: <?= bn_num($v('sold', 0)) ?>টি</p><?php endif; ?>
      </section>
      <section class="card">
        <h3 class="card-title">অপশন</h3>
        <?php View::partial('admin/views/partials/switch', ['name' => 'is_active', 'label' => 'সক্রিয় (সাইটে দেখাবে)', 'checked' => $p ? (int) $p['is_active'] : 1]); ?>
        <?php View::partial('admin/views/partials/switch', ['name' => 'is_featured', 'label' => 'ফিচার্ড পণ্য', 'checked' => (int) $v('is_featured', 0)]); ?>
        <?php View::partial('admin/views/partials/switch', ['name' => 'free_delivery', 'label' => 'ফ্রি ডেলিভারি', 'checked' => (int) $v('free_delivery', 0)]); ?>
        <?php View::partial('admin/views/partials/switch', ['name' => 'is_combo_eligible', 'label' => 'কম্বোতে ব্যবহারযোগ্য', 'checked' => (int) $v('is_combo_eligible', 0)]); ?>
      </section>
      <section class="card">
        <h3 class="card-title"><i class="fa fa-bolt"></i> ফ্ল্যাশ সেল</h3>
        <?php View::partial('admin/views/partials/switch', ['name' => 'is_flash', 'label' => 'ফ্ল্যাশ সেলে যুক্ত করুন', 'checked' => (int) $v('is_flash', 0)]); ?>
        <div class="field"><label>ফ্ল্যাশ মূল্য (৳)</label><input name="flash_price" value="<?= e($v('flash_price') ? (float) $v('flash_price') : '') ?>" inputmode="decimal"></div>
        <div class="field"><label>শুরু</label><input type="datetime-local" name="flash_start" value="<?= e($dtl($v('flash_start'))) ?>"></div>
        <div class="field"><label>শেষ</label><input type="datetime-local" name="flash_end" value="<?= e($dtl($v('flash_end'))) ?>"></div>
      </section>
      <button class="btn btn-primary btn-block btn-cta" type="submit"><i class="fa fa-check"></i> <?= $pid ? 'আপডেট করুন' : 'পণ্য সংরক্ষণ করুন' ?></button>
    </div>
  </form>
</div>
