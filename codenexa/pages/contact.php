<?php
$title = t('nav.contact');
contact_section(true);
?>
<section class="section">
    <div class="container">
        <div class="quick-contact">
            <a class="card qc reveal" data-tilt href="mailto:<?= e(setting('email')) ?>"><span class="icon-tile" style="--c:#6366f1"><i class="fa-solid fa-envelope"></i></span><strong><?= e(t('contact.email')) ?></strong><small class="muted"><?= e(setting('email')) ?></small></a>
            <a class="card qc reveal" style="--d:80ms" data-tilt href="tel:<?= e(preg_replace('/[^\d+]/', '', setting('phone'))) ?>"><span class="icon-tile" style="--c:#10b981"><i class="fa-solid fa-phone"></i></span><strong><?= e(t('contact.phone')) ?></strong><small class="muted"><?= e(setting('phone')) ?></small></a>
            <div class="card qc reveal" style="--d:160ms" data-tilt><span class="icon-tile" style="--c:#f97316"><i class="fa-solid fa-location-dot"></i></span><strong><?= e(t('contact.location')) ?></strong><small class="muted"><?= e(setting('address')) ?></small></div>
        </div>
    </div>
</section>
