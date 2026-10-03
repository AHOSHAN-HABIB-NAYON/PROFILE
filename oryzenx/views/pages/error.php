<?php /** @var int $code @var string $message @var string $heading */ ?>
<div class="error-page">
    <div class="error-code"><?= (int)$code ?></div>
    <h1><?= e($heading) ?></h1>
    <p class="muted"><?= e($message) ?></p>
    <?php if ($code >= 500): ?>
        <p class="muted small">দুঃখিত, কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন। · Something went wrong. Please try again.</p>
    <?php endif; ?>
    <div class="row-gap" style="justify-content:center">
        <a class="btn btn-primary btn-sm" href="<?= e(url('/')) ?>"><i class="fa-solid fa-house"></i> <?= e(t('nav.home')) ?></a>
        <button class="btn btn-outline btn-sm" type="button" onclick="history.length > 1 ? history.back() : location.reload()"><i class="fa-solid fa-rotate-left"></i> <?= e(t('common.back')) ?></button>
        <a class="btn btn-ghost btn-sm" href="<?= e(url('/contact')) ?>"><?= e(t('nav.contact')) ?></a>
    </div>
</div>
