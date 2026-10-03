<?php /** @var array $checks */ $allOk = !in_array(false, $checks, true); ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install Oryzenx</title>
<meta name="robots" content="noindex">
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" referrerpolicy="no-referrer">
<link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/components.css')) ?>">
<style>body{padding:20px 14px}.wrap{max-width:560px;margin:0 auto}.ok{color:var(--success)}.bad{color:var(--danger)}.checks{display:grid;grid-template-columns:1fr 1fr;gap:.3rem .8rem;font-size:.84rem}</style>
</head>
<body>
<div class="wrap stack">
    <div class="row"><span class="ic-box"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div><h1 style="font-size:1.3rem;margin:0">Install Oryzenx</h1><p class="muted small mb-0">One-time setup. This page disables itself afterwards.</p></div></div>
    <div class="card">
        <h2 class="card-title mb-1">Server requirements</h2>
        <div class="checks"><?php foreach ($checks as $k => $ok): ?><span><i class="fa-solid <?= $ok ? 'fa-circle-check ok' : 'fa-circle-xmark bad' ?>"></i> <?= e($k) ?></span><?php endforeach; ?></div>
        <?php if (!$allOk): ?><div class="alert alert-danger mt-1">Fix the failed requirements (usually folder permissions: 775) and reload.</div><?php endif; ?>
    </div>
    <form class="card form" id="install-form" method="post" action="<?= e(url('/install')) ?>" novalidate>
        <?= csrf_field() ?>
        <h2 class="card-title">Database (MySQL / MariaDB)</h2>
        <div class="grid grid-2">
            <div class="field"><label for="h">Host</label><input class="input" id="h" name="db_host" value="localhost" required></div>
            <div class="field"><label for="p">Port</label><input class="input" id="p" name="db_port" value="3306" inputmode="numeric"></div>
        </div>
        <div class="field"><label class="req" for="n">Database name</label><input class="input" id="n" name="db_name" required></div>
        <div class="grid grid-2">
            <div class="field"><label class="req" for="u">Username</label><input class="input" id="u" name="db_user" required autocomplete="off"></div>
            <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="db_pass" type="password" autocomplete="new-password"></div>
        </div>
        <h2 class="card-title mt-1">Site</h2>
        <div class="field"><label for="sn">Site name</label><input class="input" id="sn" name="site_name" value="Oryzenx"></div>
        <h2 class="card-title mt-1">Administrator <span class="muted xs">(optional — otherwise the first registered account becomes admin)</span></h2>
        <div class="field"><label for="an">Name</label><input class="input" id="an" name="admin_name" autocomplete="name"></div>
        <div class="field"><label for="ae">Email</label><input class="input" id="ae" name="admin_email" type="email" autocomplete="email"></div>
        <div class="field"><label for="ap">Password</label><input class="input" id="ap" name="admin_password" type="password" autocomplete="new-password"><span class="hint">8+ characters with letters and numbers.</span></div>
        <button class="btn btn-primary" type="submit" <?= $allOk ? '' : 'disabled' ?>><i class="fa-solid fa-download"></i> Install</button>
        <div id="msg"></div>
    </form>
</div>
<script>
document.getElementById('install-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = this.querySelector('button[type=submit]'), msg = document.getElementById('msg');
  btn.classList.add('is-loading'); msg.innerHTML = '';
  this.querySelectorAll('.error').forEach(el => el.remove());
  try {
    const r = await fetch(this.action, { method: 'POST', body: new FormData(this), headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content } });
    const d = await r.json();
    if (d.ok) { msg.innerHTML = '<div class="alert alert-success">' + d.message + '</div>'; setTimeout(() => location.href = d.redirect, 900); return; }
    msg.innerHTML = '<div class="alert alert-danger"></div>'; msg.firstChild.textContent = d.message;
    Object.entries(d.errors || {}).forEach(([k, v]) => { const i = this.querySelector('[name="' + k + '"]'); if (i) { const s = document.createElement('div'); s.className = 'error'; s.textContent = v; i.parentElement.appendChild(s); } });
  } catch (err) { msg.innerHTML = '<div class="alert alert-danger">Request failed. Check server logs.</div>'; }
  btn.classList.remove('is-loading');
});
</script>
</body>
</html>
