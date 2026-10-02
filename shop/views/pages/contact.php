<?php $wa = preg_replace('/\D/', '', (string) setting('whatsapp_number')); $phone = (string) setting('contact_phone'); ?>
<div class="page container narrow" data-page="contact">
  <h1 class="page-title only-desktop-block">যোগাযোগ ও সাপোর্ট</h1>
  <?php if (Settings::on('whatsapp_enabled') && $wa): ?>
  <section class="card wa-hero">
    <span class="wa-icon"><i class="fa fa-whatsapp"></i></span>
    <h2>WhatsApp সাপোর্ট</h2>
    <a class="wa-number" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener" data-no-spa><?= e(setting('whatsapp_number')) ?></a>
    <p class="small muted">অর্ডার, ডেলিভারি বা পণ্য সম্পর্কে যেকোনো প্রশ্নে মেসেজ দিন — <?= e(setting('business_hours')) ?></p>
    <div class="wa-preview"><span class="tiny muted">স্বয়ংক্রিয় মেসেজ:</span><p><?= nl2br(e((string) setting('whatsapp_general_message'))) ?></p></div>
    <a class="btn btn-wa btn-block" href="https://wa.me/<?= e($wa) ?>?text=<?= rawurlencode((string) setting('whatsapp_general_message')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa fa-whatsapp"></i> WhatsApp এ চ্যাট করুন</a>
  </section>
  <?php endif; ?>
  <section class="card cod-card mt-16">
    <h2 class="card-title"><i class="fa fa-money"></i> ক্যাশ অন ডেলিভারি</h2>
    <ul class="checks">
      <li><i class="fa fa-check-circle"></i> অর্ডার নিশ্চিত করার পর পণ্য হাতে পেয়ে টাকা পরিশোধ করুন।</li>
      <li><i class="fa fa-check-circle"></i> ডেলিভারি চার্জ: ঢাকার ভিতরে <?= money(setting('delivery_inside_dhaka')) ?>, ঢাকার বাইরে <?= money(setting('delivery_outside_dhaka')) ?>।</li>
      <li><i class="fa fa-check-circle"></i> <?= e(setting('delivery_info')) ?></li>
    </ul>
    <p class="tiny muted"><i class="fa fa-shield"></i> সুরক্ষিত ও নির্ভরযোগ্য ডেলিভারি।</p>
  </section>
  <h2 class="section-title mt-16 mb-12">অন্যান্য মাধ্যম</h2>
  <div class="contact-grid">
    <?php if ($phone): ?>
    <a class="contact-card" href="tel:<?= e(preg_replace('/[^\d+]/', '', $phone)) ?>" data-no-spa><i class="fa fa-phone c-call"></i><span><b>কল করুন</b><small><?= e($phone) ?></small></span></a>
    <?php endif; ?>
    <?php if (setting('facebook_url')): ?>
    <a class="contact-card" href="<?= e(setting('facebook_url')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa fa-facebook-square c-fb"></i><span><b>Facebook</b><small>মেসেজ পাঠান</small></span></a>
    <?php endif; ?>
    <?php if (setting('contact_email')): ?>
    <a class="contact-card" href="mailto:<?= e(setting('contact_email')) ?>" data-no-spa><i class="fa fa-envelope c-mail"></i><span><b>ইমেইল</b><small><?= e(setting('contact_email')) ?></small></span></a>
    <?php endif; ?>
  </div>
  <section class="card mt-16">
    <h2 class="card-title">ব্যবসায়িক তথ্য</h2>
    <dl class="spec">
      <div><dt>প্রতিষ্ঠান</dt><dd><?= e(setting('site_name')) ?></dd></div>
      <?php if (setting('contact_address')): ?><div><dt>ঠিকানা</dt><dd><?= e(setting('contact_address')) ?></dd></div><?php endif; ?>
      <div><dt>সাপোর্ট সময়</dt><dd><?= e(setting('business_hours')) ?></dd></div>
      <div><dt>পেমেন্ট</dt><dd>শুধুমাত্র ক্যাশ অন ডেলিভারি</dd></div>
      <div><dt>ডেলিভারি</dt><dd><?= e(setting('delivery_info')) ?></dd></div>
    </dl>
    <?php if (setting('business_info')): ?><p class="small mt-12"><?= nl2br(e(setting('business_info'))) ?></p><?php endif; ?>
  </section>
</div>
