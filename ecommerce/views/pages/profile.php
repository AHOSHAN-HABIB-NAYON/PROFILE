<?php
/**
 * Profile (no account): saved checkout info on this device, appearance, app install, support, policies.
 * @var array $saved @var array $pages
 */
$wa = setting('whatsapp_number');
?>
<div class="profile-page">
  <section class="profile-hero">
    <span class="avatar"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
    <div>
      <h1 class="profile-name"><?= e($saved[0]['name'] ?? 'স্বাগতম!') ?></h1>
      <p class="profile-sub">অ্যাকাউন্ট ছাড়াই অর্ডার করুন — ক্যাশ অন ডেলিভারি</p>
    </div>
  </section>

  <div class="menu-list card">
    <a href="<?= e(url('/orders')) ?>" class="menu-item"><i class="fa-solid fa-receipt" aria-hidden="true"></i><span>আমার অর্ডার</span><i class="fa-solid fa-chevron-right chev" aria-hidden="true"></i></a>
    <a href="<?= e(url('/cart')) ?>" class="menu-item"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span>কার্ট</span><i class="fa-solid fa-chevron-right chev" aria-hidden="true"></i></a>
    <?php if (setting('dark_mode_enabled') === '1'): ?>
    <button type="button" class="menu-item" data-action="theme-toggle"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><span>ডার্ক মোড</span><span class="switch" data-theme-switch aria-hidden="true"></span></button>
    <?php endif; ?>
    <?php if (setting('pwa_enabled') === '1'): ?>
    <button type="button" class="menu-item" data-action="pwa-install" data-install-item hidden><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i><span>অ্যাপ ইনস্টল করুন</span><i class="fa-solid fa-download chev" aria-hidden="true"></i></button>
    <?php endif; ?>
  </div>

  <?php if ($saved): ?>
  <section class="card saved-card">
    <h2 class="card-title"><i class="fa-solid fa-address-card" aria-hidden="true"></i> সংরক্ষিত ঠিকানা</h2>
    <?php foreach ($saved as $s): ?>
      <div class="saved-item">
        <strong><?= e($s['name']) ?></strong> • <?= e(mask_phone($s['phone'])) ?>
        <p class="muted small"><?= e($s['address']) ?>, <?= e($s['district']) ?></p>
      </div>
    <?php endforeach; ?>
    <p class="muted small">এই তথ্য শুধু এই ডিভাইসে চেকআউট দ্রুত করতে ব্যবহার হয়।</p>
  </section>
  <?php endif; ?>

  <div class="menu-list card">
    <p class="menu-label">সাপোর্ট</p>
    <?php if ($wa): ?><a href="<?= e(whatsapp_link((string)$wa, (string)setting('whatsapp_message'))) ?>" class="menu-item" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>হোয়াটসঅ্যাপে যোগাযোগ</span><i class="fa-solid fa-arrow-up-right-from-square chev" aria-hidden="true"></i></a><?php endif; ?>
    <?php if (setting('contact_phone')): ?><a href="tel:<?= e(preg_replace('/[^\d+]/', '', (string)setting('contact_phone'))) ?>" class="menu-item"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>কল করুন</span><i class="fa-solid fa-chevron-right chev" aria-hidden="true"></i></a><?php endif; ?>
    <?php if (setting('messenger_url')): ?><a href="<?= e(setting('messenger_url')) ?>" class="menu-item" target="_blank" rel="noopener"><i class="fa-brands fa-facebook-messenger" aria-hidden="true"></i><span>মেসেঞ্জার</span><i class="fa-solid fa-arrow-up-right-from-square chev" aria-hidden="true"></i></a><?php endif; ?>
  </div>

  <div class="menu-list card">
    <p class="menu-label">নীতিমালা</p>
    <?php foreach ($pages as $slug => $pg): ?>
      <a href="<?= e(url('/page/' . $slug)) ?>" class="menu-item"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span><?= e($pg['title']) ?></span><i class="fa-solid fa-chevron-right chev" aria-hidden="true"></i></a>
    <?php endforeach; ?>
  </div>
</div>
