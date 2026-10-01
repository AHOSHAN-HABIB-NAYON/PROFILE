<?php
/** QR: scan to pay (camera / gallery) and "my QR" to receive. */
View::$meta['title'] = 'QR পেমেন্ট';
$payload = abs_url('/qr/pay/' . $user['uid']);
?>
<div class="qr-tabs" role="tablist">
  <button type="button" data-qr-tab="scan" class="active"><?= icon('scan') ?> স্ক্যান করুন</button>
  <button type="button" data-qr-tab="mine"><?= icon('qr') ?> আমার QR</button>
</div>
<div data-qr-pane="scan">
  <div class="scanner">
    <video playsinline muted></video>
    <div class="scanner-frame"></div><div class="scanner-line"></div>
    <div class="scanner-msg"><button type="button" class="btn btn-primary" data-scan-start><?= icon('camera') ?> ক্যামেরা চালু করুন</button></div>
  </div>
  <p class="center muted small" style="margin:12px 0">প্রাপকের QR কোড ফ্রেমের ভেতরে ধরুন</p>
  <label class="btn btn-ghost btn-block"><?= icon('image') ?> গ্যালারি থেকে QR ছবি দিন<input type="file" accept="image/*" data-scan-file hidden></label>
  <a href="<?= e(url('/wallet/transfer')) ?>" class="btn btn-soft btn-block" style="margin-top:10px" data-link><?= icon('send') ?> ম্যানুয়ালি টাকা পাঠান</a>
</div>
<div data-qr-pane="mine" hidden>
  <div class="card center">
    <div class="my-qr" data-my-qr="<?= e($payload) ?>"><div class="skeleton" style="aspect-ratio:1"></div></div>
    <h2 style="font-size:18px;margin:14px 0 2px"><?= e($user['name']) ?></h2>
    <p class="muted mb-0">ইউজার আইডি: <b class="num"><?= e($user['uid']) ?></b><button class="copy-btn" data-copy-text="<?= e($user['uid']) ?>" aria-label="কপি"><?= icon('copy') ?></button></p>
    <p class="small muted" style="margin-top:10px">এই QR স্ক্যান করে যেকেউ আপনাকে টাকা পাঠাতে পারবে।</p>
  </div>
</div>
