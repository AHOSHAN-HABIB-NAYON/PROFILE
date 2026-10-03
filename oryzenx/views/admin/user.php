<?php /** @var array $u @var array $payments @var array $logins @var array $activity @var array $sessions @var array $locations @var bool $tfa @var int $passkeys */
$act = url('/admin/users/' . $u['id'] . '/action');
?>
<a class="back-link" href="<?= e(url('/admin/users')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('admin.users')) ?></a>
<section class="card user-hero">
    <?= avatar_html($u, 'avatar-lg') ?>
    <div class="grow" style="min-width:0">
        <h1 class="mb-0" style="font-size:1.2rem"><?= e($u['name']) ?> <?= $u['role'] === 'admin' ? '<span class="badge badge-primary">Admin</span>' : '' ?></h1>
        <p class="muted small mb-0 truncate"><?= e($u['email']) ?> · #<?= (int)$u['id'] ?></p>
        <div class="row-gap mt-1">
            <?= $u['deleted_at'] ? '<span class="badge badge-danger">' . e(t('admin.deleted')) . '</span>' : status_badge($u['status']) ?>
            <span class="badge <?= $u['email_verified_at'] ? 'badge-success' : 'badge-warning' ?>"><?= e($u['email_verified_at'] ? t('profile.verified') : t('profile.unverified')) ?></span>
            <span class="badge <?= $tfa ? 'badge-success' : '' ?>">2FA <?= e($tfa ? t('common.on') : t('common.off')) ?></span>
            <span class="badge">Passkeys <?= num($passkeys) ?></span>
            <span class="badge badge-primary"><?= e(t('admin.balance')) ?>: <?= money($u['balance']) ?></span>
        </div>
        <?php if ($u['status'] === 'banned' && $u['banned_until']): ?><p class="xs text-danger mt-1 mb-0"><?= e(t('admin.banned_until')) ?> <?= e(fmt_date($u['banned_until'], true)) ?><?= $u['ban_reason'] ? ' — ' . e($u['ban_reason']) : '' ?></p><?php endif; ?>
    </div>
</section>

<div class="admin-grid mt-2">
    <form class="card form" method="post" action="<?= e(url('/admin/users/' . $u['id'])) ?>" data-ajax>
        <?= csrf_field() ?>
        <h2 class="card-title"><?= e(t('admin.edit_user')) ?></h2>
        <div class="field"><label for="u-name"><?= e(t('form.name')) ?></label><input class="input" id="u-name" name="name" value="<?= e($u['name']) ?>" required maxlength="100"></div>
        <div class="field"><label for="u-email"><?= e(t('form.email')) ?></label><input class="input" id="u-email" type="email" name="email" value="<?= e($u['email']) ?>" required></div>
        <div class="grid grid-2">
            <div class="field"><label for="u-phone"><?= e(t('form.phone')) ?></label><input class="input" id="u-phone" name="phone" value="<?= e($u['phone']) ?>"></div>
            <div class="field"><label for="u-role"><?= e(t('admin.role')) ?></label><select class="select" id="u-role" name="role"><option value="user" <?= $u['role'] === 'user' ? 'selected' : '' ?>>User</option><option value="admin" <?= $u['role'] === 'admin' ? 'selected' : '' ?>>Admin</option></select></div>
        </div>
        <label class="switch"><input type="hidden" name="verified" value="0"><input type="checkbox" name="verified" value="1" <?= $u['email_verified_at'] ? 'checked' : '' ?>><span class="track"></span><?= e(t('admin.email_verified')) ?></label>
        <button class="btn btn-primary btn-sm" type="submit"><?= e(t('common.save')) ?></button>
    </form>

    <section class="card stack">
        <h2 class="card-title"><?= e(t('admin.account_actions')) ?></h2>
        <form class="form" method="post" action="<?= e($act) ?>" data-ajax data-refresh>
            <?= csrf_field() ?><input type="hidden" name="action" value="ban">
            <div class="grid grid-2">
                <div class="field"><label for="b-h"><?= e(t('admin.ban_hours')) ?></label><input class="input" id="b-h" type="number" name="hours" value="24" min="1"></div>
                <div class="field"><label for="b-r"><?= e(t('admin.reason')) ?></label><input class="input" id="b-r" name="reason" maxlength="255"></div>
            </div>
            <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-clock"></i> <?= e(t('admin.ban_temp')) ?></button>
        </form>
        <div class="row-gap">
            <?php foreach ([['activate', 'fa-solid fa-circle-check', 'admin.activate', 'btn-success', ''], ['suspend', 'fa-solid fa-ban', 'admin.suspend', 'btn-outline', 'admin.confirm_suspend'],
                ['logout', 'fa-solid fa-right-from-bracket', 'admin.force_logout', 'btn-outline', ''], ['reset_2fa', 'fa-solid fa-key', 'admin.reset_2fa', 'btn-outline', 'admin.confirm_reset_2fa'],
                $u['deleted_at'] ? ['restore', 'fa-solid fa-rotate-left', 'admin.restore', 'btn-success', ''] : ['delete', 'fa-solid fa-trash', 'admin.delete', 'btn-danger', 'admin.confirm_delete']] as [$a, $ic, $lbl, $cls, $conf]): ?>
                <form method="post" action="<?= e($act) ?>" data-ajax data-refresh <?= $conf ? 'data-confirm="' . e(t($conf)) . '"' : '' ?>><?= csrf_field() ?><input type="hidden" name="action" value="<?= $a ?>">
                    <button class="btn btn-sm <?= $cls ?>" type="submit"><i class="<?= $ic ?>"></i> <?= e(t($lbl)) ?></button></form>
            <?php endforeach; ?>
        </div>
        <form class="form" method="post" action="<?= e($act) ?>" data-ajax data-refresh>
            <?= csrf_field() ?><input type="hidden" name="action" value="balance">
            <div class="input-group"><input class="input" type="number" step="0.01" name="amount" placeholder="<?= e(t('admin.balance_ph')) ?>" aria-label="<?= e(t('admin.balance')) ?>"><button class="btn btn-sm btn-outline" type="submit"><?= e(t('admin.add_balance')) ?></button></div>
        </form>
    </section>

    <form class="card form" method="post" action="<?= e($act) ?>" data-ajax data-reset>
        <?= csrf_field() ?><input type="hidden" name="action" value="notify">
        <h2 class="card-title"><?= e(t('admin.send_notification')) ?></h2>
        <input class="input" name="title" placeholder="<?= e(t('admin.notif_title')) ?>" maxlength="160" required aria-label="<?= e(t('admin.notif_title')) ?>">
        <textarea class="textarea" name="message" rows="3" placeholder="<?= e(t('form.message')) ?>" maxlength="1000" required aria-label="<?= e(t('form.message')) ?>"></textarea>
        <input class="input" name="link" placeholder="/services" aria-label="<?= e(t('admin.link')) ?>">
        <label class="check"><input type="checkbox" name="email" value="1"> <?= e(t('admin.also_email')) ?></label>
        <button class="btn btn-sm btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('contact.send')) ?></button>
    </form>

    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('admin.payments')) ?></h2>
        <?php if (!$payments): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
        <div class="list"><?php foreach ($payments as $p): ?>
            <a class="list-item" href="<?= e(url('/admin/payments/' . $p['id'])) ?>"><span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($p['service_title']) ?></span><span class="sub"><?= e($p['order_no']) ?> · <?= e(fmt_date($p['created_at'])) ?></span></span><span class="meta"><?= money($p['amount'], $p['currency']) ?> <?= status_badge($p['status']) ?></span></a>
        <?php endforeach; ?></div>
    </section>

    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('profile.login_history')) ?></h2>
        <div class="list"><?php foreach ($logins as $l): ?>
            <div class="list-item"><i class="fa-solid <?= $l['success'] ? 'fa-circle-check text-success' : 'fa-circle-xmark text-danger' ?>"></i><span class="grow" style="min-width:0"><span class="title" style="display:block"><?= e(UA::summary((string)$l['user_agent'])) ?> · <?= e($l['method']) ?></span><span class="sub"><?= e($l['ip']) ?><?= $l['reason'] ? ' · ' . e($l['reason']) : '' ?></span></span><span class="meta"><?= e(time_ago($l['created_at'])) ?></span></div>
        <?php endforeach; ?><?php if (!$logins): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?></div>
    </section>

    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('admin.activity')) ?></h2>
        <div class="list"><?php foreach ($activity as $a): ?>
            <div class="list-item"><span class="grow"><span class="title mono xs" style="display:block"><?= e($a['action']) ?></span><span class="sub"><?= e($a['details']) ?></span></span><span class="meta"><?= e(time_ago($a['created_at'])) ?></span></div>
        <?php endforeach; ?><?php if (!$activity): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?></div>
        <?php if ($locations): ?>
            <h3 class="card-title mt-2 mb-1"><?= e(t('admin.locations')) ?></h3>
            <?php foreach ($locations as $l): ?><div class="small"><?= country_flag($l['country']) ?> <?= e(implode(', ', array_filter([$l['city'], $l['region'], $l['country']]))) ?> <span class="muted">(<?= num($l['c']) ?>)</span></div><?php endforeach; ?>
        <?php endif; ?>
        <h3 class="card-title mt-2 mb-1"><?= e(t('profile.sessions')) ?> (<?= num(count($sessions)) ?>)</h3>
        <?php foreach ($sessions as $s): ?><div class="small"><i class="fa-solid fa-display muted"></i> <?= e($s['device']) ?> · <?= e($s['ip']) ?> · <span class="muted"><?= e(time_ago($s['last_seen_at'])) ?></span></div><?php endforeach; ?>
    </section>
</div>
