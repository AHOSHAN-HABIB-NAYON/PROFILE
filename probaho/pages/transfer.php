<?php
/** Instant P2P transfer (also the landing target for scanned QR codes). */
View::$meta['title'] = 'ট্রান্সফার';
View::$meta['back'] = true;
$w = Wallet::forUser((int) $user['id']);
$to = preg_replace('/[^A-Za-z0-9@.+_-]/', '', (string) ($_GET['to'] ?? ''));
?>
<div class="page-head"><h1>টাকা পাঠান</h1><p>ব্যবহারযোগ্য ব্যালেন্স: <b class="num"><?= e(money($w['balance'])) ?></b></p></div>
<?php if (!setting_on('transfer_enabled')): ?>
  <div class="card"><?= empty_state('send', 'ট্রান্সফার সাময়িকভাবে বন্ধ আছে') ?></div>
<?php else: ?>
<form class="card" action="<?= e(url('/api/wallet/transfer')) ?>" method="post" data-ajax novalidate>
  <?= csrf_field() ?>
  <?php if ($to !== ''): ?><input type="hidden" name="via" value="qr"><?php endif; ?>
  <div class="form-error" hidden></div>
  <div class="field">
    <label for="t-to">প্রাপক (ইমেইল / মোবাইল / ইউজার আইডি)</label>
    <div class="input-group">
      <input class="input" id="t-to" name="recipient" required maxlength="190" value="<?= e($to) ?>" placeholder="যেমন: 12345678">
      <a href="<?= e(url('/qr')) ?>" class="icon-btn input-addon" data-link aria-label="QR স্ক্যান"><?= icon('scan') ?></a>
    </div>
    <div data-recipient style="margin-top:8px"></div>
  </div>
  <div class="field">
    <label for="t-amount">পরিমাণ (<?= e(currency()) ?>)</label>
    <div class="input-prefix"><span><?= e(setting('currency_symbol', '$')) ?></span><input class="input amount-input" id="t-amount" name="amount" inputmode="decimal" required placeholder="0.00" data-fee-percent="<?= e(setting('transfer_fee_percent', '0')) ?>" data-fee-fixed="<?= e(setting('transfer_fee_fixed', '0')) ?>"></div>
    <div class="amount-chips"><?php foreach ([5, 10, 20, 50] as $a): ?><button type="button" class="chip" data-amount="<?= $a ?>"><?= e(money($a)) ?></button><?php endforeach; ?></div>
  </div>
  <div class="field"><label for="t-note">নোট (ঐচ্ছিক)</label><input class="input" id="t-note" name="note" maxlength="120" placeholder="যেমন: দুপুরের খাবার"></div>
  <div class="summary kv" style="margin-bottom:14px">
    <div><span class="k">ফি</span><span class="v num"><?= e(setting('currency_symbol', '$')) ?><span data-fee-out>0.00</span></span></div>
    <div><span class="k">মোট কাটা হবে</span><span class="v num"><?= e(setting('currency_symbol', '$')) ?><span data-total-out>0.00</span></span></div>
  </div>
  <?php if ((int) $user['totp_enabled'] === 1): ?>
    <div class="field"><label for="t-otp">2FA কোড</label><input class="input otp-input" id="t-otp" name="otp" inputmode="numeric" maxlength="6" required placeholder="000000"></div>
  <?php endif; ?>
  <button type="submit" class="btn btn-primary btn-block btn-lg" data-loading="পাঠানো হচ্ছে..."><?= icon('send') ?> এখনই পাঠান</button>
</form>
<?php endif; ?>
