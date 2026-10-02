<div class="page-a" data-page="fraud">
  <section class="card">
    <h3 class="card-title"><i class="fa fa-search"></i> ফোন নম্বর দিয়ে কুরিয়ার হিস্ট্রি চেক</h3>
    <?php if (!$configured): ?><p class="small alert alert-warn">BDCourier API key সেট করা নেই — শুধুমাত্র এই শপের অর্ডার হিস্ট্রি দেখাবে। <a href="/admin/settings#fraud">সেটিংস → ফ্রড চেক</a></p><?php endif; ?>
    <form data-fraud-form class="row-btns">
      <input name="phone" class="input grow" placeholder="01XXXXXXXXX" inputmode="tel" required>
      <label class="small"><input type="checkbox" name="force" value="1"> নতুন করে আনুন</label>
      <button class="btn btn-primary btn-sm">চেক করুন</button>
    </form>
    <div data-fraud-result class="mt-12"></div>
  </section>
  <div class="grid-2 mt-16">
    <section class="card">
      <h3 class="card-title">যাচাই প্রয়োজন / উচ্চ ঝুঁকির অর্ডার</h3>
      <?php if ($risky): ?><div class="list"><?php foreach ($risky as $o): ?>
        <a class="list-row" href="/admin/orders/<?= (int) $o['id'] ?>"><div class="grow"><b><?= e($o['order_code']) ?></b> <?php View::partial('admin/views/partials/risk-badge', ['risk' => $o['risk_level']]); ?><br><span class="small muted"><?= e($o['customer_name']) ?> · <?= e($o['phone']) ?></span></div><div class="right"><?= money($o['total']) ?><br><?php View::partial('admin/views/partials/status-badge', ['status' => $o['status']]); ?></div></a>
      <?php endforeach; ?></div><?php else: ?><p class="small muted">কোনো ঝুঁকিপূর্ণ অর্ডার নেই।</p><?php endif; ?>
    </section>
    <section class="card">
      <h3 class="card-title">সাম্প্রতিক চেক</h3>
      <?php if ($recent): ?><div class="list"><?php foreach ($recent as $f): ?>
        <div class="list-row"><div class="grow"><b><?= e($f['phone']) ?></b> <?= $f['order_code'] ? '<span class="tiny muted">' . e($f['order_code']) . '</span>' : '' ?><br><span class="tiny muted"><?= e($f['reason']) ?></span></div><div class="right"><?php View::partial('admin/views/partials/risk-badge', ['risk' => $f['risk_level']]); ?><br><span class="tiny muted"><?= time_ago($f['created_at']) ?></span></div></div>
      <?php endforeach; ?></div><?php else: ?><p class="small muted">এখনো কোনো চেক হয়নি।</p><?php endif; ?>
    </section>
  </div>
</div>
