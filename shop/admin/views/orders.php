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
  <div class="ocard-list">
    <?php foreach ($orders as $o): $id = (int) $o['id']; ?>
    <article class="ocard">
      <a href="/admin/orders/<?= $id ?>" class="ocard-head">
        <span class="ocard-code"><?= e($o['order_code']) ?></span>
        <?php View::partial('admin/views/partials/status-badge', ['status' => $o['status']]); ?>
      </a>
      <div class="ocard-body">
        <div class="ocard-cust">
          <b><?= e($o['customer_name']) ?></b> <?php View::partial('admin/views/partials/risk-badge', ['risk' => $o['risk_level']]); ?>
          <a href="tel:<?= e($o['phone']) ?>" data-no-spa class="ocard-phone"><i class="fa fa-phone"></i> <?= e($o['phone']) ?></a>
          <span class="ocard-addr"><i class="fa fa-map-marker"></i> <?= e(str_limit($o['address'] . ', ' . $o['district'], 70)) ?></span>
        </div>
        <div class="ocard-amt"><strong><?= money($o['total']) ?></strong><span><?= bn_num($o['items']) ?>টি আইটেম<?= $o['phone_orders'] > 1 ? ' · ' . bn_num($o['phone_orders']) . 'টি অর্ডার' : '' ?></span><span><?= date('d/m/y h:i A', strtotime($o['created_at'])) ?></span></div>
      </div>
      <div class="ocard-actions">
        <?php if ($o['status'] === 'pending'): ?><button type="button" class="btn btn-primary btn-xs" data-post="/admin/api/orders/<?= $id ?>/status" data-body='{"status":"confirmed"}' data-reload><i class="fa fa-check"></i> কনফার্ম</button><?php endif; ?>
        <?php if (!in_array($o['status'], ['courier_sent', 'delivered', 'cancelled', 'returned', 'failed'], true)): ?><a href="/admin/orders/<?= $id ?>?open=courier" class="btn btn-soft btn-xs"><i class="fa fa-paper-plane"></i> কুরিয়ার</a><?php endif; ?>
        <a href="/admin/orders/<?= $id ?>?open=edit" class="btn btn-ghost btn-xs"><i class="fa fa-pencil"></i> এডিট</a>
        <a href="/admin/orders/<?= $id ?>" class="btn btn-ghost btn-xs"><i class="fa fa-eye"></i> দেখুন</a>
        <button type="button" class="btn btn-ghost btn-xs danger-text" data-post="/admin/api/orders/<?= $id ?>/trash" data-confirm="অর্ডারটি ট্র্যাশে পাঠাবেন?" data-reload><i class="fa fa-trash-o"></i> ডিলিট</button>
      </div>
    </article>
    <?php endforeach; ?>
  </div>
  <?php View::partial('admin/views/partials/pagination', ['page' => $page, 'pages' => $pages]); ?>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'shopping-bag', 'title' => 'কোনো অর্ডার পাওয়া যায়নি']); ?>
  <?php endif; ?>
</div>
