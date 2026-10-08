<h1 class="auth-title">Two-step verification</h1>
<p class="muted small">Enter the 6-digit code from your authenticator app.</p>
<form class="auth-form" method="post" action="<?= e(url('/admin/login/2fa')) ?>" data-ajax data-no-spa>
  <div class="field">
    <label class="label" for="otp">Authentication code</label>
    <input class="input input-otp" id="otp" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>
  </div>
  <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Verify</button>
</form>
<p class="small center"><a href="<?= e(url('/admin/login')) ?>">Back to sign in</a></p>
