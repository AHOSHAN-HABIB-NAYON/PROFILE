<?php
$title = t('notfound.title');
$status = 404;
?>
<section class="band-dark top-band notfound">
    <div class="band-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="grid-lines"></span></div>
    <div class="container center">
        <div class="big-404 grad-text shine reveal r-zoom">404</div>
        <h1 class="reveal"><?= e(t('notfound.title')) ?></h1>
        <p class="lead reveal"><?= e(t('notfound.text')) ?></p>
        <a href="<?= e(url()) ?>" class="btn btn-primary reveal" data-link><i class="fa-solid fa-house"></i> <?= e(t('notfound.back')) ?></a>
    </div>
</section>
