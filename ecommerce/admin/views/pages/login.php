<?php
/**
 * @var string $next @var string $googleClient
 */
?>
<h1 class="auth-title">Sign in</h1>
<p class="muted small">Welcome back. Use your admin email and password.</p>
<form class="auth-form" method="post" action="<?= e(url('/admin/login')) ?>" data-ajax data-no-spa>
  <input type="hidden" name="next" value="<?= e($next) ?>">
  <div class="field">
    <label class="label" for="login-email">Email</label>
    <input class="input" id="login-email" type="email" name="email" autocomplete="username" required autofocus>
  </div>
  <div class="field">
    <label class="label" for="login-password">Password</label>
    <div class="input-group">
      <input class="input" id="login-password" type="password" name="password" autocomplete="current-password" required>
      <button type="button" class="icon-btn" data-action="toggle-password" data-target="#login-password" aria-label="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
    </div>
  </div>
  <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Sign in</button>
</form>
<?php if ($googleClient): ?>
  <div class="auth-divider"><span>or</span></div>
  <div id="g_id_onload" data-client_id="<?= e($googleClient) ?>" data-callback="nsGoogleLogin" data-auto_prompt="false"></div>
  <div class="g_id_signin" data-type="standard" data-shape="pill" data-theme="outline" data-text="signin_with" data-size="large" data-width="320"></div>
  <script src="https://accounts.google.com/gsi/client" async nonce="<?= e(View::nonce()) ?>"></script>
<?php endif; ?>
