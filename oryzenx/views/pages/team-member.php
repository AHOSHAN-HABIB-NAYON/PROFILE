<?php /** @var array $m */ ?>
<a class="back-link" href="<?= e(url('/team')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('team.title')) ?></a>
<section class="card member">
    <div class="member-head">
        <?= $m['photo'] ? '<img class="member-photo" src="' . e(upload_url($m['photo'])) . '" alt="" width="88" height="88">' : avatar_html(['name' => $m['name'], 'email' => $m['name']], 'avatar-lg member-photo') ?>
        <div class="grow">
            <h1 class="member-name"><?= e($m['name']) ?> <?php if ($m['is_vip']): ?><span class="badge badge-vip<?= $m['badge_animated'] ? ' animated' : '' ?>"><?= e($m['badge_text'] ?: 'VIP') ?></span><?php endif; ?></h1>
            <p class="text-primary bold mb-0"><?= e(tr($m, 'role')) ?></p>
        </div>
    </div>
    <?php if ($m['bio']): ?><p class="mt-2"><?= nl2br(e($m['bio'])) ?></p><?php endif; ?>
    <?php if ($m['skills']): ?>
        <h2 class="card-title mt-2 mb-1"><?= e(t('team.skills')) ?></h2>
        <div class="row-gap"><?php foreach (array_filter(array_map('trim', explode(',', $m['skills']))) as $sk): ?><span class="badge badge-primary"><?= e($sk) ?></span><?php endforeach; ?></div>
    <?php endif; ?>
    <h2 class="card-title mt-2 mb-1"><?= e(t('team.contact')) ?></h2>
    <div class="list">
        <?php if ($m['email']): ?><a class="list-item" href="mailto:<?= e($m['email']) ?>"><span class="ic-box ic-box-sm"><i class="fa-solid fa-envelope"></i></span><?= e($m['email']) ?></a><?php endif; ?>
        <?php if ($m['whatsapp']): ?><a class="list-item" href="https://wa.me/<?= e(preg_replace('/\D/', '', $m['whatsapp'])) ?>" target="_blank" rel="noopener"><span class="ic-box ic-box-sm" style="--c:#25d366"><i class="fa-brands fa-whatsapp"></i></span><?= e($m['whatsapp']) ?></a><?php endif; ?>
        <?php if ($m['telegram']): ?><a class="list-item" href="https://t.me/<?= e(ltrim($m['telegram'], '@')) ?>" target="_blank" rel="noopener"><span class="ic-box ic-box-sm" style="--c:#229ed9"><i class="fa-brands fa-telegram"></i></span>@<?= e(ltrim($m['telegram'], '@')) ?></a><?php endif; ?>
        <?php foreach (['facebook' => ['fa-brands fa-facebook-f', '#1877f2'], 'linkedin' => ['fa-brands fa-linkedin-in', '#0a66c2'], 'github' => ['fa-brands fa-github', '#333'], 'website' => ['fa-solid fa-globe', '#2563eb']] as $k => [$ic, $c]): ?>
            <?php if ($m[$k]): ?><a class="list-item" href="<?= e($m[$k]) ?>" target="_blank" rel="noopener"><span class="ic-box ic-box-sm" style="--c:<?= $c ?>"><i class="<?= $ic ?>"></i></span><span class="truncate"><?= e(preg_replace('#^https?://(www\.)?#', '', $m[$k])) ?></span></a><?php endif; ?>
        <?php endforeach; ?>
    </div>
    <?php if ($m['cv_file']): ?>
        <a class="btn btn-primary btn-sm mt-2" href="<?= e(upload_url($m['cv_file'])) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-file-arrow-down"></i> <?= e(t('team.cv')) ?></a>
    <?php endif; ?>
</section>
