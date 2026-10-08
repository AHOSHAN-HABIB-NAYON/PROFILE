<?php
/**
 * Floating WhatsApp support button (admin: enable, number, position, greeting).
 */
if (setting('whatsapp_enabled') !== '1' || !setting('whatsapp_number')) {
    return;
}
$pos = setting('whatsapp_position') === 'left' ? 'left' : 'right';
?>
<div class="wa-float wa-<?= e($pos) ?>">
  <span class="wa-greeting" data-wa-greeting hidden><?= e(setting('whatsapp_greeting')) ?></span>
  <a class="wa-btn" href="<?= e(whatsapp_link((string)setting('whatsapp_number'), (string)setting('whatsapp_message'))) ?>" target="_blank" rel="noopener" aria-label="হোয়াটসঅ্যাপে যোগাযোগ করুন" data-action="wa-click">
    <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
  </a>
</div>
