<?php
/**
 * @var array $admin @var ?string $setupSecret @var ?string $setupUri
 */
?>
<div class="a-page narrow">
  <div class="page-head"><div><h1 class="a-title">Account</h1><p class="muted small"><?= e($admin['email']) ?> · <?= e($admin['role']) ?> · last login <?= e(time_ago($admin['last_login_at'])) ?> from <?= e($admin['last_login_ip']) ?></p></div></div>

  <form class="a-card" method="post" action="<?= e(url('/admin/account/password')) ?>" data-ajax data-no-spa data-reset-on-success>
    <h2 class="a-card-title"><i class="fa-solid fa-key" aria-hidden="true"></i> Change password</h2>
    <div class="field"><label class="label" for="ac-cur">Current password</label><input id="ac-cur" class="input" type="password" name="current_password" autocomplete="current-password" required></div>
    <div class="field"><label class="label" for="ac-new">New password</label><input id="ac-new" class="input" type="password" name="new_password" autocomplete="new-password" minlength="10" required><p class="field-hint small muted">10+ characters, upper & lower case, a number and a symbol.</p></div>
    <button class="btn btn-primary" type="submit">Update password</button>
  </form>

  <section class="a-card">
    <h2 class="a-card-title"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Two-factor authentication (TOTP)</h2>
    <?php if ((int)$admin['two_factor_enabled'] === 1): ?>
      <p><span class="badge badge-success">Enabled</span> A 6-digit code from your authenticator app is required at sign-in.</p>
      <form method="post" action="<?= e(url('/admin/account/2fa/disable')) ?>" data-ajax data-no-spa>
        <div class="field"><label class="label" for="ac-dis">Confirm with your password to disable</label><input id="ac-dis" class="input" type="password" name="password" required></div>
        <button class="btn btn-danger" type="submit">Disable 2FA</button>
      </form>
    <?php elseif ($setupSecret): ?>
      <ol class="steps">
        <li>Open Google Authenticator, Microsoft Authenticator or Authy and add an account manually.</li>
        <li>Enter this key: <code class="secret" data-action="copy" data-copy="<?= e($setupSecret) ?>" title="Copy"><?= e(trim(chunk_split($setupSecret, 4, ' '))) ?></code></li>
        <li>On a phone you can also tap: <a href="<?= e($setupUri) ?>" data-no-spa>open in authenticator app</a></li>
      </ol>
      <form method="post" action="<?= e(url('/admin/account/2fa/enable')) ?>" data-ajax data-no-spa>
        <div class="field"><label class="label" for="ac-code">6-digit code</label><input id="ac-code" class="input input-otp" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
        <button class="btn btn-primary" type="submit">Verify &amp; enable</button>
      </form>
    <?php else: ?>
      <p class="muted">Protect your admin account with a second step at login.</p>
      <button type="button" class="btn btn-primary" data-action="post" data-url="<?= e(url('/admin/account/2fa/setup')) ?>"><i class="fa-solid fa-qrcode" aria-hidden="true"></i> Set up 2FA</button>
    <?php endif; ?>
  </section>
</div>
