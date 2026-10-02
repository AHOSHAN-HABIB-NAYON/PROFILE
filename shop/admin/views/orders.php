<div class="page-a" data-page="orders">
  <div class="tabs-scroll">
    <a href="/admin/orders" class="chip<?= !$status ? ' active' : '' ?>">সব (<?= bn_num(array_sum($counts)) ?>)</a>
    <?php foreach (Order::STATUSES as $s): ?>
      <a href="/admin/orders?status=<?= $s ?>" class="chip<?= $status === $s ? ' active' : '' ?>"><?= order_status_label($s) ?> (<?= bn_num($counts[$s] ?? 0) ?>)</a>
    <?php endforeach; ?>
  </div>
  <form method="get" class="toolbar" data-auto-submit>
    <?php if ($status): ?><input type="hidden" name="status" value="<?= e($status) ?>"><?php endif; ?>
    <div class="search-box"><i class="fa fa-search"></i><input type="search" name="q" value="<?= e($q) ?>" placeholder="অর্ডার আইডি, ফোন বা নাম"></div>
    <select name="risk" class="select-sm" aria-label="ঝুঁকি">
      <option value="">সব ঝুঁকি</option>
      <?php foreach (['high', 'review', 'normal', 'new'] as $r): ?><option value="<?= $r ?>"<?= $risk === $r ? ' selected' : '' ?>><?= risk_label($r) ?></option><?php endforeach; ?>
    </select>
    <button class="btn btn-soft btn-sm">খুঁজুন</button>
  </form>
  <?php if ($orders): ?>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>অর্ডার</th><th>কাস্টমার</th><th>জেলা</th><th>মোট</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead>
      <tbody>
      <?php foreach ($orders as $o): ?>
        <tr data-href="/admin/orders/<?= (int) $o['id'] ?>">
          <td data-label="অর্ডার"><a href="/admin/orders/<?= (int) $o['id'] ?>" class="strong"><?= e($o['order_code']) ?></a><br><span class="small muted"><?= bn_num($o['items']) ?>টি আইটেম</span></td>
          <td data-label="কাস্টমার"><?= e($o['customer_name']) ?><br><span class="small muted"><?= e($o['phone']) ?><?= $o['phone_orders'] > 1 ? ' · ' . bn_num($o['phone_orders']) . 'টি অর্ডার' : '' ?></span> <?php View::partial('admin/views/partials/risk-badge', ['risk' => $o['risk_level']]); ?></td>
          <td data-label="জেলা"><?= e($o['district']) ?></td>
          <td data-label="মোট"><b><?= money($o['total']) ?></b></td>
          <td data-label="স্ট্যাটাস"><?php View::partial('admin/views/partials/status-badge', ['status' => $o['status']]); ?></td>
          <td data-label="তারিখ" class="small"><?= date('d/m/y h:i A', strtotime($o['created_at'])) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php View::partial('admin/views/partials/pagination', ['page' => $page, 'pages' => $pages]); ?>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'shopping-bag', 'title' => 'কোনো অর্ডার পাওয়া যায়নি']); ?>
  <?php endif; ?>
</div>
