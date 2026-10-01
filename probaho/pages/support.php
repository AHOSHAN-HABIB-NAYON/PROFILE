<?php
/** Human support (Telegram / WhatsApp from Admin → Support) + AI assistant. */
View::$meta['title'] = 'সাপোর্ট';
View::$meta['description'] = (string) setting('support.description');
$tgOn = setting('support.telegram_enabled') == 1 && setting('support.telegram_url') !== '';
$waOn = setting('support.whatsapp_enabled') == 1 && setting('support.whatsapp_url') !== '';
?>
<?php if (!$user): ?><div class="container public-page"><div class="narrow"><?php endif; ?>
<div class="card center" style="padding:24px 18px">
  <span class="ic-box" style="margin:0 auto 10px;width:58px;height:58px"><?= icon('headset') ?></span>
  <h1 style="font-size:22px"><?= e(setting('support.title', 'সাপোর্ট')) ?></h1>
  <p class="muted"><?= e(setting('support.description')) ?></p>
  <div class="row wrap" style="justify-content:center;gap:8px">
    <?php if (setting('support.working_hours') !== ''): ?><span class="badge badge-brand"><?= icon('clock') ?> <?= e(setting('support.working_hours')) ?></span><?php endif; ?>
    <?php if (setting('support.response_message') !== ''): ?><span class="badge badge-ok"><?= e(setting('support.response_message')) ?></span><?php endif; ?>
  </div>
</div>
<div class="contact-grid" style="margin-top:14px">
  <?php if ($tgOn): ?>
  <div class="card">
    <div class="row"><span class="contact-ic" style="background:#229ed9;--tg-cut:#229ed9"><?= icon('telegram') ?></span><div class="grow"><b>Telegram Support</b><div class="small muted"><?= e(setting('support.telegram_name')) ?> · @<?= e(ltrim((string) setting('support.telegram_username'), '@')) ?></div></div></div>
    <a href="<?= e(setting('support.telegram_url')) ?>" class="btn btn-block" style="margin-top:14px;background:#229ed9;color:#fff" target="_blank" rel="noopener">Telegram-এ যোগাযোগ করুন</a>
  </div>
  <?php endif; ?>
  <?php if ($waOn): ?>
  <div class="card">
    <div class="row"><span class="contact-ic" style="background:#25d366;--wa-cut:#25d366"><?= icon('whatsapp') ?></span><div class="grow"><b>WhatsApp Support</b><div class="small muted"><?= e(setting('support.whatsapp_name')) ?> · <?= e(setting('support.whatsapp_number')) ?></div></div></div>
    <a href="<?= e(setting('support.whatsapp_url')) ?>" class="btn btn-block" style="margin-top:14px;background:#25d366;color:#fff" target="_blank" rel="noopener">WhatsApp-এ যোগাযোগ করুন</a>
  </div>
  <?php endif; ?>
</div>
<?php if (!$tgOn && !$waOn): ?><div class="alert alert-info" style="margin-top:14px"><?= icon('info') ?><div>সরাসরি সাপোর্ট এই মুহূর্তে বন্ধ আছে। AI সহকারী অথবা রিপোর্ট ব্যবহার করুন।</div></div><?php endif; ?>
<div class="list" style="margin-top:14px">
  <?php if (AI::enabled()): ?><button type="button" class="list-item" data-action="chat-open" data-tab="ai"><span class="tx-ic"><?= icon('bot') ?></span><span class="li-main"><span class="li-title"><?= e(setting('ai_name')) ?></span><span class="li-sub">২৪/৭ তাৎক্ষণিক উত্তর</span></span><?= icon('chevron-right') ?></button><?php endif; ?>
  <a href="<?= e(url('/report')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('flag') ?></span><span class="li-main"><span class="li-title">সমস্যা রিপোর্ট করুন</span><span class="li-sub">স্ক্রিনশটসহ বিস্তারিত পাঠান</span></span><?= icon('chevron-right') ?></a>
  <a href="<?= e(url('/faq')) ?>" class="list-item" data-link><span class="tx-ic"><?= icon('help') ?></span><span class="li-main"><span class="li-title">সাধারণ জিজ্ঞাসা (FAQ)</span></span><?= icon('chevron-right') ?></a>
  <?php if (setting('contact_email') !== ''): ?><a href="mailto:<?= e(setting('contact_email')) ?>" class="list-item"><span class="tx-ic"><?= icon('mail') ?></span><span class="li-main"><span class="li-title">ইমেইল</span><span class="li-sub"><?= e(setting('contact_email')) ?></span></span><?= icon('external') ?></a><?php endif; ?>
</div>
<?php if (!$user): ?></div></div><?php endif; ?>
