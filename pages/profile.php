<?php
/** Profile: overview, edit, security center, payments, orders, notifications. */
defined('APP') || exit;
require_once ROOT . '/core/totp.php';
require_once ROOT . '/core/google.php';

$u = require_login();
$uid = (int)$u['id'];
$tab = $params['tab'] ?: 'overview';
$sec = row('SELECT * FROM user_security WHERE user_id = ?', [$uid]) ?? ['login_notify' => 1, 'email_login_verify' => 0, 'password_changed_at' => null, 'notify_sound' => 1, 'notify_email' => 1];
$tabs = [
    'overview' => ['fa-gauge', t('profile.overview')], 'edit' => ['fa-user-pen', t('profile.edit')], 'security' => ['fa-shield-halved', t('profile.security')],
    'payments' => ['fa-wallet', t('profile.payments')], 'orders' => ['fa-bag-shopping', t('profile.orders')], 'notifications' => ['fa-bell', t('nav.notifications')],
];
meta(['title' => $tabs[$tab][1] . ' · ' . t('nav.profile'), 'robots' => 'noindex', 'cache' => false, 'nav' => 'profile']);
$status = fn(string $s) => '<span class="status status-' . e($s) . '">' . e(t('status.' . $s)) . '</span>';
$methodName = array_column(rows('SELECT code, name FROM payment_methods'), 'name', 'code') + ['balance' => t('pay.balance')];
?>
<style data-css="profile">
.p-head{display:flex;align-items:center;gap:14px;padding:18px}
.p-head h1{font-size:1.2rem;margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.p-head .sub{color:var(--muted);font-size:.86rem;margin-top:2px}
.p-head .pill{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 11px;border-radius:999px;background:var(--soft);font-size:.76rem;font-weight:700;color:var(--text-2)}
.p-head .logout{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 25%,var(--border));background:color-mix(in srgb,var(--danger) 7%,var(--card))}
.hero-navy.p-status{margin:14px 0}
.p-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:18px}
@media (min-width:720px){.p-stats{grid-template-columns:repeat(4,1fr)}}
.sec-score{display:flex;align-items:center;gap:14px}
.ring{--p:0;width:64px;height:64px;border-radius:50%;background:conic-gradient(var(--success) calc(var(--p)*1%),var(--soft) 0);display:grid;place-items:center;flex:0 0 64px}
.ring b{width:50px;height:50px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:.9rem}
.sec-block{margin-bottom:14px}
.sec-block h2{font-size:1rem;display:flex;align-items:center;gap:8px}
.tbl{width:100%;border-collapse:collapse;font-size:.84rem}
.tbl th,.tbl td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border);vertical-align:top}
.tbl th{color:var(--muted);font-weight:600;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em}
@media (max-width:719px){.tbl thead{display:none}.tbl tr{display:block;padding:10px 0;border-bottom:1px solid var(--border)}.tbl td{display:flex;justify-content:space-between;gap:12px;border:0;padding:3px 0}
  .tbl td::before{content:attr(data-label);color:var(--muted);font-size:.76rem}}
.pay-item{display:flex;flex-direction:column;gap:8px}
.qr-box{width:196px;height:196px;padding:8px;background:#fff;border-radius:14px;margin:8px auto}
.secret{font-family:ui-monospace,monospace;letter-spacing:.12em;background:var(--soft);padding:6px 10px;border-radius:8px;word-break:break-all}
</style>
<div class="page" data-page="profile">
  <section class="card p-head">
    <span class="avatar lg"><?php if ($u['avatar']): ?><img src="<?= e(media_url($u['avatar'])) ?>" alt=""><?php else: ?><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?><?php endif ?></span>
    <div class="grow" style="min-width:0">
      <h1><span class="truncate"><?= e($u['name']) ?></span><?php if ($u['is_vip']): ?><span class="badge vip"><i class="fa-solid fa-crown"></i>VIP</span><?php endif ?><span class="badge <?= is_staff($u) ? 'solid' : '' ?>"><?= e(t('role.' . $u['role'])) ?></span></h1>
      <div class="sub truncate"><?= e($u['email']) ?></div>
      <span class="pill"><i class="fa-regular fa-calendar"></i><?= e(t('profile.joined', ['date' => fmt_date($u['created_at'])])) ?></span>
    </div>
    <button class="sq-btn logout" data-action="logout" aria-label="<?= e(t('auth.logout')) ?>" title="<?= e(t('auth.logout')) ?>"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
  </section>

  <?php if (!$u['email_verified_at']): ?>
    <div class="alert warning mb-2"><i class="fa-solid fa-envelope-circle-check"></i><span class="grow"><?= e(t('profile.verify_email')) ?></span>
      <button class="btn btn-sm" data-action="post" data-url="<?= e(url('/api/auth?action=resend_verification')) ?>"><?= e(t('profile.resend')) ?></button></div>
  <?php endif ?>

  <nav class="tabs" aria-label="<?= e(t('nav.profile')) ?>">
    <?php foreach ($tabs as $k => [$icon, $label]): ?>
      <a class="tab <?= $tab === $k ? 'active' : '' ?>" href="<?= e(url('/profile' . ($k === 'overview' ? '' : '/' . $k))) ?>"<?= $tab === $k ? ' aria-current="page"' : '' ?>><i class="fa-solid <?= $icon ?>"></i><?= e($label) ?></a>
    <?php endforeach ?>
  </nav>

<?php if ($tab === 'overview'):
    $st = row("SELECT (SELECT COUNT(*) FROM payments WHERE user_id = ?) n, (SELECT COUNT(*) FROM payments WHERE user_id = ? AND status = 'pending') p", [$uid, $uid]);
    $spent = implode(' · ', array_map(fn($r) => money($r['s'], $r['currency']),
        rows("SELECT currency, SUM(amount) s FROM payments WHERE user_id = ? AND status IN ('approved','completed') GROUP BY currency ORDER BY currency = 'USD' DESC", [$uid])));
    $recent = rows('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 4', [$uid]);
    $bal = rows('SELECT * FROM balance_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 5', [$uid]); ?>
  <section class="hero-navy p-status">
    <i class="fa-solid fa-crown wm" aria-hidden="true"></i>
    <span class="kicker"><i class="fa-solid fa-shield-halved"></i><?= e(t('profile.status')) ?></span>
    <h2 class="mt-1 mb-0"><?= e(is_staff($u) ? t('role.' . $u['role']) : ($u['is_vip'] ? t('profile.vip') : t('profile.member'))) ?></h2>
    <p class="mb-2"><?= e(is_staff($u) ? t('profile.status_admin') : t('profile.status_user')) ?></p>
    <?php if (is_staff($u)): ?><a class="btn btn-white" href="<?= e(url('/admin')) ?>" data-no-spa><i class="fa-solid fa-gauge-high"></i><?= e(t('profile.admin_panel')) ?></a>
    <?php else: ?><a class="btn btn-white" href="<?= e(url('/services')) ?>"><i class="fa-solid fa-compass"></i><?= e(t('profile.explore')) ?></a><?php endif ?>
  </section>
  <div class="p-stats">
    <div class="card stat-tile"><span class="lbl"><?= e(t('profile.payments')) ?></span><span class="val"><?= num((int)$st['n']) ?></span><i class="fa-solid fa-receipt ic"></i></div>
    <div class="card stat-tile"><span class="lbl"><?= e(t('profile.total_spent')) ?></span><span class="val"><?= e($spent ?: money(0)) ?></span><i class="fa-solid fa-sack-dollar ic"></i></div>
    <div class="card stat-tile"><span class="lbl"><?= e(t('profile.under_review')) ?></span><span class="val"><?= num((int)$st['p']) ?></span><i class="fa-solid fa-hourglass-half ic"></i></div>
    <div class="card stat-tile"><span class="lbl"><?= e(t('profile.balance')) ?></span><span class="val"><?= e(money($u['balance'])) ?></span><i class="fa-solid fa-wallet ic"></i></div>
  </div>
  <section class="section">
    <div class="section-head"><h2><?= e(t('profile.recent_orders')) ?></h2><a href="<?= e(url('/profile/orders')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <?php if ($recent): ?><div class="list"><?php foreach ($recent as $o): ?>
      <a class="list-row" href="<?= e(url('/payment/' . $o['code'])) ?>"><span class="icon-box sm"><i class="fa-solid fa-receipt"></i></span>
        <span class="grow" style="min-width:0"><strong class="truncate" style="display:block;font-size:.9rem"><?= e($o['product_name']) ?></strong><span class="tiny muted">#<?= e($o['code']) ?> · <?= e(time_ago($o['created_at'])) ?></span></span><?= $status($o['status']) ?></a>
    <?php endforeach ?></div>
    <?php else: ?><div class="card empty"><div class="icon-box"><i class="fa-solid fa-bag-shopping"></i></div><p><?= e(t('profile.no_orders')) ?></p><a class="btn" href="<?= e(url('/services')) ?>"><?= e(t('home.explore')) ?></a></div><?php endif ?>
  </section>
  <?php if ($bal): ?>
  <section class="section">
    <div class="section-head"><h2><?= e(t('profile.balance_history')) ?></h2></div>
    <div class="list"><?php foreach ($bal as $b): ?>
      <div class="list-row"><span class="icon-box sm <?= $b['type'] === 'credit' ? 'success' : 'danger' ?>"><i class="fa-solid <?= $b['type'] === 'credit' ? 'fa-arrow-down' : 'fa-arrow-up' ?>"></i></span>
        <span class="grow"><strong style="font-size:.88rem"><?= e($b['reason']) ?></strong><br><span class="tiny muted"><?= e(fmt_date($b['created_at'], true)) ?></span></span>
        <b class="<?= $b['type'] === 'credit' ? 'rt-up' : 'rt-down' ?>"><?= $b['type'] === 'credit' ? '+' : '−' ?><?= e(money($b['amount'])) ?></b></div>
    <?php endforeach ?></div>
  </section>
  <?php endif ?>

<?php elseif ($tab === 'edit'): ?>
  <section class="card card-pad-lg">
    <form method="post" action="<?= e(url('/api/auth?action=profile')) ?>" data-ajax enctype="multipart/form-data" novalidate>
      <?= csrf_field() ?>
      <div class="row mb-2">
        <span class="avatar lg"><?php if ($u['avatar']): ?><img src="<?= e(media_url($u['avatar'])) ?>" alt=""><?php else: ?><?= e(mb_strtoupper(mb_substr($u['name'], 0, 1))) ?><?php endif ?></span>
        <label class="file-drop grow" style="padding:12px"><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" data-preview><span data-file-label><i class="fa-solid fa-camera"></i> <?= e(t('profile.change_photo')) ?></span></label>
      </div>
      <div class="grid-2">
        <div class="form-group"><label class="label" for="pe-name"><?= e(t('form.name')) ?></label><input class="input" id="pe-name" name="name" value="<?= e($u['name']) ?>" required maxlength="120"></div>
        <div class="form-group"><label class="label" for="pe-phone"><?= e(t('form.phone')) ?></label><input class="input" id="pe-phone" name="phone" value="<?= e($u['phone']) ?>" maxlength="40" inputmode="tel"></div>
      </div>
      <div class="form-group"><label class="label" for="pe-email"><?= e(t('form.email')) ?></label><input class="input" id="pe-email" type="email" name="email" value="<?= e($u['email']) ?>" required maxlength="191">
        <p class="hint"><?= e(t('profile.email_change_hint')) ?></p></div>
      <div class="form-group"><label class="label" for="pe-cur"><?= e(t('form.current_password')) ?></label><input class="input" id="pe-cur" type="password" name="current_password" autocomplete="current-password" maxlength="200">
        <p class="hint"><?= e(t('profile.password_for_email')) ?></p></div>
      <div class="form-group"><label class="label" for="pe-bio"><?= e(t('profile.bio')) ?></label><textarea class="textarea" id="pe-bio" name="bio" maxlength="500" rows="3"><?= e($u['bio']) ?></textarea></div>
      <div class="form-group"><label class="label" for="pe-lang"><?= e(t('nav.language')) ?></label>
        <select class="select" id="pe-lang" name="lang"><?php foreach (LANGS as $c => $n): ?><option value="<?= $c ?>" <?= ($u['lang'] ?: lang()) === $c ? 'selected' : '' ?>><?= e($n) ?></option><?php endforeach ?></select></div>
      <div class="upload-progress"><i></i></div>
      <button class="btn btn-lg btn-block" type="submit"><?= e(t('common.save')) ?></button>
    </form>
  </section>

<?php elseif ($tab === 'security'):
    $twofa = row('SELECT * FROM user_2fa WHERE user_id = ?', [$uid]);
    $passkeys = rows('SELECT * FROM user_passkeys WHERE user_id = ? ORDER BY id DESC', [$uid]);
    $sessions = rows('SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active DESC LIMIT 20', [$uid]);
    $history = rows('SELECT * FROM login_history WHERE user_id = ? OR email = ? ORDER BY id DESC LIMIT 15', [$uid, $u['email']]);
    $curHash = hash('sha256', session_id());
    $checks = [
        [t('sec.email_verified'), (bool)$u['email_verified_at']],
        [t('sec.twofa'), $twofa && $twofa['enabled']],
        [t('sec.passkey'), (bool)$passkeys],
        [t('sec.password_recent'), $sec['password_changed_at'] && strtotime($sec['password_changed_at']) > strtotime('-180 days')],
    ];
    $score = (int)round(count(array_filter(array_column($checks, 1))) / count($checks) * 100);
    $setup = null;
    if (!$twofa || !$twofa['enabled']) $setup = $twofa ? ['secret' => decrypt_value($twofa['secret_enc'])] : twofa_setup($u);
    if ($setup && empty($setup['uri'])) {
        $issuer = rawurlencode((string)setting('site_name'));
        $setup['uri'] = 'otpauth://totp/' . $issuer . ':' . rawurlencode($u['email']) . '?secret=' . $setup['secret'] . '&issuer=' . $issuer . '&digits=6&period=30';
    } ?>
  <section class="card card-pad-lg sec-block">
    <div class="sec-score">
      <span class="ring" style="--p:<?= $score ?>"><b><?= num($score) ?>%</b></span>
      <div class="grow"><h2 class="mb-1"><?= e(t('sec.status')) ?></h2>
        <div class="row wrap"><?php foreach ($checks as [$label, $on]): ?><span class="badge <?= $on ? 'success' : 'muted' ?>"><i class="fa-solid <?= $on ? 'fa-check' : 'fa-xmark' ?>"></i><?= e($label) ?></span><?php endforeach ?></div></div>
    </div>
  </section>

  <section class="card card-pad-lg sec-block">
    <h2><i class="fa-solid fa-key" style="color:var(--primary)"></i><?= e(t('sec.change_password')) ?></h2>
    <form method="post" action="<?= e(url('/api/auth?action=password')) ?>" data-ajax data-reset novalidate>
      <?= csrf_field() ?>
      <?php if ($u['password_hash']): ?><div class="form-group"><label class="label" for="s-cur"><?= e(t('form.current_password')) ?></label><input class="input" id="s-cur" type="password" name="current_password" required autocomplete="current-password" maxlength="200"></div>
      <?php else: ?><p class="hint"><?= e(t('sec.no_password_yet')) ?></p><?php endif ?>
      <div class="grid-2">
        <div class="form-group"><label class="label" for="s-new"><?= e(t('form.new_password')) ?></label><input class="input" id="s-new" type="password" name="password" required autocomplete="new-password" maxlength="200"></div>
        <div class="form-group"><label class="label" for="s-new2"><?= e(t('form.confirm_password')) ?></label><input class="input" id="s-new2" type="password" name="password_confirm" required autocomplete="new-password" maxlength="200"></div>
      </div>
      <label class="check form-group"><input type="checkbox" name="logout_others" value="1" checked> <span class="small"><?= e(t('sec.logout_others_too')) ?></span></label>
      <button class="btn" type="submit"><?= e(t('sec.update_password')) ?></button>
    </form>
  </section>

  <section class="card card-pad-lg sec-block">
    <h2><i class="fa-solid fa-mobile-screen" style="color:var(--primary)"></i><?= e(t('sec.twofa_title')) ?>
      <?php if ($twofa && $twofa['enabled']): ?><span class="badge success"><?= e(t('sec.on')) ?></span><?php else: ?><span class="badge muted"><?= e(t('sec.off')) ?></span><?php endif ?></h2>
    <?php if ($twofa && $twofa['enabled']): ?>
      <p class="muted small"><?= e(t('sec.twofa_on_text', ['n' => num(count(json_decode((string)$twofa['recovery_codes'], true) ?: []))])) ?></p>
      <form method="post" action="<?= e(url('/api/auth?action=2fa_disable')) ?>" data-ajax novalidate>
        <?= csrf_field() ?>
        <div class="row wrap"><input class="input grow" type="password" name="password" placeholder="<?= e(t('form.current_password')) ?>" autocomplete="current-password" style="max-width:260px" aria-label="<?= e(t('form.current_password')) ?>">
          <input class="input" name="code" placeholder="<?= e(t('auth.code')) ?>" inputmode="numeric" maxlength="12" style="max-width:150px" aria-label="<?= e(t('auth.code')) ?>">
          <button class="btn btn-danger" type="submit"><?= e(t('sec.disable')) ?></button></div>
      </form>
    <?php else: ?>
      <p class="muted small"><?= e(t('sec.twofa_setup_text')) ?></p>
      <div data-init="twofa" class="center"><div class="qr-box" data-qr="<?= e($setup['uri']) ?>"></div>
        <p class="small muted mb-1"><?= e(t('sec.manual_key')) ?></p><code class="secret"><?= e(trim(chunk_split($setup['secret'], 4, ' '))) ?></code>
        <button class="icon-btn" data-action="copy" data-copy="<?= e($setup['secret']) ?>" aria-label="<?= e(t('common.copy')) ?>"><i class="fa-regular fa-copy"></i></button></div>
      <form method="post" action="<?= e(url('/api/auth?action=2fa_enable')) ?>" data-ajax data-init="recovery-codes" class="mt-2" novalidate>
        <?= csrf_field() ?>
        <div class="row"><input class="input code-input grow" name="code" required inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" aria-label="<?= e(t('auth.code')) ?>"><button class="btn" type="submit"><?= e(t('sec.enable')) ?></button></div>
      </form>
    <?php endif ?>
  </section>

  <?php if (setting_bool('security.passkeys_enabled')): ?>
  <section class="card card-pad-lg sec-block">
    <div class="row-between"><h2 class="mb-0"><i class="fa-solid fa-fingerprint" style="color:var(--primary)"></i><?= e(t('sec.passkeys')) ?></h2>
      <button class="btn btn-sm btn-soft" data-action="passkey-register"><i class="fa-solid fa-plus"></i><?= e(t('sec.add_passkey')) ?></button></div>
    <p class="muted small mt-1"><?= e(t('sec.passkeys_text')) ?></p>
    <?php if ($passkeys): ?><div class="list"><?php foreach ($passkeys as $pk): ?>
      <div class="list-row"><span class="icon-box sm"><i class="fa-solid fa-key"></i></span><span class="grow"><strong style="font-size:.88rem"><?= e($pk['name']) ?></strong><br>
        <span class="tiny muted"><?= e(t('sec.added', ['date' => fmt_date($pk['created_at'])])) ?><?= $pk['last_used_at'] ? ' · ' . e(t('sec.last_used', ['date' => time_ago($pk['last_used_at'])])) : '' ?></span></span>
        <button class="icon-btn" data-action="post" data-url="<?= e(url('/api/auth?action=passkey_delete')) ?>" data-params='{"id":<?= (int)$pk['id'] ?>}' data-confirm="<?= e(t('sec.remove_passkey')) ?>" data-danger="1" aria-label="<?= e(t('common.delete')) ?>"><i class="fa-regular fa-trash-can"></i></button></div>
    <?php endforeach ?></div><?php endif ?>
  </section>
  <?php endif ?>

  <section class="card card-pad-lg sec-block">
    <h2><i class="fa-solid fa-sliders" style="color:var(--primary)"></i><?= e(t('sec.preferences')) ?></h2>
    <form method="post" action="<?= e(url('/api/auth?action=security_prefs')) ?>" data-ajax>
      <?= csrf_field() ?>
      <div class="list mb-2">
        <label class="list-row"><span class="grow"><strong style="font-size:.88rem"><?= e(t('sec.login_alerts')) ?></strong><br><span class="tiny muted"><?= e(t('sec.login_alerts_text')) ?></span></span><span class="switch"><input type="checkbox" name="login_notify" value="1" <?= $sec['login_notify'] ? 'checked' : '' ?>><span></span></span></label>
        <label class="list-row"><span class="grow"><strong style="font-size:.88rem"><?= e(t('sec.email_login')) ?></strong><br><span class="tiny muted"><?= e(t('sec.email_login_text')) ?></span></span><span class="switch"><input type="checkbox" name="email_login_verify" value="1" <?= $sec['email_login_verify'] ? 'checked' : '' ?>><span></span></span></label>
        <label class="list-row"><span class="grow"><strong style="font-size:.88rem"><?= e(t('sec.email_notifications')) ?></strong><br><span class="tiny muted"><?= e(t('sec.email_notifications_text')) ?></span></span><span class="switch"><input type="checkbox" name="notify_email" value="1" <?= $sec['notify_email'] ? 'checked' : '' ?>><span></span></span></label>
      </div>
      <button class="btn btn-soft" type="submit"><?= e(t('common.save')) ?></button>
    </form>
    <?php if (google_enabled()): ?>
      <div class="row-between mt-2"><span><i class="fa-brands fa-google" style="color:#ea4335"></i> Google — <?= $u['google_id'] ? e(t('sec.linked')) : e(t('sec.not_linked')) ?></span>
        <?php if ($u['google_id']): ?><button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/auth?action=google_unlink')) ?>" data-confirm="<?= e(t('sec.unlink_google')) ?>"><?= e(t('sec.unlink')) ?></button>
        <?php else: ?><a class="btn btn-sm btn-ghost" href="<?= e(url('/auth/google?link=1')) ?>" data-no-spa><?= e(t('sec.link')) ?></a><?php endif ?></div>
    <?php endif ?>
  </section>

  <section class="card card-pad-lg sec-block">
    <div class="row-between"><h2 class="mb-0"><i class="fa-solid fa-laptop-mobile" style="color:var(--primary)"></i><?= e(t('sec.sessions')) ?></h2>
      <?php if (count($sessions) > 1): ?><button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/auth?action=logout_others')) ?>" data-confirm="<?= e(t('sec.logout_others_confirm')) ?>" data-danger="1"><?= e(t('sec.logout_others')) ?></button><?php endif ?></div>
    <div class="list mt-1"><?php foreach ($sessions as $s): $cur = hash_equals($s['session_hash'], $curHash); ?>
      <div class="list-row"><span class="icon-box sm <?= $cur ? 'success' : '' ?>"><i class="fa-solid <?= preg_match('~Android|iOS~', (string)$s['device']) ? 'fa-mobile-screen' : 'fa-laptop' ?>"></i></span>
        <span class="grow"><strong style="font-size:.86rem"><?= e($s['device'] ?: t('sec.unknown_device')) ?></strong> <?php if ($cur): ?><span class="badge success"><?= e(t('sec.this_device')) ?></span><?php endif ?><br>
          <span class="tiny muted"><?= e($s['ip']) ?> · <?= e(time_ago($s['last_active'])) ?></span></span>
        <?php if (!$cur): ?><button class="icon-btn" data-action="post" data-url="<?= e(url('/api/auth?action=revoke_session')) ?>" data-params='{"id":<?= (int)$s['id'] ?>}' aria-label="<?= e(t('sec.revoke')) ?>"><i class="fa-solid fa-right-from-bracket"></i></button><?php endif ?></div>
    <?php endforeach ?></div>
  </section>

  <section class="card card-pad-lg sec-block">
    <h2><i class="fa-solid fa-clock-rotate-left" style="color:var(--primary)"></i><?= e(t('sec.login_history')) ?></h2>
    <table class="tbl"><thead><tr><th><?= e(t('common.date')) ?></th><th><?= e(t('sec.device')) ?></th><th>IP</th><th><?= e(t('common.status')) ?></th></tr></thead><tbody>
      <?php foreach ($history as $h): ?><tr><td data-label="<?= e(t('common.date')) ?>"><?= e(fmt_date($h['created_at'], true)) ?></td><td data-label="<?= e(t('sec.device')) ?>"><?= e($h['device']) ?> <span class="tiny muted"><?= e($h['method']) ?></span></td>
        <td data-label="IP"><?= e($h['ip']) ?></td><td data-label="<?= e(t('common.status')) ?>"><span class="badge <?= $h['success'] ? 'success' : 'danger' ?>"><?= e($h['success'] ? t('sec.success') : t('sec.failed')) ?></span></td></tr><?php endforeach ?>
    </tbody></table>
  </section>

<?php elseif ($tab === 'payments'):
    $pays = rows('SELECT p.*, o.code, o.product_name FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 100', [$uid]); ?>
  <?php if (!$pays): ?><div class="card empty"><div class="icon-box"><i class="fa-solid fa-wallet"></i></div><?= e(t('profile.no_payments')) ?></div><?php endif ?>
  <div class="stack"><?php foreach ($pays as $p): ?>
    <article class="card pay-item">
      <div class="row-between"><strong class="truncate"><?= e($p['product_name']) ?></strong><?= $status($p['status']) ?></div>
      <dl class="kv">
        <dt><?= e(t('pay.order')) ?></dt><dd><a href="<?= e(url('/payment/' . $p['code'])) ?>">#<?= e($p['code']) ?></a></dd>
        <dt><?= e(t('pay.amount')) ?></dt><dd><b><?= e(money($p['amount'], $p['currency'])) ?></b></dd>
        <dt><?= e(t('pay.method')) ?></dt><dd><?= e($methodName[$p['method']] ?? $p['method']) ?></dd>
        <dt>TXID</dt><dd><code class="small" style="word-break:break-all"><?= e($p['txid']) ?></code></dd>
        <dt><?= e(t('common.date')) ?></dt><dd><?= e(fmt_date($p['created_at'], true)) ?></dd>
        <?php if ($p['screenshot']): ?><dt><?= e(t('pay.screenshot')) ?></dt><dd><a href="<?= e(url('/file/payment/' . $p['id'])) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-regular fa-image"></i> <?= e(t('common.view')) ?></a></dd><?php endif ?>
      </dl>
      <?php if ($p['admin_note']): ?><div class="alert <?= $p['status'] === 'rejected' ? 'danger' : 'success' ?>"><i class="fa-solid fa-comment-dots"></i><span><b><?= e(t('pay.admin_note')) ?>:</b> <?= e($p['admin_note']) ?></span></div><?php endif ?>
    </article>
  <?php endforeach ?></div>

<?php elseif ($tab === 'orders'):
    $orders = rows('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$uid]); ?>
  <?php if (!$orders): ?><div class="card empty"><div class="icon-box"><i class="fa-solid fa-bag-shopping"></i></div><p><?= e(t('profile.no_orders')) ?></p><a class="btn" href="<?= e(url('/services')) ?>"><?= e(t('home.explore')) ?></a></div><?php endif ?>
  <div class="list"><?php foreach ($orders as $o): ?>
    <a class="list-row" href="<?= e(url('/payment/' . $o['code'])) ?>"><span class="icon-box sm"><i class="fa-solid fa-receipt"></i></span>
      <span class="grow" style="min-width:0"><strong class="truncate" style="display:block;font-size:.9rem"><?= e($o['product_name']) ?></strong>
        <span class="tiny muted">#<?= e($o['code']) ?> · <?= e(money($o['amount_usd'])) ?> · <?= e(fmt_date($o['created_at'])) ?></span></span><?= $status($o['status']) ?></a>
  <?php endforeach ?></div>

<?php else: ?>
  <div class="row-between mb-1"><span class="muted small"><?= e(t('notif.recent')) ?></span><button class="btn btn-sm btn-ghost" data-action="mark-all-read"><i class="fa-solid fa-check-double"></i><?= e(t('notif.mark_all')) ?></button></div>
  <?= render_notification_list(user_notifications($uid, 30)) ?>
  <p class="center mt-2"><a href="<?= e(url('/notifications')) ?>"><?= e(t('common.view_all')) ?></a></p>
<?php endif ?>
</div>
