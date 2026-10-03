<?php $logo = setting('logo'); ?>
<footer class="footer" role="contentinfo">
    <div class="footer-grid">
        <div class="footer-brand">
            <a class="brand" href="<?= e(url('/')) ?>">
                <?php if ($logo): ?><img class="brand-logo" src="<?= e(upload_url($logo)) ?>" alt="" width="28" height="28" loading="lazy">
                <?php else: ?><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><?php endif; ?>
                <span class="brand-name"><?= e(setting('site_name')) ?></span>
            </a>
            <p class="muted small"><?= e(lang() === 'bn' ? setting('footer_bn') : setting('footer_en')) ?></p>
            <div class="social-row">
                <?php if (setting('contact_facebook')): ?><a href="<?= e(setting('contact_facebook')) ?>" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a><?php endif; ?>
                <?php if (setting('contact_whatsapp')): ?><a href="https://wa.me/<?= e(preg_replace('/\D/', '', setting('contact_whatsapp'))) ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a><?php endif; ?>
                <?php if (setting('contact_telegram')): ?><a href="https://t.me/<?= e(ltrim(setting('contact_telegram'), '@')) ?>" target="_blank" rel="noopener" aria-label="Telegram"><i class="fa-brands fa-telegram"></i></a><?php endif; ?>
                <?php if (setting('social_x')): ?><a href="<?= e(setting('social_x')) ?>" target="_blank" rel="noopener" aria-label="X"><i class="fa-brands fa-x-twitter"></i></a><?php endif; ?>
                <?php if (setting('social_linkedin')): ?><a href="<?= e(setting('social_linkedin')) ?>" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a><?php endif; ?>
                <?php if (setting('social_github')): ?><a href="<?= e(setting('social_github')) ?>" target="_blank" rel="noopener" aria-label="GitHub"><i class="fa-brands fa-github"></i></a><?php endif; ?>
                <?php if (setting('social_youtube')): ?><a href="<?= e(setting('social_youtube')) ?>" target="_blank" rel="noopener" aria-label="YouTube"><i class="fa-brands fa-youtube"></i></a><?php endif; ?>
                <?php if (setting('contact_email')): ?><a href="mailto:<?= e(setting('contact_email')) ?>" aria-label="Email"><i class="fa-solid fa-envelope"></i></a><?php endif; ?>
            </div>
        </div>
        <div>
            <h3 class="footer-h"><?= e(t('nav.services')) ?></h3>
            <ul class="footer-links">
                <?php foreach (Content::footerServices() as $s): ?><li><a href="<?= e(url('/services/' . $s['slug'])) ?>"><?= e(tr($s, 'title')) ?></a></li><?php endforeach; ?>
                <li><a href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?> →</a></li>
            </ul>
        </div>
        <div>
            <h3 class="footer-h"><?= e(t('footer.company')) ?></h3>
            <ul class="footer-links">
                <li><a href="<?= e(url('/news')) ?>"><?= e(t('nav.news')) ?></a></li>
                <li><a href="<?= e(url('/team')) ?>"><?= e(t('nav.team')) ?></a></li>
                <li><a href="<?= e(url('/faq')) ?>"><?= e(t('nav.faq')) ?></a></li>
                <li><a href="<?= e(url('/contact')) ?>"><?= e(t('nav.contact')) ?></a></li>
            </ul>
        </div>
        <div>
            <h3 class="footer-h"><?= e(t('footer.support')) ?></h3>
            <ul class="footer-links">
                <li><button class="link-btn" type="button" data-action="chat-open"><i class="fa-solid fa-robot"></i> <?= e(t('chat.title')) ?></button></li>
                <li><button class="link-btn" type="button" data-action="install" hidden data-install-btn><i class="fa-solid fa-download"></i> <?= e(t('pwa.install')) ?></button></li>
                <li><button class="link-btn" type="button" data-action="lang" data-lang="<?= lang() === 'bn' ? 'en' : 'bn' ?>"><i class="fa-solid fa-language"></i> <?= lang() === 'bn' ? 'English' : 'বাংলা' ?></button></li>
                <li class="fs-controls" aria-label="<?= e(t('footer.font_size')) ?>">
                    <span class="muted small"><?= e(t('footer.font_size')) ?></span>
                    <button type="button" data-action="fs" data-fs="sm" aria-label="A-">A-</button>
                    <button type="button" data-action="fs" data-fs="" aria-label="A">A</button>
                    <button type="button" data-action="fs" data-fs="lg" aria-label="A+">A+</button>
                </li>
            </ul>
        </div>
    </div>
    <p class="footer-legal"><i class="fa-solid fa-circle-info"></i> <?= e(sl('legal_notice')) ?></p>
    <p class="footer-copy">© <?= num(date('Y')) ?> <?= e(setting('site_name')) ?>. <?= e(t('footer.rights')) ?></p>
</footer>
