<?php
/**
 * Email links: /verify-email?token=… (confirm address) and
 * /recover-2fa?token=… (disable 2FA after losing the authenticator).
 */
defined('APP') || exit;

$path = defined('NAV_PATH') ? NAV_PATH : request_path();
$token = input('token');
$ok = false;
$title = t('auth.link_invalid');
$text = t('auth.link_invalid_sub');

if ($path === '/verify-email') {
    $uid = check_email_token($token, 'verify');
    if ($uid) {
        q('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [$uid]);
        $promoted = maybe_promote_first_admin($uid);
        $ok = true;
        $title = t('auth.verified_title');
        $text = $promoted ? t('auth.verified_admin') : t('auth.verified_text');
    }
} else {
    // Recovery needs an explicit click (POST) so link scanners can't trigger it
    if (check_email_token($token, '2fa_recovery', false)) {
        $ok = null;
        $title = t('auth.2fa_recover_title');
        $text = t('auth.2fa_recover_text');
    }
}
meta(['title' => $title, 'robots' => 'noindex', 'cache' => false]);
?>
<div class="page auth-wrap" data-page="verify">
  <div class="card auth-card center">
    <div class="auth-head">
      <span class="icon-box lg <?= $ok ? 'success' : ($ok === null ? 'warning' : 'danger') ?>"><i class="fa-solid <?= $ok ? 'fa-circle-check' : ($ok === null ? 'fa-shield-halved' : 'fa-link-slash') ?>" style="animation:popIn .5s var(--ease)"></i></span>
      <h1><?= e($title) ?></h1>
      <p><?= e($text) ?></p>
    </div>
    <?php if ($ok === null): ?>
      <form method="post" action="<?= e(url('/api/auth?action=recover_2fa')) ?>" data-ajax>
        <?= csrf_field() ?><input type="hidden" name="token" value="<?= e($token) ?>">
        <button class="btn btn-block btn-danger" type="submit"><i class="fa-solid fa-shield"></i><?= e(t('auth.2fa_recover_btn')) ?></button>
      </form>
    <?php else: ?>
    <a class="btn btn-block" href="<?= e(url(user() ? '/profile' : '/login')) ?>"><?= e(user() ? t('nav.profile') : t('auth.login')) ?></a>
    <?php endif ?>
  </div>
</div>
