<?php
/**
 * Persistent widgets that survive SPA navigation:
 * AI assistant + human support launcher, PWA install sheet.
 */
$aiOn = AI::enabled();
$tgOn = setting('support.telegram_enabled') == 1 && setting('support.telegram_url') !== '';
$waOn = setting('support.whatsapp_enabled') == 1 && setting('support.whatsapp_url') !== '';
$appIcon = upload_url(setting('pwa_icon'), url('assets/icons/icon-192.png'));
?>
<div class="assist" id="assist">
  <?php if ($tgOn || $waOn): ?>
  <button type="button" class="assist-fab assist-fab-sm" data-action="chat-open" data-tab="human" aria-label="হিউম্যান সাপোর্ট"><?= icon('headset') ?></button>
  <?php endif; ?>
  <?php if ($aiOn): ?>
  <button type="button" class="assist-fab" data-action="chat-open" data-tab="ai" aria-label="<?= e(setting('ai_name')) ?>"><?= icon('bot') ?><span class="assist-fab-label"><?= e(setting('ai_name')) ?></span></button>
  <?php endif; ?>
  <section class="chat-panel" id="chat-panel" role="dialog" aria-modal="false" aria-label="সহায়তা" hidden>
    <header class="chat-head">
      <span class="chat-avatar"><?= icon('bot') ?></span>
      <div class="chat-title"><b><?= e(setting('ai_name', 'AI সহকারী')) ?></b><small><span class="live-dot"></span> সবসময় অনলাইন</small></div>
      <button type="button" class="icon-btn" data-action="chat-close" aria-label="বন্ধ করুন"><?= icon('x') ?></button>
    </header>
    <div class="chat-tabs" role="tablist">
      <?php if ($aiOn): ?><button type="button" role="tab" data-chat-tab="ai" class="active"><?= icon('sparkles') ?> AI সহকারী</button><?php endif; ?>
      <button type="button" role="tab" data-chat-tab="human" class="<?= $aiOn ? '' : 'active' ?>"><?= icon('headset') ?> হিউম্যান সাপোর্ট</button>
    </div>
    <?php if ($aiOn): ?>
    <div class="chat-pane" data-chat-pane="ai">
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <div class="chat-quick" id="chat-quick"></div>
      <form class="chat-form" id="chat-form" autocomplete="off">
        <input class="input" name="message" maxlength="500" placeholder="আপনার প্রশ্ন লিখুন..." aria-label="বার্তা" required>
        <button type="submit" class="btn btn-primary btn-icon" aria-label="পাঠান"><?= icon('send') ?></button>
      </form>
    </div>
    <?php endif; ?>
    <div class="chat-pane" data-chat-pane="human" <?= $aiOn ? 'hidden' : '' ?>>
      <div class="human-pane">
        <p class="muted"><?= e(setting('support.description')) ?></p>
        <?php if ($tgOn): ?>
        <a class="contact-card tg" href="<?= e(setting('support.telegram_url')) ?>" target="_blank" rel="noopener">
          <span class="contact-ic"><?= icon('telegram') ?></span>
          <span><b><?= e(setting('support.telegram_name')) ?></b><small>@<?= e(ltrim((string) setting('support.telegram_username'), '@')) ?></small></span><?= icon('external') ?>
        </a>
        <?php endif; ?>
        <?php if ($waOn): ?>
        <a class="contact-card wa" href="<?= e(setting('support.whatsapp_url')) ?>" target="_blank" rel="noopener">
          <span class="contact-ic"><?= icon('whatsapp') ?></span>
          <span><b><?= e(setting('support.whatsapp_name')) ?></b><small><?= e(setting('support.whatsapp_number')) ?></small></span><?= icon('external') ?>
        </a>
        <?php endif; ?>
        <?php if (!$tgOn && !$waOn): ?><p class="muted">এই মুহূর্তে সরাসরি সাপোর্ট বন্ধ আছে।</p><?php endif; ?>
        <p class="hours"><?= icon('clock') ?> <?= e(setting('support.working_hours')) ?></p>
        <a href="<?= e(url('/support')) ?>" class="btn btn-ghost btn-block" data-link>সাপোর্ট পেজ দেখুন</a>
      </div>
    </div>
  </section>
</div>

<div class="sheet-backdrop" id="install-sheet" hidden>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
    <div class="sheet-grip"></div>
    <div class="install-head">
      <img src="<?= e($appIcon) ?>" alt="" width="60" height="60" class="install-icon">
      <div>
        <h3 id="install-title">আপনার মোবাইলে অ্যাপটি ইনস্টল করুন</h3>
        <p>দ্রুত অ্যাক্সেস, স্মুথ অভিজ্ঞতা এবং অ্যাপের মতো ব্যবহার করুন।</p>
      </div>
    </div>
    <ul class="install-perks">
      <li><?= icon('zap') ?> এক ট্যাপে খুলুন</li>
      <li><?= icon('bell') ?> পুশ নোটিফিকেশন</li>
      <li><?= icon('cloud-off') ?> দুর্বল নেটেও চলে</li>
    </ul>
    <div class="install-manual" hidden>
      <p><b>ইনস্টল করার নিয়ম:</b></p>
      <p data-install-steps>Browser Menu → Add to Home Screen</p>
    </div>
    <div class="install-done" hidden><?= icon('check-circle') ?> অ্যাপ সফলভাবে ইনস্টল হয়েছে ✓</div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-block" data-action="install-now"><?= icon('download') ?> এখনই ইনস্টল করুন</button>
      <button type="button" class="btn btn-ghost btn-block" data-action="install-later">পরে</button>
    </div>
  </div>
</div>
