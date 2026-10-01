<?php
/** Binance Pay orders + Binance Pay settings (payment method only). */
View::$meta['title'] = 'Binance Pay';
$tab = (string) ($_GET['tab'] ?? 'orders');
?>
<div class="admin-toolbar"><div class="chips">
  <a class="chip <?= $tab === 'orders' ? 'active' : '' ?>" href="<?= e(url('/v2admin/binance')) ?>" data-link>অর্ডার</a>
  <a class="chip <?= $tab === 'settings' ? 'active' : '' ?>" href="<?= e(url('/v2admin/binance?tab=settings')) ?>" data-link>সেটিংস</a>
</div><span class="badge badge-brand">মোড: <?= e(BinancePay::mode()) ?></span></div>
<?php if ($tab === 'settings'): ?>
  <div class="alert alert-info" style="margin-bottom:14px"><?= icon('info') ?><div>Binance Pay শুধুমাত্র পেমেন্ট মেথড — এটি কখনো লগইন পদ্ধতি নয়। API Secret সার্ভারে এনক্রিপ্ট অবস্থায় থাকে এবং ব্রাউজারে পাঠানো হয় না।</div></div>
  <?= admin_settings_form('binance') ?>
<?php return; endif;
$status = (string) ($_GET['status'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 40;
$where = in_array($status, ['pending', 'success', 'failed', 'expired', 'cancelled'], true) ? 'o.status = ?' : '1';
$args = $where === '1' ? [] : [$status];
$total = (int) db()->val("SELECT COUNT(*) FROM binance_pay_orders o WHERE $where", $args);
$rows = db()->all("SELECT o.*, u.name FROM binance_pay_orders o JOIN users u ON u.id = o.user_id WHERE $where ORDER BY (o.status='pending') DESC, o.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
?>
<div class="admin-toolbar"><div class="chips"><?php foreach (['' => 'সব', 'pending' => 'অপেক্ষমাণ', 'success' => 'সফল', 'failed' => 'ব্যর্থ', 'expired' => 'মেয়াদোত্তীর্ণ'] as $k => $v): ?><a class="chip <?= $status === $k ? 'active' : '' ?>" href="<?= e(url('/v2admin/binance' . ($k ? '?status=' . $k : ''))) ?>" data-link><?= $v ?></a><?php endforeach; ?></div></div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>Order ID</th><th>ইউজার</th><th>মোড</th><th>Binance Order ID</th><th>পরিমাণ</th><th>স্ট্যাটাস</th><th>তারিখ</th><th>অ্যাকশন</th></tr></thead>
  <tbody><?php foreach ($rows as $o): ?><tr>
    <td class="num small"><?= e($o['merchant_trade_no']) ?></td>
    <td><a href="<?= e(url('/v2admin/users/' . $o['user_id'])) ?>" data-link><?= e($o['name']) ?></a></td>
    <td><span class="badge badge-muted"><?= e($o['mode']) ?></span></td>
    <td class="num small"><?= e($o['binance_order_id'] ?: '—') ?><?php if ($o['binance_order_id']): ?><button class="copy-btn" data-copy-text="<?= e($o['binance_order_id']) ?>"><?= icon('copy') ?></button><?php endif; ?></td>
    <td class="num"><?= e(number_format((float) $o['amount'], 2)) ?> <?= e($o['currency']) ?></td>
    <td><?= status_badge($o['status']) ?></td><td class="small muted"><?= e(bn_date($o['created_at'])) ?></td>
    <td class="tbl-actions">
      <?php if ($o['status'] === 'pending'): ?>
        <?php if ($o['mode'] === 'api'): ?><button class="btn btn-sm btn-ghost" data-post="<?= e(url('/v2admin/api/finance/binance-refresh')) ?>" data-id="<?= (int) $o['id'] ?>"><?= icon('refresh') ?></button><?php endif; ?>
        <button class="btn btn-sm btn-ok" data-post="<?= e(url('/v2admin/api/finance/binance-approve')) ?>" data-id="<?= (int) $o['id'] ?>" data-confirm="Binance অ্যাপে পেমেন্ট যাচাই করেছেন? অনুমোদন দিলে ইউজারের ব্যালেন্সে যোগ হবে।">অনুমোদন</button>
        <button class="btn btn-sm btn-danger" data-post="<?= e(url('/v2admin/api/finance/binance-reject')) ?>" data-id="<?= (int) $o['id'] ?>" data-confirm="অর্ডারটি প্রত্যাখ্যান করবেন?" data-danger>প্রত্যাখ্যান</button>
      <?php endif; ?>
    </td>
  </tr><?php endforeach; ?></tbody>
</table></div><?php if (!$rows) echo empty_state('binance', 'কোনো Binance Pay অর্ডার নেই'); ?></div>
<?= admin_pagination($total, $page, $per, array_filter(['status' => $status])) ?>
