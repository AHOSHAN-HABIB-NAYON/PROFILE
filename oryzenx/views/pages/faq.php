<?php /** @var array $grouped */ ?>
<div class="page-head"><h1><?= e(t('nav.faq')) ?></h1><p><?= e(t('faq.sub')) ?></p></div>
<?php if (!$grouped): ?><div class="empty"><i class="fa-regular fa-circle-question"></i><?= e(t('common.empty')) ?></div><?php endif; ?>
<?php foreach ($grouped as $cat => $faqs): ?>
    <section class="section">
        <h2 class="section-title mb-1"><?= e($cat) ?></h2>
        <?php foreach ($faqs as $f): ?>
            <details class="acc"><summary><?= e(tr($f, 'question')) ?></summary><div class="acc-body"><?= nl2br(e(tr($f, 'answer'))) ?></div></details>
        <?php endforeach; ?>
    </section>
<?php endforeach; ?>
<div class="card between">
    <div><strong><?= e(t('faq.still')) ?></strong><p class="muted small mb-0"><?= e(t('faq.still_d')) ?></p></div>
    <div class="row-gap"><button class="btn btn-sm btn-soft" type="button" data-action="chat-open"><i class="fa-solid fa-robot"></i> AI</button>
        <a class="btn btn-sm btn-primary" href="<?= e(url('/contact')) ?>"><?= e(t('home.contact')) ?></a></div>
</div>
