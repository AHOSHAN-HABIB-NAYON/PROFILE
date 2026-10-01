<?php
/** Withdrawal request (held until admin approval). */
View::$meta['title'] = 'টাকা উত্তোলন';
View::$meta['back'] = true;
$w = Wallet::forUser((int) $user['id']);
$methods = db()->all("SELECT * FROM payment_methods WHERE is_active = 1 AND direction IN ('withdraw','both') AND code <> 'qr' ORDER BY sort_order, id");
$saved = db()->all('SELECT * FROM user_payment_methods WHERE user_id = ? ORDER BY id DESC', [$user['id']]);
?>
<div class="page-head"><h1>টাকা উত্তোলন</h1><p>ব্যবহারযোগ্য ব্যালেন্স: <b class="num"><?= e(money($w['balance'])) ?></b></p></div>
<?php if (!setting_on('withdraw_enabled') || !$methods): ?>
  <div class="card"><?= empty_state('arrow-up', 'উত্তোলন সাময়িকভাবে বন্ধ আছে', 'অনুগ্রহ করে পরে চেষ্টা করুন।') ?></div>
<?php else: ?>
<form class="card" action="<?= e(url('/api/wallet/withdraw')) ?>" method="post" data-ajax novalidate>
  <?= csrf_field() ?>
  <div class="form-error" hidden></div>
  <span class="label">উত্তোলন মেথড</span>
  <div class="method-grid" style="margin-bottom:14px">
    <?php foreach ($methods as $i => $m): ?>
      <label class="method">
        <input type="radio" name="method" value="<?= e($m['code']) ?>" <?= $i === 0 ? 'checked' : '' ?> data-fee-percent="<?= e($m['fee_percent']) ?>" data-fee-fixed="<?= e($m['fee_fixed']) ?>" data-account-label="<?= e($m['account_label'] ?: 'অ্যাকাউন্ট') ?>" data-instructions="<?= e($m['instructions']) ?>">
        <span class="pm-ic" style="<?= method_style($m) ?>"><?= media_icon($m['icon']) ?></span>
        <span class="grow"><b><?= e($m['name']) ?></b><small>ফি <?= e((float) $m['fee_percent']) ?>%<?= (float) $m['fee_fixed'] > 0 ? ' + ' . e(money($m['fee_fixed'])) : '' ?> · সীমা <?= e(money($m['min_amount'])) ?>–<?= e(money($m['max_amount'])) ?></small></span>
      </label>
    <?php endforeach; ?>
  </div>
  <div class="alert alert-info" style="margin-bottom:14px" hidden><?= icon('info') ?><div data-instructions></div></div>
  <div class="field">
    <label for="w-amount">পরিমাণ (<?= e(currency()) ?>)</label>
    <div class="input-prefix"><span><?= e(setting('currency_symbol', '$')) ?></span><input class="input amount-input" id="w-amount" name="amount" inputmode="decimal" required placeholder="0.00"></div>
  </div>
  <div class="field">
    <label for="w-account" data-account-label>অ্যাকাউন্ট</label>
    <input class="input" id="w-account" name="account" required maxlength="190" placeholder="অ্যাকাউন্টের তথ্য" list="saved-accounts">
    <?php if ($saved): ?><datalist id="saved-accounts"><?php foreach ($saved as $s): ?><option value="<?= e($s['account_ref']) ?>"><?= e($s['label']) ?></option><?php endforeach; ?></datalist><?php endif; ?>
  </div>
  <label class="check" style="margin-bottom:14px"><input type="checkbox" name="save" value="1"> এই অ্যাকাউন্ট সংরক্ষণ করুন</label>
  <div class="summary kv" style="margin-bottom:14px">
    <div><span class="k">ফি</span><span class="v num"><?= e(setting('currency_symbol', '$')) ?><span data-fee-out>0.00</span></span></div>
    <div><span class="k">মোট কাটা হবে</span><span class="v num"><?= e(setting('currency_symbol', '$')) ?><span data-total-out>0.00</span></span></div>
  </div>
  <button type="submit" class="btn btn-primary btn-block btn-lg" data-loading="প্রক্রিয়াকরণ...">উত্তোলনের অনুরোধ করুন</button>
</form>
<?php endif; ?>
