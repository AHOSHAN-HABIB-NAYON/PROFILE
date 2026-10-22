<?php use OryzenX\Core\View; /** @var callable $e */
$failed = array_filter($requirements, fn ($c) => $c['required'] && !$c['ok']);
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light"><title>Install OryzenX</title>
<link rel="stylesheet" href="<?= $e(View::asset('css/tokens.css')) ?>"><link rel="stylesheet" href="<?= $e(View::asset('css/app.css')) ?>"></head>
<body class="install-page">
<main class="install">
  <div class="install-head"><?php include __DIR__ . '/../partials/logo.php'; ?><h1>Install OryzenX</h1><p class="muted">This one-time setup creates the database tables, your first administrator and the private configuration file. It locks itself when finished.</p></div>
  <?php if (!$https): ?><div class="banner warn">This page is not served over HTTPS. Use HTTPS in production — credentials entered here travel over this connection.</div><?php endif; ?>

  <section class="card install-step">
    <h2>1. Server requirements</h2>
    <ul class="req-list">
      <?php foreach ($requirements as $c): ?>
      <li class="<?= $c['ok'] ? 'ok' : ($c['required'] ? 'err' : 'warn') ?>"><span class="req-dot" aria-hidden="true"></span><span><?= $e($c['label']) ?></span><span class="subtle"><?= $e($c['detail']) ?></span></li>
      <?php endforeach; ?>
    </ul>
    <?php if ($failed): ?><div class="banner err">Fix the failed requirements above, then reload this page.</div><?php endif; ?>
  </section>

  <form class="card install-step" id="install-form" novalidate>
    <h2>2. Install key</h2>
    <p class="muted">For security, open the file <code>storage/install.key</code> on your server (via your hosting file manager or SSH) and paste its contents. This proves you control the server.</p>
    <div class="field"><label for="install_key">Install key</label><input id="install_key" name="install_key" required autocomplete="off" spellcheck="false"></div>

    <h2>3. Database</h2>
    <p class="muted">Create an empty MySQL/MariaDB database and user in your hosting panel first (utf8mb4).</p>
    <div class="grid-2">
      <div class="field"><label for="db_host">Host</label><input id="db_host" name="db_host" value="localhost" required></div>
      <div class="field"><label for="db_port">Port</label><input id="db_port" name="db_port" value="3306" inputmode="numeric" required></div>
      <div class="field"><label for="db_name">Database name</label><input id="db_name" name="db_name" required></div>
      <div class="field"><label for="db_user">Username</label><input id="db_user" name="db_user" required autocomplete="off"></div>
      <div class="field span-2"><label for="db_pass">Password</label><input id="db_pass" name="db_pass" type="password" autocomplete="new-password"></div>
    </div>
    <div class="row-actions"><button class="btn btn-outline" type="button" id="test-db">Test connection</button><span id="db-result" class="subtle" role="status"></span></div>

    <h2>4. Application</h2>
    <div class="grid-2">
      <div class="field span-2"><label for="app_url">Application URL</label><span class="hint">Public address, e.g. https://bd.oryzenx.com</span><input id="app_url" name="app_url" type="url" value="<?= $e($guessUrl) ?>" required></div>
      <div class="field"><label for="site_name">Site name</label><input id="site_name" name="site_name" value="OryzenX"></div>
      <div class="field"><label for="timezone">Business timezone</label><input id="timezone" name="timezone" value="Asia/Dhaka"></div>
      <div class="field span-2"><label for="support_email">Support email (optional)</label><input id="support_email" name="support_email" type="email"></div>
    </div>

    <h2>5. First administrator</h2>
    <div class="grid-2">
      <div class="field"><label for="admin_name">Full name</label><input id="admin_name" name="admin_name" required autocomplete="name"></div>
      <div class="field"><label for="admin_email">Email</label><input id="admin_email" name="admin_email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="admin_password">Password</label><span class="hint">At least 10 characters with letters and numbers.</span><input id="admin_password" name="admin_password" type="password" required minlength="10" autocomplete="new-password"></div>
      <div class="field"><label for="admin_password_confirmation">Confirm password</label><input id="admin_password_confirmation" name="admin_password_confirmation" type="password" required minlength="10" autocomplete="new-password"></div>
    </div>

    <details class="install-optional"><summary>6. Optional: SMTP email and market data (can be set later in the admin panel)</summary>
      <div class="grid-2">
        <div class="field"><label for="smtp_host">SMTP host</label><input id="smtp_host" name="smtp_host"></div>
        <div class="field"><label for="smtp_port">SMTP port</label><input id="smtp_port" name="smtp_port" value="587" inputmode="numeric"></div>
        <div class="field"><label for="smtp_encryption">Encryption</label><select id="smtp_encryption" name="smtp_encryption"><option value="tls">TLS / STARTTLS</option><option value="ssl">SSL</option><option value="none">None</option></select></div>
        <div class="field"><label for="smtp_from_email">Sender email</label><input id="smtp_from_email" name="smtp_from_email" type="email"></div>
        <div class="field"><label for="smtp_username">SMTP username</label><input id="smtp_username" name="smtp_username" autocomplete="off"></div>
        <div class="field"><label for="smtp_password">SMTP password</label><input id="smtp_password" name="smtp_password" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="market_provider">Market data provider</label><select id="market_provider" name="market_provider"><option value="coingecko">CoinGecko</option><option value="binance">Binance (USDT pairs)</option></select></div>
        <div class="field"><label for="market_api_key">CoinGecko API key (optional)</label><input id="market_api_key" name="market_api_key" autocomplete="off"></div>
      </div>
    </details>

    <div id="install-result" role="status" aria-live="polite"></div>
    <button class="btn btn-primary btn-block" type="submit" id="install-btn" <?= $failed ? 'disabled' : '' ?>>Install OryzenX</button>
  </form>
</main>
<script src="<?= $e(View::asset('js/install.js')) ?>" defer></script>
</body></html>
