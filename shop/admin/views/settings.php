<?php
/** @var array $s @var array $seo */
$t = static fn (string $k, string $label, string $type = 'text', string $hint = '', array $attr = []) =>
    '<div class="field"><label for="st-' . e($k) . '">' . e($label) . '</label><input id="st-' . e($k) . '" type="' . $type . '" name="' . e($k) . '" value="' . e($s[$k] ?? '') . '"' .
    implode('', array_map(static fn ($a, $v) => ' ' . $a . '="' . e($v) . '"', array_keys($attr), $attr)) . '>' . ($hint ? '<p class="field-hint">' . e($hint) . '</p>' : '') . '</div>';
$secret = static fn (string $k, string $label, string $hint = '') =>
    '<div class="field"><label>' . e($label) . '</label><input type="password" name="' . e($k) . '" autocomplete="off" placeholder="' . (!empty($s[$k]) ? '•••••••• (সংরক্ষিত — পরিবর্তনে নতুন মান দিন)' : 'দিন') . '">' . ($hint ? '<p class="field-hint">' . e($hint) . '</p>' : '') . '</div>';
$ta = static fn (string $k, string $label, int $rows = 3) => '<div class="field"><label>' . e($label) . '</label><textarea name="' . e($k) . '" rows="' . $rows . '">' . e($s[$k] ?? '') . '</textarea></div>';
$sw = static function (string $k, string $label, string $hint = '') use ($s) { View::partial('admin/views/partials/switch', ['name' => $k, 'label' => $label, 'hint' => $hint, 'checked' => ($s[$k] ?? '0') === '1']); };
$sel = static fn (string $k, string $label, array $opts) => '<div class="field"><label>' . e($label) . '</label><select name="' . e($k) . '">' . implode('', array_map(static fn ($v, $l) => '<option value="' . e($v) . '"' . ((string) ($s[$k] ?? '') === (string) $v ? ' selected' : '') . '>' . e($l) . '</option>', array_keys($opts), $opts)) . '</select></div>';
$img = static fn (string $k, string $label, string $hint) => '<div class="field"><label>' . e($label) . '</label>' . (!empty($s[$k]) ? '<div class="og-prev"><img src="/' . e($s[$k]) . '" alt="" width="64" height="64"><label class="small"><input type="checkbox" name="remove_' . e($k) . '" value="1"> মুছুন</label></div>' : '') . '<input type="file" name="' . e($k) . '_file" accept="image/*"><p class="field-hint">' . e($hint) . '</p></div>';
$metaStatus = ['success' => ['সফল', 'pill-green'], 'error' => ['ত্রুটি', 'pill-red'], 'not_configured' => ['কনফিগার করা হয়নি', '']][$s['meta_status'] ?? 'not_configured'] ?? ['—', ''];
$tabs = ['general' => 'সাধারণ', 'contact' => 'যোগাযোগ', 'delivery' => 'ডেলিভারি', 'home' => 'হোমপেজ', 'features' => 'ফিচার', 'protection' => 'অর্ডার সুরক্ষা', 'fraud' => 'ফ্রড চেক', 'tracking' => 'ট্র্যাকিং', 'seo' => 'SEO', 'pwa' => 'PWA ও থিম', 'system' => 'সিস্টেম'];
?>
<div class="page-a" data-page="settings">
  <div class="tabs-scroll" role="tablist" data-tabs>
    <?php $first = true; foreach ($tabs as $k => $l): ?><button type="button" class="chip<?= $first ? ' active' : '' ?>" data-tab="<?= $k ?>" role="tab"><?= $l ?></button><?php $first = false; endforeach; ?>
  </div>

  <form class="card tab-pane" data-pane="general" data-api="/admin/api/settings/save" data-reload>
    <h3 class="card-title">ব্র্যান্ডিং</h3>
    <?= $t('site_name', 'সাইটের নাম') ?><?= $t('site_tagline', 'ট্যাগলাইন') ?>
    <div class="grid-2"><?= $img('logo', 'লোগো', 'PNG/WebP, স্বচ্ছ ব্যাকগ্রাউন্ড ভালো') ?><?= $img('favicon', 'ফেভিকন', 'বর্গাকার PNG, কমপক্ষে ৬৪×৬৪') ?></div>
    <div class="field"><label>প্রাইমারি রং</label><input type="color" name="primary_color" value="<?= e($s['primary_color']) ?>" class="color-input"></div>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="contact" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">যোগাযোগ ও WhatsApp</h3>
    <div class="grid-2"><?= $t('contact_phone', 'ফোন নম্বর') ?><?= $t('contact_email', 'ইমেইল', 'email') ?></div>
    <?= $t('facebook_url', 'Facebook পেজ URL', 'url') ?><?= $t('contact_address', 'ঠিকানা') ?><?= $t('business_hours', 'সাপোর্ট সময়') ?><?= $ta('business_info', 'ব্যবসায়িক তথ্য') ?>
    <?php $sw('whatsapp_enabled', 'ফ্লোটিং WhatsApp বাটন'); ?>
    <?= $t('whatsapp_number', 'WhatsApp নম্বর', 'text', 'আন্তর্জাতিক ফরম্যাটে, যেমন +8801757827996') ?>
    <?= $ta('whatsapp_message', 'অর্ডার সংক্রান্ত মেসেজ ({order_id} স্বয়ংক্রিয়ভাবে বসবে)', 5) ?>
    <?= $ta('whatsapp_general_message', 'সাধারণ মেসেজ', 2) ?>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="delivery" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">ডেলিভারি চার্জ</h3>
    <?php $sw('delivery_enabled', 'ডেলিভারি চার্জ চালু', 'বন্ধ করলে সব অর্ডারে ডেলিভারি চার্জ শূন্য'); ?>
    <div class="grid-2"><?= $t('delivery_inside_dhaka', 'ঢাকার ভিতরে (৳)', 'text', '', ['inputmode' => 'decimal']) ?><?= $t('delivery_outside_dhaka', 'ঢাকার বাইরে (৳)', 'text', '', ['inputmode' => 'decimal']) ?></div>
    <?= $t('dhaka_keywords', 'ঢাকা শনাক্তকরণ কীওয়ার্ড', 'text', 'কাস্টমারের লেখা জেলায় এগুলোর কোনোটি থাকলে "ঢাকার ভিতরে" ধরা হবে (কমা দিয়ে)') ?>
    <?= $ta('delivery_info', 'ডেলিভারি তথ্য', 2) ?><?= $ta('cod_info', 'ক্যাশ অন ডেলিভারি তথ্য', 2) ?>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="home" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">হোমপেজ সেকশন</h3>
    <div class="grid-2 switches">
      <?php foreach (['home_banner' => 'হিরো ব্যানার', 'home_categories' => 'ক্যাটাগরি', 'home_coupon' => 'কুপন হাইলাইট', 'home_flash' => 'ফ্ল্যাশ সেল', 'home_featured' => 'ফিচার্ড পণ্য', 'home_combo' => 'কম্বো', 'home_free_delivery' => 'ফ্রি ডেলিভারি', 'home_products' => 'নতুন পণ্য', 'home_recommended' => 'প্রস্তাবিত পণ্য', 'home_info' => 'COD/ডেলিভারি/সাপোর্ট তথ্য'] as $k => $l) { $sw($k, $l); } ?>
    </div>
    <h3 class="card-title mt-16">কতগুলো পণ্য দেখাবে</h3>
    <div class="grid-3"><?= $t('home_featured_limit', 'ফিচার্ড', 'number', '', ['min' => 1, 'max' => 48]) ?><?= $t('home_products_limit', 'নতুন পণ্য', 'number', '', ['min' => 1, 'max' => 48]) ?><?= $t('home_flash_limit', 'ফ্ল্যাশ সেল', 'number', '', ['min' => 1, 'max' => 48]) ?><?= $t('home_free_limit', 'ফ্রি ডেলিভারি', 'number', '', ['min' => 1, 'max' => 48]) ?><?= $t('home_recommended_limit', 'প্রস্তাবিত', 'number', '', ['min' => 1, 'max' => 48]) ?></div>
    <h3 class="card-title mt-16">গ্রিড ও পেজিনেশন</h3>
    <div class="grid-3"><?= $sel('grid_mobile', 'মোবাইল কলাম', [1 => '১', 2 => '২', 3 => '৩']) ?><?= $sel('grid_tablet', 'ট্যাবলেট কলাম', [2 => '২', 3 => '৩', 4 => '৪', 5 => '৫']) ?><?= $sel('grid_desktop', 'ডেস্কটপ কলাম', [3 => '৩', 4 => '৪', 5 => '৫', 6 => '৬']) ?></div>
    <div class="field"><label>প্রতি পেজে পণ্য</label>
      <div class="seg wrap"><?php foreach ([8, 12, 16, 20, 24] as $n): ?><label><input type="radio" name="products_per_page" value="<?= $n ?>"<?= (int) $s['products_per_page'] === $n ? ' checked' : '' ?>><span><?= bn_num($n) ?></span></label><?php endforeach; ?>
        <label><input type="radio" name="products_per_page" value="custom" data-custom-radio<?= in_array((int) $s['products_per_page'], [8, 12, 16, 20, 24], true) ? '' : ' checked' ?>><span>কাস্টম</span></label></div>
      <input type="number" class="input mt-8" min="4" max="60" data-custom-value value="<?= (int) $s['products_per_page'] ?>" aria-label="কাস্টম সংখ্যা"></div>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="features" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">ফিচার নিয়ন্ত্রণ</h3>
    <?php $sw('coupon_enabled', 'কুপন সিস্টেম'); $sw('flash_enabled', 'ফ্ল্যাশ সেল'); $sw('combo_enabled', 'কম্বো অফার'); $sw('free_delivery_enabled', 'প্রোডাক্ট-লেভেল ফ্রি ডেলিভারি'); ?>
    <?= $t('low_stock_threshold', 'ডিফল্ট লো স্টক সীমা', 'number', 'স্টক এই সংখ্যা বা তার নিচে গেলে Low Stock Alert', ['min' => 0]) ?>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="protection" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">ডাবল অর্ডার সুরক্ষা</h3>
    <?php $sw('order_limit_enabled', 'IP-ভিত্তিক অর্ডার সীমা চালু'); ?>
    <div class="grid-2"><?= $t('order_limit_count', 'সর্বোচ্চ অর্ডার', 'number', 'প্রতি IP থেকে', ['min' => 1]) ?><?= $t('order_limit_hours', 'সময়সীমা (ঘণ্টা)', 'number', '', ['min' => 1]) ?></div>
    <div class="grid-2"><?= $t('order_attempt_limit', 'অতিরিক্ত চেষ্টার সীমা', 'number', 'এতবার চেষ্টার পর IP ব্লক হবে', ['min' => 1]) ?><?= $sel('order_block_type', 'ব্লকের ধরন', ['temporary' => 'সাময়িক', 'lifetime' => 'স্থায়ী (লাইফটাইম)']) ?></div>
    <?= $t('order_block_hours', 'সাময়িক ব্লকের সময় (ঘণ্টা)', 'number', '', ['min' => 1]) ?>
    <p class="tiny muted">প্রতিটি অতিরিক্ত চেষ্টায় কাস্টমার সতর্কবার্তা পাবে এবং অ্যাডমিনকে নোটিফিকেশন পাঠানো হবে।</p>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="fraud" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">ফ্রড চেক (BDCourier)</h3>
    <?php $sw('fraud_enabled', 'ফ্রড চেক চালু'); $sw('fraud_auto_check', 'নতুন অর্ডারে স্বয়ংক্রিয় চেক', 'অর্ডারের পরে ব্যাকগ্রাউন্ডে চলে — কাস্টমারের গতি কমায় না'); ?>
    <?= $secret('bdcourier_api_key', 'BDCourier API Key', 'সার্ভারে সংরক্ষিত; .env-এর BDCOURIER_API_KEY-ও ব্যবহার করা যায়') ?>
    <?= $t('bdcourier_endpoint', 'API Endpoint', 'url') ?>
    <div class="grid-3"><?= $t('fraud_review_below', '"যাচাই প্রয়োজন" — সফলতা % এর নিচে', 'number') ?><?= $t('fraud_high_below', '"উচ্চ ঝুঁকি" — সফলতা % এর নিচে', 'number') ?><?= $t('fraud_min_orders', 'উচ্চ ঝুঁকির জন্য ন্যূনতম অর্ডার', 'number') ?></div>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <form class="card tab-pane" data-pane="tracking" data-api="/admin/api/settings/save" data-reload hidden>
    <div class="card-head"><h3 class="card-title">Meta Pixel ও Conversions API</h3><span class="pill <?= $metaStatus[1] ?>"><?= $metaStatus[0] ?></span></div>
    <?php if (!empty($s['meta_status_message'])): ?><p class="tiny muted"><?= e($s['meta_status_message']) ?></p><?php endif; ?>
    <?php $sw('meta_enabled', 'Meta Pixel চালু'); $sw('meta_capi_enabled', 'Conversions API (সার্ভার-সাইড)'); ?>
    <?= $t('meta_pixel_id', 'Pixel ID', 'text', '', ['inputmode' => 'numeric']) ?>
    <?= $secret('meta_access_token', 'Access Token', 'শুধুমাত্র সার্ভারে থাকে, ব্রাউজারে যায় না') ?>
    <?= $t('meta_test_code', 'Test Event Code', 'text', 'টেস্টিং শেষে খালি করে দিন') ?>
    <p class="tiny muted">ইভেন্ট: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase (ব্রাউজার + সার্ভার, event_id দিয়ে ডিডুপ্লিকেশন)</p>
    <h3 class="card-title mt-16">Google Tag</h3>
    <?php $sw('gtag_enabled', 'Google Tag চালু'); ?>
    <?= $t('gtag_id', 'Google Tag ID', 'text', 'যেমন G-XXXXXXX') ?>
    <div class="grid-2"><?= $t('gads_conversion_id', 'Conversion ID', 'text', 'যেমন AW-123456789') ?><?= $t('gads_conversion_label', 'Conversion Label') ?></div>
    <?php $sw('analytics_enabled', 'অভ্যন্তরীণ অ্যানালিটিক্স'); ?>
    <div class="row-btns"><button class="btn btn-primary">সংরক্ষণ করুন</button><button type="button" class="btn btn-soft" data-post="/admin/api/settings/meta-test" data-reload><i class="fa fa-plug"></i> Meta সংযোগ পরীক্ষা</button></div>
  </form>

  <div class="tab-pane stack" data-pane="seo" hidden>
    <form class="card" data-api="/admin/api/settings/save" data-reload>
      <h3 class="card-title">গ্লোবাল SEO</h3>
      <?= $t('meta_title', 'মেটা টাইটেল') ?><?= $ta('meta_description', 'মেটা বিবরণ', 2) ?><?= $t('meta_keywords', 'কীওয়ার্ড') ?>
      <?= $img('og_image', 'ডিফল্ট সোশ্যাল (OG) ছবি', '১২০০×৬৩০ px প্রস্তাবিত') ?>
      <div class="grid-2"><?= $t('canonical_base', 'Canonical বেস URL', 'url', 'যেমন https://example.com') ?><?= $sel('robots', 'Robots', ['index,follow' => 'index, follow', 'noindex,nofollow' => 'noindex, nofollow (লুকানো)']) ?></div>
      <p class="tiny muted">Sitemap: <a href="/sitemap.xml" target="_blank" rel="noopener">/sitemap.xml</a> · Robots: <a href="/robots.txt" target="_blank" rel="noopener">/robots.txt</a> · Product structured data স্বয়ংক্রিয়।</p>
      <button class="btn btn-primary">সংরক্ষণ করুন</button>
    </form>
    <form class="card" data-api="/admin/api/settings/seo" data-reload>
      <h3 class="card-title">পেজ-ভিত্তিক SEO</h3>
      <?php foreach (['home' => 'হোম', 'products' => 'সকল পণ্য', 'categories' => 'ক্যাটাগরি', 'contact' => 'যোগাযোগ'] as $pk => $pl): $row = $seo[$pk] ?? []; ?>
        <fieldset class="fieldset"><legend><?= $pl ?></legend>
          <div class="field"><label>টাইটেল</label><input name="seo_<?= $pk ?>_title" value="<?= e($row['title'] ?? '') ?>"></div>
          <div class="field"><label>বিবরণ</label><input name="seo_<?= $pk ?>_description" value="<?= e($row['description'] ?? '') ?>"></div>
          <div class="field"><label>কীওয়ার্ড</label><input name="seo_<?= $pk ?>_keywords" value="<?= e($row['keywords'] ?? '') ?>"></div>
          <div class="field"><label>OG ছবি</label><input type="file" name="seo_<?= $pk ?>_og" accept="image/*"></div>
        </fieldset>
      <?php endforeach; ?>
      <button class="btn btn-primary">সংরক্ষণ করুন</button>
    </form>
  </div>

  <form class="card tab-pane" data-pane="pwa" data-api="/admin/api/settings/save" data-reload hidden>
    <h3 class="card-title">থিম</h3>
    <?= $sel('theme_default', 'ডিফল্ট থিম (প্রথম ভিজিটে)', ['light' => 'লাইট / ডে মোড', 'dark' => 'ডার্ক মোড']) ?>
    <?php $sw('theme_toggle', 'কাস্টমারকে থিম পরিবর্তনের অপশন দিন'); ?>
    <h3 class="card-title mt-16">PWA (অ্যাপ)</h3>
    <?php $sw('pwa_enabled', 'PWA / অফলাইন সাপোর্ট চালু'); ?>
    <?= $t('pwa_short_name', 'অ্যাপের ছোট নাম', 'text', '', ['maxlength' => 12]) ?>
    <div class="grid-2"><div class="field"><label>থিম রং</label><input type="color" name="pwa_theme_color" value="<?= e($s['pwa_theme_color']) ?>" class="color-input"></div><div class="field"><label>স্প্ল্যাশ ব্যাকগ্রাউন্ড</label><input type="color" name="pwa_bg_color" value="<?= e($s['pwa_bg_color']) ?>" class="color-input"></div></div>
    <div class="field"><label>অ্যাপ আইকন</label><?php if (is_file(BASE_PATH . '/uploads/branding/icon-192.png')): ?><img src="/uploads/branding/icon-192.png?v=<?= filemtime(BASE_PATH . '/uploads/branding/icon-192.png') ?>" alt="" width="48" height="48" class="mb-12"><?php endif; ?><input type="file" name="pwa_icon_file" accept="image/png,image/webp,image/jpeg"><p class="field-hint">বর্গাকার, কমপক্ষে ৫১২×৫১২ — ১৯২/৫১২ ও maskable আইকন স্বয়ংক্রিয় তৈরি হবে। Android TWA/APK র‍্যাপারের জন্য /manifest.json প্রস্তুত।</p></div>
    <button class="btn btn-primary">সংরক্ষণ করুন</button>
  </form>

  <div class="tab-pane stack" data-pane="system" hidden>
    <form class="card" data-api="/admin/api/settings/save" data-reload>
      <h3 class="card-title">মেইনটেন্যান্স মোড</h3>
      <?php $sw('maintenance', 'মেইনটেন্যান্স মোড চালু', 'কাস্টমাররা একটি সুন্দর মেইনটেন্যান্স পেজ দেখবে; লগইন করা অ্যাডমিন সাইট দেখতে পারবেন'); ?>
      <?= $ta('maintenance_message', 'মেসেজ', 2) ?>
      <button class="btn btn-primary">সংরক্ষণ করুন</button>
    </form>
    <form class="card" data-api="/admin/api/settings/password" data-reload>
      <h3 class="card-title">অ্যাডমিন অ্যাকাউন্ট (<?= e($admin['username']) ?>)</h3>
      <div class="field"><label>নাম</label><input name="name" value="<?= e($admin['name']) ?>"></div>
      <div class="field"><label>বর্তমান পাসওয়ার্ড</label><input type="password" name="current_password" autocomplete="current-password" required></div>
      <div class="field"><label>নতুন পাসওয়ার্ড</label><input type="password" name="new_password" autocomplete="new-password" required minlength="8"></div>
      <button class="btn btn-primary">পাসওয়ার্ড পরিবর্তন</button>
    </form>
    <section class="card">
      <h3 class="card-title">ক্যাশ</h3>
      <p class="small muted">সেটিংস ক্যাশ পরিষ্কার করুন (সাধারণত স্বয়ংক্রিয়)।</p>
      <button type="button" class="btn btn-soft btn-sm" data-post="/admin/api/cache/clear"><i class="fa fa-eraser"></i> ক্যাশ পরিষ্কার</button>
      <p class="tiny muted mt-8">PHP <?= PHP_VERSION ?> · অ্যাপ v<?= APP_VERSION ?></p>
    </section>
  </div>
</div>
