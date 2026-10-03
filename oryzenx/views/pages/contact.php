<?php /** @var ?array $user @var string $subject */
$wa = preg_replace('/\D/', '', setting('contact_whatsapp'));
?>
<div class="page-head"><h1><?= e(t('contact.title')) ?></h1><p><?= e(t('contact.sub')) ?></p></div>
<div class="contact-layout">
    <div class="stack">
        <div class="card"><div class="list">
            <?php if ($wa): ?><a class="list-item" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><span class="ic-box" style="--c:#25d366"><i class="fa-brands fa-whatsapp"></i></span><span class="grow"><span class="title">WhatsApp</span><br><span class="sub"><?= e(setting('contact_whatsapp')) ?></span></span><i class="fa-solid fa-chevron-right muted xs"></i></a><?php endif; ?>
            <?php if (setting('contact_email')): ?><a class="list-item" href="mailto:<?= e(setting('contact_email')) ?>"><span class="ic-box" style="--c:#2563eb"><i class="fa-solid fa-envelope"></i></span><span class="grow"><span class="title"><?= e(t('contact.email')) ?></span><br><span class="sub"><?= e(setting('contact_email')) ?></span></span><i class="fa-solid fa-chevron-right muted xs"></i></a><?php endif; ?>
            <?php if (setting('contact_telegram')): ?><a class="list-item" href="https://t.me/<?= e(ltrim(setting('contact_telegram'), '@')) ?>" target="_blank" rel="noopener"><span class="ic-box" style="--c:#229ed9"><i class="fa-brands fa-telegram"></i></span><span class="grow"><span class="title">Telegram</span><br><span class="sub">@<?= e(ltrim(setting('contact_telegram'), '@')) ?></span></span><i class="fa-solid fa-chevron-right muted xs"></i></a><?php endif; ?>
            <?php if (setting('contact_facebook')): ?><a class="list-item" href="<?= e(setting('contact_facebook')) ?>" target="_blank" rel="noopener"><span class="ic-box" style="--c:#1877f2"><i class="fa-brands fa-facebook-f"></i></span><span class="grow"><span class="title">Facebook</span><br><span class="sub truncate"><?= e(preg_replace('#^https?://(www\.)?#', '', setting('contact_facebook'))) ?></span></span><i class="fa-solid fa-chevron-right muted xs"></i></a><?php endif; ?>
            <div class="list-item"><span class="ic-box" style="--c:#db2777"><i class="fa-solid fa-location-dot"></i></span><span class="grow"><span class="title"><?= e(t('contact.address')) ?></span><br><span class="sub"><?= e(sl('contact_address')) ?></span></span></div>
            <div class="list-item"><span class="ic-box" style="--c:#16a34a"><i class="fa-regular fa-clock"></i></span><span class="grow"><span class="title"><?= e(t('contact.hours')) ?></span><br><span class="sub"><?= e(sl('contact_hours')) ?></span></span></div>
        </div></div>
        <div class="card support-card">
            <span class="ic-box" style="--c:var(--accent)"><i class="fa-solid fa-robot"></i></span>
            <div class="grow"><strong><?= e(t('contact.ai')) ?></strong><p class="muted xs mb-0"><?= e(t('contact.ai_d')) ?></p></div>
            <button class="btn btn-sm btn-soft" type="button" data-action="chat-open"><?= e(t('contact.ask')) ?></button>
        </div>
    </div>

    <form class="card form" method="post" action="<?= e(url('/contact')) ?>" enctype="multipart/form-data" data-ajax data-reset novalidate>
        <?= csrf_field() ?>
        <h2 class="card-title"><i class="fa-regular fa-paper-plane text-primary"></i> <?= e(t('contact.form')) ?></h2>
        <div class="grid md-grid-2">
            <div class="field"><label class="req" for="c-name"><?= e(t('form.name')) ?></label><input class="input" id="c-name" name="name" maxlength="120" required value="<?= e($user['name'] ?? '') ?>" autocomplete="name"></div>
            <div class="field"><label class="req" for="c-email"><?= e(t('form.email')) ?></label><input class="input" id="c-email" name="email" type="email" maxlength="190" required value="<?= e($user['email'] ?? '') ?>" autocomplete="email"></div>
        </div>
        <div class="field"><label class="req" for="c-subject"><?= e(t('form.subject')) ?></label><input class="input" id="c-subject" name="subject" maxlength="200" required value="<?= e($subject) ?>"></div>
        <div class="field" data-component="char-count"><label class="req" for="c-message"><?= e(t('form.message')) ?></label><textarea class="textarea" id="c-message" name="message" maxlength="5000" required rows="5"></textarea><span class="hint right" data-count></span></div>
        <div class="field" data-component="file-preview"><label for="c-file"><?= e(t('form.attachment')) ?> <span class="muted xs">(PDF/JPG/PNG/WebP · 5MB)</span></label><input class="input" id="c-file" type="file" name="attachment" accept=".pdf,image/jpeg,image/png,image/webp"><span class="hint" data-file-info></span></div>
        <input type="text" name="website" class="sr-only" tabindex="-1" autocomplete="off" aria-hidden="true">
        <?= Recaptcha::widget() ?>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('contact.send')) ?></button>
    </form>
</div>
