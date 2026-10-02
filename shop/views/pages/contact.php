<?php $wa = preg_replace('/\D/', '', (string) setting('whatsapp_number')); $phone = (string) setting('contact_phone'); ?>
<div class="page container narrow" data-page="contact">
  <h1 class="page-title">যোগাযোগ ও সাপোর্ট</h1>
  <p class="muted small mb-12">যেকোনো প্রশ্ন বা অর্ডার সংক্রান্ত সাহায্যের জন্য আমাদের সাথে যোগাযোগ করুন।</p>
  <div class="contact-grid">
    <?php if (Settings::on('whatsapp_enabled') && $wa): ?>
    <a class="contact-card" href="https://wa.me/<?= e($wa) ?>?text=<?= rawurlencode((string) setting('whatsapp_general_message')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa fa-whatsapp c-wa"></i><span><b>WhatsApp</b><small><?= e(setting('whatsapp_number')) ?></small></span></a>
    <?php endif; ?>
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
