<?php
/** Send in-app / push / email notifications to a user, group or everyone. */
View::$meta['title'] = 'নোটিফিকেশন ও পুশ';
$groups = db()->col('SELECT DISTINCT user_group FROM users ORDER BY user_group');
$history = db()->all('SELECT c.*, a.name AS admin_name FROM push_campaigns c LEFT JOIN admin_users a ON a.id = c.admin_id ORDER BY c.id DESC LIMIT 30');
$subs = (int) db()->val('SELECT COUNT(*) FROM push_subscriptions');
$subUsers = (int) db()->val('SELECT COUNT(DISTINCT user_id) FROM push_subscriptions');
?>
<div class="admin-stats" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
  <?= admin_stat('bell', 'পুশ ডিভাইস', (string) $subs, 'brand') ?>
  <?= admin_stat('users', 'পুশ চালু ইউজার', (string) $subUsers, 'ok') ?>
  <?= admin_stat('zap', 'Web Push', WebPush::enabled() ? 'চালু' : 'বন্ধ', WebPush::enabled() ? 'ok' : 'err', '/v2admin/push') ?>
  <?= admin_stat('mail', 'SMTP', Mailer::enabled() ? 'চালু' : 'বন্ধ', Mailer::enabled() ? 'ok' : 'err', '/v2admin/smtp') ?>
</div>
<div class="admin-grid-2">
  <form class="card admin-card" action="<?= e(url('/v2admin/api/notify/send')) ?>" method="post" data-ajax data-confirm="নোটিফিকেশন পাঠাবেন?">
    <?= csrf_field() ?>
    <h3 class="card-title" style="margin-bottom:12px">নতুন নোটিফিকেশন</h3>
    <div class="form-error" hidden></div>
    <div class="field"><label>প্রাপক</label>
      <select class="select" name="target" data-target-select>
        <option value="all">সবাই (Broadcast)</option><option value="group">ইউজার গ্রুপ</option><option value="user">একজন ইউজার</option>
      </select></div>
    <div class="field" data-target-value hidden><label>গ্রুপ / ইউজার (ID, ইউজার ID বা ইমেইল)</label><input class="input" name="target_value" list="group-list" maxlength="190"><datalist id="group-list"><?php foreach ($groups as $g): ?><option value="<?= e($g) ?>"><?php endforeach; ?></datalist></div>
    <div class="field"><label>ক্যাটাগরি</label><select class="select" name="category"><?php foreach (Notify::CATEGORIES as $k => $v): ?><option value="<?= $k ?>" <?= $k === 'admin' ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select></div>
    <div class="field"><label>শিরোনাম</label><input class="input" name="title" required maxlength="190"></div>
    <div class="field"><label>বার্তা</label><textarea class="textarea" name="body" rows="4"></textarea></div>
    <div class="field"><label>লিংক (ঐচ্ছিক)</label><input class="input" name="url" maxlength="255" placeholder="/products/... অথবা /wallet"></div>
    <div class="field"><span class="label">চ্যানেল</span><div class="row wrap"><label class="check"><input type="checkbox" name="channels[]" value="inapp" checked> ইন-অ্যাপ</label><label class="check"><input type="checkbox" name="channels[]" value="push" checked> পুশ</label><label class="check"><input type="checkbox" name="channels[]" value="email"> ইমেইল</label></div></div>
    <button class="btn btn-primary btn-block btn-lg" data-loading="পাঠানো হচ্ছে..."><?= icon('send') ?> পাঠান</button>
  </form>
  <section class="card admin-card table-card">
    <div class="card-head"><h3 class="card-title">ইতিহাস</h3></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>শিরোনাম</th><th>প্রাপক</th><th>চ্যানেল</th><th>পৌঁছেছে</th><th>তারিখ</th></tr></thead><tbody>
    <?php foreach ($history as $h): ?><tr>
      <td><b><?= e($h['title']) ?></b><br><small class="muted"><?= e(mb_strimwidth((string) $h['body'], 0, 60, '…')) ?></small></td>
      <td><?= e($h['target']) ?><?= $h['target_value'] ? ': ' . e($h['target_value']) : '' ?></td><td class="small"><?= e($h['channels']) ?></td>
      <td class="small"><?= (int) $h['recipients'] ?> জন<?= $h['push_sent'] || $h['push_failed'] ? '<br>পুশ ' . (int) $h['push_sent'] . '✓ ' . (int) $h['push_failed'] . '✗' : '' ?></td>
      <td class="small muted"><?= e(bn_date($h['created_at'])) ?></td>
    </tr><?php endforeach; ?></tbody></table></div>
    <?php if (!$history) echo empty_state('bell', 'এখনো কিছু পাঠানো হয়নি'); ?>
  </section>
</div>
