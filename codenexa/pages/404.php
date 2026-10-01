<?php
$title = t('notfound.title');
$status = 404;
?>
<section class="section notfound">
    <div class="container center">
        <div class="big-404 grad-text reveal">404</div>
        <h1 class="reveal"><?= e(t('notfound.title')) ?></h1>
        <p class="muted reveal"><?= e(t('notfound.text')) ?></p>
        <a href="<?= e(url()) ?>" class="btn btn-primary reveal" data-link><i class="fa-solid fa-house"></i> <?= e(t('notfound.back')) ?></a>
    </div>
</section>
