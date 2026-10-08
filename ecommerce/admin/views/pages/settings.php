<?php
/**
 * Settings (tabbed). Fields are generated from AdminSettingsController::TABS.
 * @var string $tab @var array $tabs @var array $s
 */
$labels = [
    'store_name' => 'Store name', 'store_tagline' => 'Tagline', 'currency' => 'Currency code', 'currency_symbol' => 'Currency symbol', 'bengali_digits' => 'Show prices with Bengali digits (৳১,২৫০)',
    'contact_phone' => 'Contact phone', 'contact_email' => 'Contact email', 'contact_address' => 'Address',
    'facebook_url' => 'Facebook page URL', 'messenger_url' => 'Messenger link (m.me/…)', 'instagram_url' => 'Instagram URL', 'youtube_url' => 'YouTube URL', 'tiktok_url' => 'TikTok URL',
    'whatsapp_enabled' => 'Show floating WhatsApp button', 'whatsapp_number' => 'WhatsApp number (with country code)', 'whatsapp_position' => 'Button position',
    'whatsapp_greeting' => 'Greeting bubble text', 'whatsapp_message' => 'Default chat message', 'text_whatsapp_order' => 'Order support message — placeholders: {order} {name} {phone}',
    'primary_color' => 'Primary', 'primary_dark' => 'Primary (dark)', 'secondary_color' => 'Secondary', 'accent_color' => 'Accent',
    'dark_mode_enabled' => 'Allow customers to switch to dark mode', 'default_theme' => 'Default theme',
    'home_sections' => 'Sections', 'hero_title' => 'Hero title (shown when no banners)', 'hero_subtitle' => 'Hero subtitle', 'flash_sale_title' => 'Flash sale title', 'flash_sale_ends_at' => 'Flash sale ends at (countdown; section hides after)',
    'cta_title' => 'CTA title', 'cta_text' => 'CTA text', 'cta_button' => 'CTA button text', 'cta_link' => 'CTA link (empty = WhatsApp)',
    'announcement_enabled' => 'Show announcement bar', 'announcement_text' => 'Announcement text', 'products_per_page' => 'Products per page',
    'low_stock_threshold' => 'Low stock alert threshold', 'allow_backorder' => 'Allow ordering out-of-stock products (all products)', 'coupon_enabled' => 'Enable coupons', 'geoip_enabled' => 'Look up approximate IP location for new orders',
    'text_checkout_note' => 'Checkout note', 'text_order_success_title' => 'Confirmation title', 'text_order_success_body' => 'Confirmation message', 'text_order_success_call' => 'Confirmation call note',
    'seo_title' => 'Home page title', 'seo_description' => 'Default meta description', 'seo_keywords' => 'Keywords',
    'page_about' => 'About us', 'page_privacy' => 'Privacy policy', 'page_terms' => 'Terms', 'page_return' => 'Return & refund policy',
    'pwa_enabled' => 'Enable installable app (PWA) & offline page', 'pwa_short_name' => 'App short name (≤12 chars)', 'pwa_theme_color' => 'App theme colour', 'pwa_bg_color' => 'Splash background',
    'maintenance_mode' => 'Maintenance mode (store hidden; admins can still browse)', 'maintenance_message' => 'Maintenance message', 'google_client_id' => 'Google OAuth Client ID (admin Google Sign-In)',
];
$sectionNames = ['hero' => 'Hero / banner slider', 'categories' => 'Categories', 'flash' => 'Flash sale', 'featured' => 'Featured products', 'coupon' => 'Coupon highlight',
    'combo' => 'Combo products', 'free_delivery' => 'Free delivery products', 'popular' => 'Popular products', 'latest' => 'Latest products', 'cta' => 'Support CTA'];
$uploads = ['general' => ['logo' => 'Logo', 'favicon' => 'Favicon', 'og_image' => 'Default share (OG) image'], 'pwa' => ['pwa_icon' => 'App icon (square, 512px+)']];
?>
<div class="a-page">
  <div class="page-head">
    <div><h1 class="a-title">Settings</h1><p class="muted small">Changes apply instantly and clear the storefront cache.</p></div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="post" data-url="<?= e(url('/admin/settings/cache-clear')) ?>"><i class="fa-solid fa-broom" aria-hidden="true"></i> Clear cache</button>
  </div>
  <nav class="settings-tabs" aria-label="Settings sections">
    <?php foreach ($tabs as $k => $t): ?><a href="<?= e(url('/admin/settings', ['tab' => $k])) ?>" class="<?= $tab === $k ? 'is-active' : '' ?>"><i class="<?= e($t['icon']) ?>" aria-hidden="true"></i> <?= e($t['label']) ?></a><?php endforeach; ?>
  </nav>

  <?php if (isset($uploads[$tab])): ?>
  <section class="a-card">
    <h2 class="a-card-title"><i class="fa-solid fa-image" aria-hidden="true"></i> Branding images</h2>
    <div class="upload-grid">
      <?php foreach ($uploads[$tab] as $field => $label): ?>
        <form class="upload-tile" method="post" action="<?= e(url('/admin/settings/upload/' . $field)) ?>" enctype="multipart/form-data" data-ajax data-no-spa>
          <span class="label"><?= e($label) ?></span>
          <span class="upload-preview"><?php if ($s[$field]): ?><img src="<?= e(upload_url($s[$field])) ?>" alt="" loading="lazy"><?php else: ?><i class="fa-regular fa-image" aria-hidden="true"></i><?php endif; ?></span>
          <label class="sr-only" for="up-<?= e($field) ?>">Choose <?= e($label) ?></label>
          <input id="up-<?= e($field) ?>" class="input input-sm" type="file" name="file" accept="image/png,image/jpeg,image/webp" required>
          <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-upload" aria-hidden="true"></i> Upload</button>
        </form>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <form class="a-card settings-form" method="post" action="<?= e(url('/admin/settings')) ?>" data-ajax data-no-spa>
    <input type="hidden" name="tab" value="<?= e($tab) ?>">
    <h2 class="a-card-title"><i class="<?= e($tabs[$tab]['icon']) ?>" aria-hidden="true"></i> <?= e($tabs[$tab]['label']) ?></h2>
    <div class="<?= $tab === 'theme' ? 'grid-4' : 'settings-fields' ?>">
    <?php foreach ($tabs[$tab]['keys'] as $key => $type): [$kind, $arg] = array_pad(explode(':', $type, 2), 2, ''); $val = (string)($s[$key] ?? ''); $id = 'st-' . $key; ?>
      <?php if ($kind === 'bool'): ?>
        <label class="switch-row"><input type="checkbox" name="<?= e($key) ?>" value="1"<?= $val === '1' ? ' checked' : '' ?>><span class="toggle"></span><span><?= e($labels[$key] ?? $key) ?></span></label>
      <?php elseif ($kind === 'sections'): ?>
        <div class="field">
          <span class="label">Home sections — drag or use arrows to reorder</span>
          <ol class="section-list" data-sortable-list>
            <?php foreach (json_list($val) as $sec): ?>
              <li class="section-item" draggable="true">
                <span class="drag"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>
                <input type="hidden" name="section_key[]" value="<?= e($sec['key']) ?>">
                <label class="switch-row compact"><input type="checkbox" name="section_enabled[<?= e($sec['key']) ?>]" value="1"<?= !empty($sec['enabled']) ? ' checked' : '' ?>><span class="toggle"></span><span><?= e($sectionNames[$sec['key']] ?? $sec['key']) ?></span></label>
                <label class="sr-only" for="sl-<?= e($sec['key']) ?>">Items</label>
                <input id="sl-<?= e($sec['key']) ?>" class="input input-sm sec-limit" type="number" min="1" max="48" name="section_limit[]" value="<?= (int)$sec['limit'] ?>" title="Number of items">
                <label class="sr-only" for="ss-<?= e($sec['key']) ?>">Order</label>
                <select id="ss-<?= e($sec['key']) ?>" class="input input-sm" name="section_sort[]" title="Product order">
                  <?php foreach (['manual' => 'Manual', 'latest' => 'Latest', 'popular' => 'Popular', 'price_asc' => 'Price ↑', 'price_desc' => 'Price ↓'] as $sk => $sl): ?><option value="<?= e($sk) ?>"<?= ($sec['sort'] ?? '') === $sk ? ' selected' : '' ?>><?= e($sl) ?></option><?php endforeach; ?>
                </select>
                <span class="move-btns"><button type="button" class="icon-btn icon-btn-sm" data-action="list-move" data-dir="-1" aria-label="Move up"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button><button type="button" class="icon-btn icon-btn-sm" data-action="list-move" data-dir="1" aria-label="Move down"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button></span>
              </li>
            <?php endforeach; ?>
          </ol>
        </div>
      <?php elseif ($kind === 'html'): ?>
        <div class="field"><span class="label"><?= e($labels[$key] ?? $key) ?></span><?= View::render('admin:partials/rich-editor', ['name' => $key, 'value' => $val, 'id' => $id]) ?></div>
      <?php else: ?>
        <div class="field">
          <label class="label" for="<?= e($id) ?>"><?= e($labels[$key] ?? $key) ?></label>
          <?php if ($kind === 'textarea'): ?>
            <textarea id="<?= e($id) ?>" class="input" name="<?= e($key) ?>" rows="4"><?= e($val) ?></textarea>
          <?php elseif ($kind === 'select'): ?>
            <select id="<?= e($id) ?>" class="input" name="<?= e($key) ?>"><?php foreach (explode(',', $arg) as $opt): ?><option value="<?= e($opt) ?>"<?= $val === $opt ? ' selected' : '' ?>><?= e(ucfirst($opt)) ?></option><?php endforeach; ?></select>
          <?php elseif ($kind === 'color'): ?>
            <span class="color-field"><input id="<?= e($id) ?>" type="color" class="color-input lg" name="<?= e($key) ?>" value="<?= e($val) ?>" data-color-live="<?= e(['primary_color' => '--primary', 'primary_dark' => '--primary-dark', 'secondary_color' => '--secondary', 'accent_color' => '--accent'][$key] ?? '') ?>"><code><?= e($val) ?></code></span>
          <?php elseif ($kind === 'datetime'): ?>
            <input id="<?= e($id) ?>" class="input" type="datetime-local" name="<?= e($key) ?>" value="<?= e($val ? date('Y-m-d\TH:i', strtotime($val)) : '') ?>">
          <?php else: ?>
            <input id="<?= e($id) ?>" class="input" type="<?= $kind === 'int' ? 'number' : ($kind === 'email' ? 'email' : 'text') ?>" name="<?= e($key) ?>" value="<?= e($val) ?>">
          <?php endif; ?>
        </div>
      <?php endif; ?>
    <?php endforeach; ?>
    </div>
    <?php if ($tab === 'theme'): ?>
      <div class="theme-preview"><span class="btn btn-primary btn-sm">Primary button</span><span class="badge badge-primary">Badge</span><span class="price">৳১,২৫০</span></div>
    <?php endif; ?>
    <?php if ($tab === 'system'): ?>
      <p class="muted small">Google Sign-In: create an OAuth client (Web) in Google Cloud Console, add this site as an authorised JavaScript origin, and paste the Client ID here. Only existing admin emails can sign in.</p>
    <?php endif; ?>
    <div class="form-actions"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save settings</button></div>
  </form>
</div>
