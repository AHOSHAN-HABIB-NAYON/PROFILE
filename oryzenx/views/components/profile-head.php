<?php /** @var array $u @var string $tab */ ?>
<section class="profile-head card">
    <?= avatar_html($u, 'avatar-lg') ?>
    <div class="grow" style="min-width:0">
        <h1 class="profile-name truncate"><?= e($u['name']) ?> <?php if ($u['role'] === 'admin'): ?><span class="badge badge-primary">Admin</span><?php endif; ?></h1>
        <p class="muted small mb-0 truncate"><?= e($u['email']) ?>
            <?= $u['email_verified_at'] ? '<i class="fa-solid fa-circle-check text-success" title="' . e(t('profile.verified')) . '"></i>' : '' ?></p>
        <p class="xs muted mb-0"><i class="fa-regular fa-calendar"></i> <?= e(t('profile.joined')) ?> <?= e(fmt_date($u['created_at'])) ?></p>
    </div>
    <div class="profile-actions">
        <?php if ($u['role'] === 'admin'): ?><a class="btn btn-sm btn-soft" href="<?= e(url('/admin')) ?>" data-no-spa><i class="fa-solid fa-gauge-high"></i> <span class="hide-xs">Admin</span></a><?php endif; ?>
        <form method="post" action="<?= e(url('/logout')) ?>" data-ajax data-full-reload data-confirm="<?= e(t('auth.logout_confirm')) ?>"><?= csrf_field() ?>
            <button class="btn btn-sm btn-outline" type="submit" aria-label="<?= e(t('auth.logout')) ?>"><i class="fa-solid fa-right-from-bracket"></i> <span class="hide-xs"><?= e(t('auth.logout')) ?></span></button></form>
    </div>
</section>
<?php if (!$u['email_verified_at']): ?>
    <div class="alert alert-warning mt-1"><i class="fa-solid fa-envelope-circle-check"></i>
        <span class="grow"><?= e(t('profile.verify_banner')) ?></span>
        <form method="post" action="<?= e(url('/verify-email/resend')) ?>" data-ajax><?= csrf_field() ?><button class="btn btn-xs btn-outline" type="submit"><?= e(t('profile.resend')) ?></button></form>
    </div>
<?php endif; ?>
<nav class="tabs mt-1" aria-label="<?= e(t('nav.profile')) ?>">
    <?php foreach (['overview' => ['/profile', 'fa-solid fa-chart-simple', 'profile.overview'], 'edit' => ['/profile/edit', 'fa-solid fa-user-pen', 'profile.edit'],
        'security' => ['/profile/security', 'fa-solid fa-shield-halved', 'nav.security'], 'payments' => ['/profile/payments', 'fa-solid fa-receipt', 'profile.payments'], 'wallet' => ['/profile/wallet', 'fa-solid fa-wallet', 'wallet.title']] as $k => [$href, $ic, $lbl]): ?>
        <a class="tab<?= $tab === $k || ($tab === 'payment' && $k === 'payments') ? ' active' : '' ?>" href="<?= e(url($href)) ?>"><i class="<?= $ic ?>"></i><?= e(t($lbl)) ?></a>
    <?php endforeach; ?>
</nav>
