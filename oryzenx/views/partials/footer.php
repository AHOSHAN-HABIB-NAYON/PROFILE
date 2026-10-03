<?php
$logo = setting('logo');
$wa = preg_replace('/\D/', '', setting('contact_whatsapp'));
$tg = ltrim((string)setting('contact_telegram'), '@');
$socials = array_filter([
    ['https://wa.me/' . $wa, 'fa-brands fa-whatsapp', 'WhatsApp', $wa !== ''],
    ['mailto:' . setting('contact_email'), 'fa-regular fa-envelope', 'Email', setting('contact_email') !== ''],
    ['https://t.me/' . $tg, 'fa-brands fa-telegram', 'Telegram', $tg !== ''],
    [setting('contact_facebook'), 'fa-brands fa-facebook-f', 'Facebook', setting('contact_facebook') !== ''],
    [setting('social_x'), 'fa-brands fa-x-twitter', 'X', setting('social_x') !== ''],
    [setting('social_linkedin'), 'fa-brands fa-linkedin-in', 'LinkedIn', setting('social_linkedin') !== ''],
    [setting('social_github'), 'fa-brands fa-github', 'GitHub', setting('social_github') !== ''],
    [setting('social_youtube'), 'fa-brands fa-youtube', 'YouTube', setting('social_youtube') !== ''],
], fn($s) => $s[3]);
?>
<footer class="footer" role="contentinfo">
    <div class="footer-inner">
        <div class="footer-brand">
            <a class="footer-logo" href="<?= e(url('/')) ?>">
                <?php if ($logo): ?><img class="brand-logo" src="<?= e(upload_url($logo)) ?>" alt="" width="44" height="44" loading="lazy">
                <?php else: ?><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><?php endif; ?>
                <span><?= e(setting('site_name')) ?></span>
            </a>
            <p class="footer-tagline"><?= e(lang() === 'bn' ? setting('footer_bn') : setting('footer_en')) ?></p>
            <?php if ($socials): ?>
            <div class="footer-social">
                <?php foreach ($socials as [$href, $ic, $label]): ?>
                    <a href="<?= e($href) ?>" <?= str_starts_with($href, 'mailto:') ? '' : 'target="_blank" rel="noopener"' ?> aria-label="<?= e($label) ?>"><i class="<?= $ic ?>"></i></a>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>

        <div class="footer-cols">
            <nav aria-label="<?= e(t('footer.explore')) ?>">
                <h3 class="footer-h"><?= e(t('footer.explore')) ?></h3>
                <ul class="footer-links">
                    <li><a href="<?= e(url('/services')) ?>"><?= e(t('nav.services')) ?></a></li>
                    <li><a href="<?= e(url('/news')) ?>"><?= e(t('nav.news')) ?></a></li>
                    <li><a href="<?= e(url('/team')) ?>"><?= e(t('nav.team')) ?></a></li>
                    <li><a href="<?= e(url('/payment')) ?>"><?= e(t('nav.payment')) ?></a></li>
                    <li><a href="<?= e(url('/faq')) ?>"><?= e(t('nav.faq')) ?></a></li>
                </ul>
            </nav>
            <div>
                <h3 class="footer-h"><?= e(t('footer.support')) ?></h3>
                <ul class="footer-links footer-support">
                    <?php if ($wa): ?><li><a href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i><span><?= e(setting('contact_whatsapp')) ?></span></a></li><?php endif; ?>
                    <?php if (setting('contact_email')): ?><li><a href="mailto:<?= e(setting('contact_email')) ?>"><i class="fa-regular fa-envelope"></i><span class="break"><?= e(setting('contact_email')) ?></span></a></li><?php endif; ?>
                    <?php if ($tg): ?><li><a href="https://t.me/<?= e($tg) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-telegram"></i><span>@<?= e($tg) ?></span></a></li><?php endif; ?>
                    <li><button class="link-btn" type="button" data-action="chat-open"><i class="fa-solid fa-robot"></i><span><?= e(t('chat.title')) ?></span></button></li>
                    <li><a href="<?= e(url('/contact')) ?>"><i class="fa-solid fa-headset"></i><span><?= e(t('nav.contact')) ?></span></a></li>
                </ul>
            </div>
        </div>

        <div class="app-card">
            <h3><i class="fa-solid fa-mobile-screen-button"></i> <?= e(t('footer.get_app')) ?></h3>
            <p><?= e(t('footer.get_app_d')) ?></p>
            <?php if (setting('pwa_enabled') === '1'): ?>
                <button class="btn btn-primary btn-block app-install" type="button" data-action="install"><i class="fa-solid fa-download"></i> <?= e(t('pwa.install')) ?></button>
            <?php endif; ?>
            <div class="app-controls">
                <div class="seg-group" role="group" aria-label="<?= e(t('footer.font_size')) ?>">
                    <button type="button" data-action="fs" data-fs="sm">A−</button>
                    <button type="button" data-action="fs" data-fs="">A</button>
                    <button type="button" data-action="fs" data-fs="lg">A+</button>
                </div>
                <div class="seg-group" role="group" aria-label="<?= e(t('nav.language')) ?>">
                    <button type="button" <?= lang() === 'en' ? 'class="on" aria-pressed="true"' : 'data-action="lang" data-lang="en"' ?>>EN</button>
                    <button type="button" <?= lang() === 'bn' ? 'class="on" aria-pressed="true"' : 'data-action="lang" data-lang="bn"' ?>>বাংলা</button>
                </div>
            </div>
        </div>
    </div>
    <div class="footer-bottom">
        <p class="footer-legal"><i class="fa-solid fa-circle-info"></i> <?= e(sl('legal_notice')) ?></p>
        <p class="footer-copy">© <?= num(date('Y')) ?> <?= e(setting('site_name')) ?>. <?= e(t('footer.rights')) ?></p>
    </div>
</footer>
