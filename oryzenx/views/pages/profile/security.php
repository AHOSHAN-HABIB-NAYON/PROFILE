<?php /** @var array $u @var array $sec @var array $sessions @var array $history @var array $passkeys @var string $current @var bool $loginVerify @var int $recoveryLeft @var string $tab */
require VIEWS . '/components/profile-head.php';
$c = $sec['checks'];
?>
<section class="card sec-status">
    <div class="sec-ring" style="--p:<?= (int)$sec['score'] ?>"><span><?= num($sec['score']) ?>%</span></div>
    <div class="grow">
        <h2 class="card-title"><?= e(t('profile.security_status')) ?></h2>
        <p class="small muted mb-0"><?= e($sec['score'] >= 80 ? t('profile.sec_strong') : ($sec['score'] >= 40 ? t('profile.sec_medium') : t('profile.sec_weak'))) ?></p>
    </div>
</section>

<div class="profile-cols mt-2">
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('profile.security_settings')) ?></h2>
        <div class="list sec-list">
            <div class="list-item">
                <span class="ic-box ic-box-sm" style="--c:<?= $c['email'] ? 'var(--success)' : 'var(--warning)' ?>"><i class="fa-solid fa-envelope-circle-check"></i></span>
                <span class="grow"><span class="title" style="display:block"><?= e(t('profile.email_verification')) ?></span><span class="sub"><?= e($c['email'] ? t('profile.verified') : t('profile.unverified')) ?></span></span>
                <?php if (!$c['email']): ?><form method="post" action="<?= e(url('/verify-email/resend')) ?>" data-ajax><?= csrf_field() ?><button class="btn btn-xs btn-outline" type="submit"><?= e(t('profile.resend')) ?></button></form><?php else: ?><i class="fa-solid fa-circle-check text-success"></i><?php endif; ?>
            </div>
            <div class="list-item">
                <span class="ic-box ic-box-sm" style="--c:<?= $c['2fa'] ? 'var(--success)' : 'var(--text-muted)' ?>"><i class="fa-solid fa-mobile-screen"></i></span>
                <span class="grow"><span class="title" style="display:block"><?= e(t('profile.2fa')) ?></span><span class="sub"><?= e($c['2fa'] ? t('profile.2fa_on_d', ['n' => num($recoveryLeft)]) : t('profile.2fa_off_d')) ?></span></span>
                <?php if ($c['2fa']): ?><a class="btn btn-xs btn-outline" href="#tfa-manage"><?= e(t('profile.manage')) ?></a>
                <?php else: ?><a class="btn btn-xs btn-primary" href="<?= e(url('/profile/2fa')) ?>"><?= e(t('profile.enable')) ?></a><?php endif; ?>
            </div>
            <div class="list-item">
                <span class="ic-box ic-box-sm" style="--c:<?= $c['passkey'] ? 'var(--success)' : 'var(--text-muted)' ?>"><i class="fa-solid fa-fingerprint"></i></span>
                <span class="grow"><span class="title" style="display:block"><?= e(t('profile.passkeys')) ?></span><span class="sub"><?= e(t('profile.passkeys_d', ['n' => num(count($passkeys))])) ?></span></span>
                <button class="btn btn-xs btn-primary" type="button" data-component="passkey-register" hidden><i class="fa-solid fa-plus"></i> <?= e(t('profile.add')) ?></button>
            </div>
            <form class="list-item" method="post" action="<?= e(url('/profile/login-verify')) ?>" data-ajax>
                <?= csrf_field() ?>
                <span class="ic-box ic-box-sm" style="--c:<?= $loginVerify ? 'var(--success)' : 'var(--text-muted)' ?>"><i class="fa-solid fa-user-lock"></i></span>
                <span class="grow"><span class="title" style="display:block"><?= e(t('profile.login_verify')) ?></span><span class="sub"><?= e(t('profile.login_verify_d')) ?></span></span>
                <label class="switch"><input type="hidden" name="enabled" value="0"><input type="checkbox" name="enabled" value="1" <?= $loginVerify ? 'checked' : '' ?> data-component="auto-submit" aria-label="<?= e(t('profile.login_verify')) ?>"><span class="track"></span></label>
            </form>
        </div>
        <?php if ($passkeys): ?>
            <h3 class="card-title mt-2 mb-1 small"><?= e(t('profile.your_passkeys')) ?></h3>
            <div class="list">
                <?php foreach ($passkeys as $pk): ?>
                    <div class="list-item"><i class="fa-solid fa-key muted"></i><span class="grow"><span class="title" style="display:block"><?= e($pk['name'] ?: 'Passkey') ?></span><span class="sub"><?= e(t('profile.added')) ?> <?= e(fmt_date($pk['created_at'])) ?><?= $pk['last_used_at'] ? ' · ' . e(t('profile.used')) . ' ' . e(time_ago($pk['last_used_at'])) : '' ?></span></span>
                        <form method="post" action="<?= e(url('/profile/passkeys/' . $pk['id'] . '/delete')) ?>" data-ajax data-confirm="<?= e(t('profile.confirm_remove_passkey')) ?>"><?= csrf_field() ?><button class="icon-btn icon-btn-sm text-danger" type="submit" aria-label="<?= e(t('admin.remove')) ?>"><i class="fa-solid fa-trash"></i></button></form></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>

    <form class="card form" method="post" action="<?= e(url('/profile/password')) ?>" data-ajax data-reset novalidate>
        <?= csrf_field() ?>
        <h2 class="card-title"><i class="fa-solid fa-lock text-primary"></i> <?= e($u['password_hash'] ? t('profile.change_password') : t('profile.set_password')) ?></h2>
        <?php if ($u['password_hash']): ?><div class="field"><label for="cp"><?= e(t('profile.current_password')) ?></label><input class="input" id="cp" type="password" name="current_password" autocomplete="current-password" required></div><?php endif; ?>
        <div class="field"><label for="np"><?= e(t('auth.new_password')) ?></label><input class="input" id="np" type="password" name="password" autocomplete="new-password" required minlength="8"><span class="hint"><?= e(t('auth.pw_rules')) ?></span></div>
        <div class="field"><label for="np2"><?= e(t('form.password_confirm')) ?></label><input class="input" id="np2" type="password" name="password_confirmation" autocomplete="new-password" required></div>
        <button class="btn btn-primary btn-sm" type="submit"><?= e(t('common.save')) ?></button>
        <p class="xs muted mb-0"><?= e(t('profile.pw_other_sessions')) ?></p>
    </form>
</div>

<?php if ($c['2fa']): ?>
<section class="card mt-2" id="tfa-manage">
    <h2 class="card-title mb-1"><i class="fa-solid fa-mobile-screen text-primary"></i> <?= e(t('profile.2fa')) ?></h2>
    <p class="small muted"><?= e(t('profile.2fa_manage_d')) ?></p>
    <div class="profile-cols">
        <form class="form" method="post" action="<?= e(url('/profile/2fa/recovery')) ?>" data-ajax data-component="recovery-codes">
            <?= csrf_field() ?>
            <input class="input" name="code" placeholder="<?= e(t('profile.code_or_pw')) ?>" autocomplete="one-time-code" aria-label="<?= e(t('auth.code')) ?>">
            <input class="input" type="password" name="password" placeholder="<?= e(t('form.password')) ?>" autocomplete="current-password" aria-label="<?= e(t('form.password')) ?>">
            <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-rotate"></i> <?= e(t('profile.new_codes')) ?></button>
            <div class="codes" hidden></div>
        </form>
        <form class="form" method="post" action="<?= e(url('/profile/2fa/disable')) ?>" data-ajax data-confirm="<?= e(t('profile.confirm_disable_2fa')) ?>">
            <?= csrf_field() ?>
            <input class="input" name="code" placeholder="<?= e(t('profile.code_or_pw')) ?>" autocomplete="one-time-code" aria-label="<?= e(t('auth.code')) ?>">
            <input class="input" type="password" name="password" placeholder="<?= e(t('form.password')) ?>" autocomplete="current-password" aria-label="<?= e(t('form.password')) ?>">
            <button class="btn btn-sm btn-danger" type="submit"><i class="fa-solid fa-power-off"></i> <?= e(t('profile.disable_2fa')) ?></button>
        </form>
    </div>
</section>
<?php endif; ?>

<section class="card mt-2">
    <div class="card-head"><h2 class="card-title"><i class="fa-solid fa-display text-primary"></i> <?= e(t('profile.sessions')) ?></h2>
        <?php if (count($sessions) > 1): ?><form method="post" action="<?= e(url('/profile/sessions/revoke-all')) ?>" data-ajax data-confirm="<?= e(t('profile.confirm_logout_all')) ?>"><?= csrf_field() ?><button class="btn btn-xs btn-outline text-danger" type="submit"><?= e(t('profile.logout_all')) ?></button></form><?php endif; ?></div>
    <div class="list">
        <?php foreach ($sessions as $s): $isCur = hash_equals($current, $s['session_hash']); ?>
            <div class="list-item">
                <span class="ic-box ic-box-sm"><i class="fa-solid <?= str_contains((string)$s['device'], 'Android') || str_contains((string)$s['device'], 'iOS') ? 'fa-mobile-screen' : 'fa-laptop' ?>"></i></span>
                <span class="grow"><span class="title" style="display:block"><?= e($s['device'] ?: '—') ?> <?php if ($isCur): ?><span class="badge badge-success"><?= e(t('profile.this_device')) ?></span><?php endif; ?></span><span class="sub"><?= e($s['ip']) ?> · <?= e(time_ago($s['last_seen_at'] ?: $s['created_at'])) ?></span></span>
                <?php if (!$isCur): ?><form method="post" action="<?= e(url('/profile/sessions/' . $s['id'] . '/revoke')) ?>" data-ajax><?= csrf_field() ?><button class="btn btn-xs btn-ghost text-danger" type="submit"><?= e(t('profile.revoke')) ?></button></form><?php endif; ?>
            </div>
        <?php endforeach; ?>
    </div>
</section>

<section class="card mt-2">
    <h2 class="card-title mb-1"><i class="fa-solid fa-clock-rotate-left text-primary"></i> <?= e(t('profile.login_history')) ?></h2>
    <div class="list">
        <?php foreach ($history as $h): ?>
            <div class="list-item">
                <i class="fa-solid <?= $h['success'] ? 'fa-circle-check text-success' : 'fa-circle-xmark text-danger' ?>"></i>
                <span class="grow"><span class="title" style="display:block"><?= e(UA::summary((string)$h['user_agent'])) ?> · <?= e($h['method']) ?></span><span class="sub"><?= e($h['ip']) ?><?= !$h['success'] ? ' · ' . e(t('profile.failed')) : '' ?></span></span>
                <span class="meta"><?= e(fmt_date($h['created_at'], true)) ?></span>
            </div>
        <?php endforeach; ?>
        <?php if (!$history): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
    </div>
</section>
