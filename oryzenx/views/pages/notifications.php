<?php /** @var array $items */ ?>
<div class="page-head between">
    <div><h1><?= e(t('nav.notifications')) ?></h1><p><?= e(t('notif.sub')) ?></p></div>
    <button class="btn btn-sm btn-outline" type="button" data-action="push-enable"><i class="fa-solid fa-bell"></i> <?= e(t('profile.enable_push')) ?></button>
</div>
<section class="card card-flush">
    <?php if (!$items): ?><div class="empty"><i class="fa-regular fa-bell"></i><?= e(t('js.no_notifications')) ?></div><?php endif; ?>
    <?php foreach ($items as $n): ?>
        <?php $tag = $n['link'] ? 'a' : 'div'; ?>
        <<?= $tag ?> class="notif-item notif-full<?= $n['is_read'] ? '' : ' unread' ?> prio-<?= e($n['priority']) ?>" <?= $n['link'] ? 'href="' . e(url($n['link'])) . '"' : '' ?>>
            <span class="ic-box ic-box-sm"><i class="<?= e($n['icon'] ?: 'fa-solid fa-bell') ?>"></i></span>
            <span class="grow" style="min-width:0"><span class="t"><?= e($n['title']) ?></span><span class="m" style="display:block;white-space:pre-line"><?= e($n['message']) ?></span></span>
            <span class="time"><?= e(time_ago($n['created_at'])) ?></span>
        </<?= $tag ?>>
    <?php endforeach; ?>
</section>
