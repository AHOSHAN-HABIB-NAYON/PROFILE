<?php
/** Contact: channels, form with anti-spam, FAQ, business info. */
defined('APP') || exit;

$u = user();
$faq = array_map(fn($l) => array_map('trim', explode('|', $l, 2)), lines((string)setting('contact.faq_' . lang())) ?: lines((string)setting('contact.faq_en')));
$socials = rows('SELECT * FROM social_links WHERE enabled = 1 AND url <> "" ORDER BY sort');
$wa = preg_replace('~\D~', '', (string)setting('contact.whatsapp'));
$ts = time();
$tsSig = $ts . '.' . substr(token_hash('contact' . $ts), 0, 16);
meta([
    'title' => t('contact.title'),
    'description' => t('contact.meta_description', ['site' => setting('site_name')]),
    'track_type' => 'contact',
    'cache' => false,
    'schema' => $faq ? [['@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => array_map(fn($f) => ['@type' => 'Question', 'name' => $f[0], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f[1] ?? '']], $faq)]] : [],
]);
?>
<style data-css="contact">
.channels{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:18px}
.channel{display:flex;flex-direction:column;gap:8px}
.channel strong{font-size:.92rem}.channel span{font-size:.78rem;color:var(--muted);word-break:break-all}
.contact-grid{display:grid;gap:16px}
@media (min-width:900px){.contact-grid{grid-template-columns:1.3fr 1fr;align-items:start}}
.faq details{border-bottom:1px solid var(--border);padding:12px 2px}
.faq details:last-child{border-bottom:0}
.faq summary{cursor:pointer;font-weight:600;font-size:.92rem;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary i{transition:transform .2s;color:var(--muted);margin-top:4px}
.faq details[open] summary i{transform:rotate(180deg)}
.faq details p{margin:8px 0 0;color:var(--muted);font-size:.88rem}
</style>
<div class="page" data-page="contact">
  <header class="page-head"><h1><?= e(t('contact.title')) ?></h1><p><?= e(t('contact.subtitle')) ?></p></header>

  <div class="channels">
    <?php if ($wa): ?><a class="card card-link channel" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><span class="icon-box success"><i class="fa-brands fa-whatsapp"></i></span><strong>WhatsApp</strong><span>+<?= e($wa) ?></span></a><?php endif ?>
    <?php if (setting('contact.email')): ?><a class="card card-link channel" href="mailto:<?= e(setting('contact.email')) ?>"><span class="icon-box"><i class="fa-regular fa-envelope"></i></span><strong><?= e(t('form.email')) ?></strong><span><?= e(setting('contact.email')) ?></span></a><?php endif ?>
    <?php if (setting('contact.phone')): ?><a class="card card-link channel" href="tel:<?= e(preg_replace('~[^\d+]~', '', (string)setting('contact.phone'))) ?>"><span class="icon-box accent"><i class="fa-solid fa-phone"></i></span><strong><?= e(t('form.phone')) ?></strong><span><?= e(setting('contact.phone')) ?></span></a><?php endif ?>
    <?php if (setting_bool('live_chat.enabled')): ?><a class="card card-link channel" href="#" data-action="chat-open" data-tab="support"><span class="icon-box secondary"><i class="fa-solid fa-headset"></i></span><strong><?= e(t('chat.live_support')) ?></strong><span><?= e(setting('contact.support_email') ?: t('contact.we_reply')) ?></span></a><?php endif ?>
  </div>

  <div class="contact-grid">
    <?php if (setting_bool('contact.form_enabled')): ?>
    <section class="card card-pad-lg" aria-labelledby="h-form">
      <h2 id="h-form" style="font-size:1.05rem"><?= e(t('contact.form_title')) ?></h2>
      <form method="post" action="<?= e(url('/api/contact')) ?>" data-ajax data-reset data-recaptcha="contact" enctype="multipart/form-data" novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="_ts" value="<?= e($tsSig) ?>">
        <div class="hp-field" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="grid-2">
          <div class="form-group"><label class="label" for="c-name"><?= e(t('form.name')) ?></label><input class="input" id="c-name" name="name" required maxlength="120" value="<?= e($u['name'] ?? '') ?>" autocomplete="name"></div>
          <div class="form-group"><label class="label" for="c-email"><?= e(t('form.email')) ?></label><input class="input" id="c-email" type="email" name="email" required maxlength="191" value="<?= e($u['email'] ?? '') ?>" autocomplete="email"></div>
        </div>
        <div class="form-group"><label class="label" for="c-subject"><?= e(t('form.subject')) ?></label><input class="input" id="c-subject" name="subject" required maxlength="190" value="<?= e(mb_substr(input('subject'), 0, 190)) ?>"></div>
        <div class="form-group"><label class="label" for="c-msg"><?= e(t('form.message')) ?></label><textarea class="textarea" id="c-msg" name="message" required maxlength="5000" rows="5" data-autosize></textarea></div>
        <div class="form-group">
          <label class="file-drop"><input type="file" name="attachment" accept=".jpg,.jpeg,.png,.webp,.pdf" data-preview><i class="fa-solid fa-paperclip"></i><span data-file-label><?= e(t('contact.attachment')) ?></span><span class="tiny"><?= e(t('contact.attachment_hint')) ?></span></label>
          <div class="upload-progress"><i></i></div>
        </div>
        <button class="btn btn-block btn-lg" type="submit"><i class="fa-solid fa-paper-plane"></i><?= e(t('contact.send')) ?></button>
      </form>
    </section>
    <?php endif ?>

    <div class="stack">
      <?php if ($faq): ?>
      <section class="card card-pad-lg faq" aria-labelledby="h-faq">
        <h2 id="h-faq" style="font-size:1.05rem"><?= e(t('contact.faq')) ?></h2>
        <?php foreach ($faq as $f): ?><details><summary><?= e($f[0]) ?><i class="fa-solid fa-chevron-down tiny"></i></summary><p><?= e($f[1] ?? '') ?></p></details><?php endforeach ?>
      </section>
      <?php endif ?>
      <section class="card card-pad-lg" aria-labelledby="h-biz">
        <h2 id="h-biz" style="font-size:1.05rem"><?= e(t('contact.business')) ?></h2>
        <dl class="kv">
          <dt><i class="fa-solid fa-location-dot"></i> <?= e(t('contact.address')) ?></dt><dd><?= e(setting_l('contact.address')) ?></dd>
          <dt><i class="fa-regular fa-clock"></i> <?= e(t('contact.hours')) ?></dt><dd><?= e(setting_l('contact.hours')) ?></dd>
          <?php if (setting('contact.support_email')): ?><dt><i class="fa-solid fa-life-ring"></i> <?= e(t('footer.support')) ?></dt><dd><a href="mailto:<?= e(setting('contact.support_email')) ?>"><?= e(setting('contact.support_email')) ?></a></dd><?php endif ?>
        </dl>
        <?php if ($socials): ?>
        <div class="ft-social" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <?php foreach ($socials as $s): ?><a class="icon-btn" style="background:var(--soft)" href="<?= e($s['url']) ?>" target="_blank" rel="noopener" aria-label="<?= e($s['label']) ?>"><i class="<?= e(fa($s['icon'], 'fa-solid fa-link')) ?>"></i></a><?php endforeach ?>
        </div>
        <?php endif ?>
      </section>
    </div>
  </div>
</div>
