<div class="page-a" data-page="blocked-ips">
  <section class="card">
    <h3 class="card-title"><i class="fa fa-ban"></i> IP ব্লক করুন</h3>
    <form data-api="/admin/api/blocked-ips/add" data-reload class="grid-form">
      <input name="ip" class="input" placeholder="IP ঠিকানা" required>
      <input name="reason" class="input" placeholder="কারণ" maxlength="255">
      <select name="block_type" class="input"><option value="temporary">সাময়িক</option><option value="lifetime">স্থায়ী (লাইফটাইম)</option></select>
      <input name="hours" class="input" inputmode="numeric" value="<?= (int) setting('order_block_hours', 72) ?>" aria-label="ঘণ্টা" title="সাময়িক ব্লকের সময় (ঘণ্টা)">
      <button class="btn btn-primary btn-sm">ব্লক</button>
    </form>
    <p class="tiny muted mt-8">ডাবল অর্ডার সুরক্ষা: <?= Settings::on('order_limit_enabled') ? 'চালু — ' . bn_num(setting('order_limit_hours')) . ' ঘণ্টায় ' . bn_num(setting('order_limit_count')) . 'টি অর্ডার/IP, ' . bn_num(setting('order_attempt_limit')) . ' বার চেষ্টার পর ' . (setting('order_block_type') === 'lifetime' ? 'স্থায়ী' : 'সাময়িক') . ' ব্লক' : 'বন্ধ' ?> · <a href="/admin/settings#protection">পরিবর্তন করুন</a></p>
  </section>
  <?php if ($items): ?>
  <div class="table-wrap mt-16"><table class="table">
    <thead><tr><th>IP</th><th>কারণ</th><th>চেষ্টা</th><th>ধরন</th><th>ব্লকের তারিখ</th><th>অবস্থা</th><th></th></tr></thead>
    <tbody><?php foreach ($items as $b): ?>
      <tr>
        <td data-label="IP"><b class="mono"><?= e($b['ip']) ?></b><br><span class="tiny muted"><?= bn_num($b['orders']) ?>টি অর্ডার</span></td>
        <td data-label="কারণ" class="small"><?= e($b['reason']) ?></td>
        <td data-label="চেষ্টা"><?= bn_num($b['attempts']) ?></td>
        <td data-label="ধরন"><?= $b['block_type'] === 'lifetime' ? '<span class="pill pill-red">স্থায়ী</span>' : '<span class="pill pill-amber">সাময়িক</span><br><span class="tiny muted">' . date('d/m/y h:i A', strtotime((string) $b['blocked_until'])) . ' পর্যন্ত</span>' ?></td>
        <td data-label="তারিখ" class="small"><?= date('d/m/y h:i A', strtotime($b['created_at'])) ?></td>
        <td data-label="অবস্থা"><?= $b['active'] ? '<span class="pill pill-red">সক্রিয়</span>' : '<span class="pill">মেয়াদোত্তীর্ণ</span>' ?></td>
        <td class="actions"><button type="button" class="btn btn-soft btn-xs" data-post="/admin/api/blocked-ips/<?= (int) $b['id'] ?>/unblock" data-confirm="<?= e($b['ip']) ?> আনব্লক করবেন?" data-reload>আনব্লক</button></td>
      </tr>
    <?php endforeach; ?></tbody></table></div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'check-circle', 'title' => 'কোনো ব্লকড IP নেই']); ?>
  <?php endif; ?>
</div>
