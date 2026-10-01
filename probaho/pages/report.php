<?php
/** Report an issue (with screenshots) + my reports with admin replies. */
View::$meta['title'] = 'রিপোর্ট করুন';
View::$meta['back'] = true;
$cats = ['payment' => 'পেমেন্ট / লেনদেন', 'account' => 'অ্যাকাউন্ট / লগইন', 'service' => 'সার্ভিস', 'binance' => 'Binance Pay', 'bug' => 'অ্যাপ সমস্যা / বাগ', 'fraud' => 'প্রতারণা / সন্দেহজনক', 'other' => 'অন্যান্য'];
$mine = db()->all('SELECT * FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$user['id']]);
$tx = preg_replace('/[^A-Za-z0-9]/', '', (string) ($_GET['tx'] ?? ''));
?>
<form class="card" action="<?= e(url('/api/report/create')) ?>" method="post" enctype="multipart/form-data" data-ajax data-reset novalidate>
  <?= csrf_field() ?>
  <div class="form-error" hidden></div>
  <div class="field"><label for="rp-cat">ক্যাটাগরি</label>
    <select class="select" id="rp-cat" name="category" required><?php foreach ($cats as $k => $v): ?><option value="<?= e($k) ?>" <?= $tx && $k === 'payment' ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select>
  </div>
  <div class="field"><label for="rp-desc">বিস্তারিত বিবরণ</label><textarea class="textarea" id="rp-desc" name="description" required minlength="10" maxlength="3000" placeholder="কী সমস্যা হয়েছে বিস্তারিত লিখুন..."></textarea></div>
  <div class="field"><label for="rp-tx">Transaction ID (ঐচ্ছিক)</label><input class="input" id="rp-tx" name="tx_ref" maxlength="60" value="<?= e($tx) ?>" placeholder="TX..."></div>
  <div class="field">
    <span class="label">স্ক্রিনশট (JPG, JPEG, PNG, WEBP — সর্বোচ্চ ৩টি)</span>
    <label class="upload-box"><?= icon('upload') ?><span>ছবি নির্বাচন করুন</span><small>প্রতিটি সর্বোচ্চ ৫ MB</small>
      <input type="file" name="screenshots[]" accept="image/jpeg,image/png,image/webp" multiple data-preview="#rp-previews" data-max="3" hidden>
    </label>
    <div class="upload-previews" id="rp-previews"></div>
  </div>
  <button type="submit" class="btn btn-primary btn-block btn-lg" data-loading="পাঠানো হচ্ছে..."><?= icon('send') ?> রিপোর্ট পাঠান</button>
</form>

<section class="dash-section">
  <div class="card-head"><h2 class="card-title">আমার রিপোর্ট</h2></div>
  <?php if ($mine): ?>
    <div class="list">
      <?php foreach ($mine as $r): ?>
        <details class="list-item" style="display:block">
          <summary class="row" style="cursor:pointer;list-style:none">
            <span class="tx-ic"><?= icon('flag') ?></span>
            <span class="li-main"><span class="li-title">#<?= e($r['uid']) ?> · <?= e($cats[$r['category']] ?? $r['category']) ?></span><span class="li-sub"><?= e(time_ago($r['created_at'])) ?></span></span>
            <?= status_badge($r['status']) ?>
          </summary>
          <div style="padding:10px 0 2px 54px" class="small">
            <p style="white-space:pre-line"><?= e($r['description']) ?></p>
            <?php if ($r['admin_reply']): ?><div class="alert alert-info"><?= icon('message') ?><div><b>সাপোর্টের উত্তর:</b><br><span style="white-space:pre-line"><?= e($r['admin_reply']) ?></span></div></div><?php endif; ?>
          </div>
        </details>
      <?php endforeach; ?>
    </div>
  <?php else: ?>
    <div class="card small muted">আপনি এখনো কোনো রিপোর্ট করেননি।</div>
  <?php endif; ?>
</section>
