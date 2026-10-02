<?php
/** Orders hub (/payment) and checkout / payment submission (/payment/{code}). */
defined('APP') || exit;

$u = require_login();
$code = strtoupper((string)($params['code'] ?? ''));
$status = fn(string $s) => '<span class="status status-' . e($s) . '">' . e(t('status.' . $s)) . '</span>';

if ($code === '') {
    meta(['title' => t('nav.orders'), 'robots' => 'noindex', 'cache' => false]);
    $orders = rows('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50', [$u['id']]); ?>
<div class="page" data-page="orders">
  <header class="page-head"><h1><?= e(t('nav.orders')) ?></h1><p><?= e(t('pay.orders_sub')) ?></p></header>
  <?php if (!$orders): ?>
    <div class="card empty"><div class="icon-box"><i class="fa-solid fa-bag-shopping"></i></div><p><?= e(t('profile.no_orders')) ?></p><a class="btn" href="<?= e(url('/services')) ?>"><?= e(t('home.explore')) ?></a></div>
  <?php else: ?>
    <div class="list"><?php foreach ($orders as $o): ?>
      <a class="list-row" href="<?= e(url('/payment/' . $o['code'])) ?>"><span class="icon-box sm"><i class="fa-solid fa-receipt"></i></span>
        <span class="grow" style="min-width:0"><strong class="truncate" style="display:block;font-size:.92rem"><?= e($o['product_name']) ?></strong>
          <span class="tiny muted">#<?= e($o['code']) ?> · <?= e(money($o['amount_usd'])) ?> · <?= e(time_ago($o['created_at'])) ?></span></span><?= $status($o['status']) ?><i class="fa-solid fa-chevron-right chev"></i></a>
    <?php endforeach ?></div>
  <?php endif ?>
</div>
<?php
    return;
}

$o = row('SELECT o.*, p.slug AS product_slug, p.image AS product_image, p.icon AS product_icon, s.slug AS service_slug, s.icon AS service_icon
          FROM orders o LEFT JOIN products p ON p.id = o.product_id LEFT JOIN services s ON s.id = p.service_id WHERE o.code = ?', [$code]);
if (!$o || ((int)$o['user_id'] !== (int)$u['id'] && !can('orders'))) abort(404);
meta(['title' => t('pay.title') . ' #' . $o['code'], 'robots' => 'noindex', 'cache' => false, 'nav' => 'payment']);

$payments = rows('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC', [$o['id']]);
$last = $payments[0] ?? null;
$canPay = in_array($o['status'], ['pending_payment', 'rejected'], true) && (!$last || in_array($last['status'], ['rejected', 'cancelled'], true));
$methods = rows('SELECT * FROM payment_methods WHERE enabled = 1 AND code <> "balance" ORDER BY sort, id');
$balanceOk = setting_bool('payment.allow_balance') && (float)$u['balance'] >= (float)$o['amount_usd'];
$methodNames = array_column(rows('SELECT code, name FROM payment_methods'), 'name', 'code') + ['balance' => t('pay.balance')];
$defaultIcons = ['bkash' => ['fa-solid fa-mobile-screen-button', '#e2136e'], 'usdt_trc20' => ['fa-solid fa-coins', '#26a17b'], 'usdt_bep20' => ['fa-solid fa-coins', '#f0b90b'], 'binance_pay' => ['fa-solid fa-b', '#f0b90b']];
$steps = ['pending_payment', 'payment_submitted', 'under_review', 'approved', 'completed'];
$curStep = array_search($o['status'] === 'rejected' ? 'pending_payment' : $o['status'], $steps, true);
?>
<style data-css="payment">
.order-card{display:flex;gap:14px;align-items:center}
.order-id{display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,monospace;font-weight:700;background:var(--soft);padding:4px 6px 4px 10px;border-radius:10px;font-size:.88rem}
.amount-big{font-size:1.7rem;font-weight:800;color:var(--primary);letter-spacing:-.02em}
.timeline{display:flex;gap:4px;margin:14px 0 4px}
.timeline span{flex:1;height:5px;border-radius:5px;background:var(--soft)}
.timeline span.on{background:var(--success)}
.timeline span.now{background:linear-gradient(90deg,var(--success),var(--warning));animation:pulse 1.6s infinite}
.methods{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:14px}
.method{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;border-radius:16px;border:1.5px solid var(--border);background:var(--card);cursor:pointer;text-align:left;transition:border-color .15s,transform .12s,box-shadow .15s}
.method:active{transform:scale(.98)}
.method.active{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-soft)}
.method .logo{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff;font-size:1.1rem;overflow:hidden}
.method .logo img{width:100%;height:100%;object-fit:contain;background:#fff}
.method strong{font-size:.88rem}.method small{color:var(--muted);font-size:.74rem}
.pay-panel{border-radius:16px;background:var(--soft);padding:14px;margin-bottom:14px}
.copy-row{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:6px 6px 6px 12px;margin:6px 0}
.copy-row code{flex:1;word-break:break-all;font-size:.84rem}
.qr{width:180px;height:180px;object-fit:contain;background:#fff;border-radius:14px;padding:8px;margin:10px auto}
.success-anim{width:76px;height:76px;margin:6px auto 12px;border-radius:50%;background:color-mix(in srgb,var(--success) 15%,transparent);display:grid;place-items:center;color:var(--success);font-size:2rem;animation:popIn .5s var(--ease)}
</style>
<div class="page" data-page="payment" data-init="payment">
  <nav class="crumbs"><a href="<?= e(url('/payment')) ?>"><?= e(t('nav.orders')) ?></a><i class="fa-solid fa-chevron-right tiny"></i><span>#<?= e($o['code']) ?></span></nav>

  <section class="card card-pad-lg mb-2">
    <div class="order-card">
      <span class="icon-box lg"><i class="<?= e(fa($o['product_icon'] ?: $o['service_icon'], 'fa-solid fa-box')) ?>"></i></span>
      <div class="grow" style="min-width:0">
        <h1 style="font-size:1.1rem;margin:0" class="truncate"><?= e($o['product_name']) ?></h1>
        <div class="row wrap mt-1"><span class="order-id">#<?= e($o['code']) ?><button class="icon-btn" style="width:28px;height:28px" data-action="copy" data-copy="<?= e($o['code']) ?>" aria-label="<?= e(t('common.copy')) ?>"><i class="fa-regular fa-copy small"></i></button></span><?= $status($o['status']) ?></div>
      </div>
    </div>
    <div class="row-between mt-2">
      <div><div class="tiny muted"><?= e(t('pay.total')) ?></div><div class="amount-big"><?= e(money($o['amount_usd'])) ?></div><div class="small muted">≈ <?= e(money($o['amount_bdt'], 'BDT')) ?></div></div>
      <div class="tiny muted" style="text-align:right"><?= e(t('pay.created')) ?><br><?= e(fmt_date($o['created_at'], true)) ?></div>
    </div>
    <?php if (!in_array($o['status'], ['cancelled'], true)): ?>
    <div class="timeline" aria-hidden="true"><?php foreach ($steps as $i => $s): ?><span class="<?= $curStep !== false && $i < $curStep ? 'on' : ($i === $curStep ? 'now' : '') ?>"></span><?php endforeach ?></div>
    <div class="row-between tiny muted"><span><?= e(t('status.pending_payment')) ?></span><span><?= e(t('status.completed')) ?></span></div>
    <?php endif ?>
    <?php if ($o['admin_note']): ?><div class="alert mt-2"><i class="fa-solid fa-comment-dots"></i><span><b><?= e(t('pay.admin_note')) ?>:</b> <?= e($o['admin_note']) ?></span></div><?php endif ?>
  </section>

  <?php if (in_array($o['status'], ['approved', 'completed'], true)): ?>
    <section class="card card-pad-lg center mb-2">
      <div class="success-anim"><i class="fa-solid fa-check"></i></div>
      <h2><?= e(t('pay.approved_title')) ?></h2><p class="muted"><?= e(t('pay.approved_text')) ?></p>
      <a class="btn" href="<?= e(url('/contact?subject=' . rawurlencode('#' . $o['code']))) ?>"><i class="fa-solid fa-headset"></i><?= e(t('pay.contact_support')) ?></a>
    </section>
  <?php elseif ($o['status'] === 'cancelled'): ?>
    <div class="alert danger mb-2"><i class="fa-solid fa-ban"></i><span><?= e(t('pay.cancelled_text')) ?></span></div>
  <?php elseif (!$canPay && $last): ?>
    <div class="alert warning mb-2"><i class="fa-solid fa-hourglass-half"></i><span><?= e(t('pay.under_review_text')) ?></span></div>
  <?php endif ?>

  <?php if ($canPay && (int)$o['user_id'] === (int)$u['id']): ?>
    <?php if ($last && $last['status'] === 'rejected'): ?><div class="alert danger mb-2"><i class="fa-solid fa-circle-xmark"></i><span><?= e(t('pay.rejected_retry')) ?><?= $last['admin_note'] ? ' — ' . e($last['admin_note']) : '' ?></span></div><?php endif ?>
    <section class="mb-2" aria-labelledby="h-method">
      <h2 id="h-method" style="font-size:1rem"><?= e(t('pay.choose_method')) ?></h2>
      <?php if (!$methods && !$balanceOk): ?>
        <div class="card empty"><div class="icon-box"><i class="fa-solid fa-wallet"></i></div><?= e(t('pay.no_methods')) ?></div>
      <?php endif ?>
      <div class="methods" role="radiogroup">
        <?php foreach ($methods as $m): $cur = $m['currency'] === 'BDT' ? 'BDT' : 'USD'; $amt = $cur === 'BDT' ? $o['amount_bdt'] : $o['amount_usd'];
            [$ic, $bg] = $defaultIcons[$m['code']] ?? ['fa-solid fa-wallet', 'var(--primary)']; ?>
          <button type="button" class="method" role="radio" data-method-card="<?= e($m['code']) ?>" data-amount="<?= e($amt) ?>" data-amount-label="<?= e(money($amt, $cur)) ?>">
            <span class="logo" style="background:<?= e($bg) ?>"><?php if ($m['logo']): ?><img src="<?= e(media_url($m['logo'])) ?>" alt="" loading="lazy"><?php else: ?><i class="<?= e($ic) ?>"></i><?php endif ?></span>
            <strong><?= e($m['name']) ?></strong><small><?= e(money($amt, $cur)) ?></small>
          </button>
        <?php endforeach ?>
        <?php if ($balanceOk): ?>
          <button type="button" class="method" role="radio" data-method-card="balance" data-amount="<?= e($o['amount_usd']) ?>" data-amount-label="<?= e(money($o['amount_usd'])) ?>">
            <span class="logo" style="background:var(--secondary)"><i class="fa-solid fa-wallet"></i></span><strong><?= e(t('pay.balance')) ?></strong><small><?= e(t('pay.available', ['amount' => money($u['balance'])])) ?></small>
          </button>
        <?php endif ?>
      </div>

      <?php foreach ($methods as $m): $d = json_decode((string)$m['details'], true) ?: []; ?>
        <div class="pay-panel" data-method-panel="<?= e($m['code']) ?>" hidden>
          <p class="mb-1"><b><?= e(t('pay.send_exact')) ?> <span data-pay-amount></span></b></p>
          <?php foreach (['address' => t('pay.address'), 'number' => t('pay.number'), 'pay_id' => t('pay.pay_id'), 'pay_name' => t('pay.pay_name'), 'account_type' => t('pay.account_type'), 'network' => t('pay.network')] as $k => $label):
              if (empty($d[$k])) continue; ?>
            <div class="tiny muted"><?= e($label) ?></div>
            <div class="copy-row"><code><?= e($d[$k]) ?></code><button class="btn btn-sm btn-soft" data-action="copy" data-copy="<?= e($d[$k]) ?>"><i class="fa-regular fa-copy"></i><?= e(t('common.copy')) ?></button></div>
          <?php endforeach ?>
          <?php if (!empty($d['qr'])): ?><img class="qr" src="<?= e(media_url($d['qr'])) ?>" alt="QR" loading="lazy" width="180" height="180"><?php endif ?>
          <?php if (!empty($d['link']) && preg_match('~^https://~', $d['link'])): ?><a class="btn btn-block btn-soft mt-1" href="<?= e($d['link']) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i><?= e(t('pay.open_link')) ?></a><?php endif ?>
          <?php if ($ins = loc($m, 'instructions')): ?><div class="alert mt-1"><i class="fa-solid fa-circle-info"></i><span style="white-space:pre-line"><?= e($ins) ?></span></div><?php endif ?>
        </div>
      <?php endforeach ?>
      <?php if ($balanceOk): ?><div class="pay-panel" data-method-panel="balance" hidden><p class="mb-0"><?= e(t('pay.balance_text', ['amount' => money($o['amount_usd'])])) ?></p></div><?php endif ?>

      <?php if ($methods || $balanceOk): ?>
      <form class="card card-pad-lg" method="post" action="<?= e(url('/api/payment?action=submit')) ?>" data-ajax data-pay-form enctype="multipart/form-data" novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="order" value="<?= e($o['code']) ?>">
        <input type="hidden" name="method" value="">
        <p class="small muted"><?= e(setting_l('payment.instructions')) ?></p>
        <div data-hide-for-balance>
          <div class="form-group"><label class="label" for="pay-tx"><?= e(t('pay.txid')) ?></label><input class="input" id="pay-tx" name="txid" maxlength="191" required data-req="1" autocomplete="off" spellcheck="false" placeholder="<?= e(t('pay.txid_ph')) ?>"></div>
          <div class="form-group"><label class="label" for="pay-amt"><?= e(t('pay.amount_sent')) ?></label><input class="input" id="pay-amt" name="amount" type="number" step="0.01" min="0.01" required data-req="1" inputmode="decimal"></div>
          <div class="form-group">
            <label class="file-drop"><input type="file" name="screenshot" accept="image/jpeg,image/png,image/webp" data-preview required data-req="1"><i class="fa-regular fa-image" style="font-size:1.4rem"></i><span data-file-label><?= e(t('pay.upload_screenshot')) ?></span><span class="tiny">JPG, PNG, WebP · ≤ <?= num((int)setting('media.max_upload_mb', 10)) ?> MB</span></label>
            <div class="upload-progress"><i></i></div>
          </div>
        </div>
        <div class="form-group"><label class="label" for="pay-note"><?= e(t('pay.note')) ?></label><textarea class="textarea" id="pay-note" name="note" maxlength="1000" rows="2" style="min-height:70px"></textarea></div>
        <button class="btn btn-lg btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i><?= e(t('pay.submit')) ?></button>
      </form>
      <?php endif ?>
    </section>
    <?php if ($o['status'] === 'pending_payment'): ?>
      <p class="center"><button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/payment?action=cancel')) ?>" data-params='<?= e(json_encode(['order' => $o['code']])) ?>' data-confirm="<?= e(t('pay.cancel_confirm')) ?>" data-danger="1"><i class="fa-solid fa-ban"></i><?= e(t('pay.cancel_order')) ?></button></p>
    <?php endif ?>
  <?php endif ?>

  <?php if ($payments): ?>
  <section aria-labelledby="h-hist">
    <h2 id="h-hist" style="font-size:1rem"><?= e(t('pay.history')) ?></h2>
    <div class="list"><?php foreach ($payments as $p): ?>
      <div class="list-row"><span class="icon-box sm"><i class="fa-solid fa-money-bill-transfer"></i></span>
        <span class="grow" style="min-width:0"><strong style="font-size:.88rem"><?= e($methodNames[$p['method']] ?? $p['method']) ?> · <?= e(money($p['amount'], $p['currency'])) ?></strong><br>
          <span class="tiny muted truncate" style="display:block">TXID <?= e($p['txid']) ?> · <?= e(time_ago($p['created_at'])) ?></span>
          <?php if ($p['admin_note']): ?><span class="tiny"><?= e($p['admin_note']) ?></span><?php endif ?></span>
        <?= $status($p['status']) ?></div>
    <?php endforeach ?></div>
  </section>
  <?php endif ?>
</div>
