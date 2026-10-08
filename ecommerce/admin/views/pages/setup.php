<h1 class="auth-title">Create the owner account</h1>
<p class="muted small">This screen is available only until the first admin exists. You need the <code>INSTALL_KEY</code> from <code>config.php</code>.</p>
<form class="auth-form" method="post" action="<?= e(url('/admin/setup')) ?>" data-ajax data-no-spa>
  <div class="field">
    <label class="label" for="s-key">Install key</label>
    <input class="input" id="s-key" name="install_key" type="password" autocomplete="off" required>
  </div>
  <div class="field">
    <label class="label" for="s-name">Your name</label>
    <input class="input" id="s-name" name="name" autocomplete="name" required>
  </div>
  <div class="field">
    <label class="label" for="s-email">Email</label>
    <input class="input" id="s-email" name="email" type="email" autocomplete="username" required>
  </div>
  <div class="field">
    <label class="label" for="s-pass">Password</label>
    <input class="input" id="s-pass" name="password" type="password" autocomplete="new-password" minlength="10" required>
    <p class="field-hint small muted">10+ characters with upper &amp; lower case, a number and a symbol.</p>
  </div>
  <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Create account</button>
</form>
