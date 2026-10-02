<?php /** @var array $s */ ?>
<ul class="mini-lines">
  <?php foreach ($s['lines'] as $l): ?>
  <li>
    <img src="<?= e($l['image_url']) ?>" alt="" width="44" height="44" loading="lazy">
    <div class="grow"><span class="mini-name"><?= e($l['name']) ?></span>
      <span class="small muted"><?= $l['size'] ? 'সাইজ: ' . e($l['size']) . ' · ' : '' ?><?= bn_num($l['qty']) ?> × <?= money($l['unit_price']) ?></span>
      <?php if (isset($l['error'])): ?><span class="field-error"><?= e($l['error']) ?></span><?php endif; ?>
    </div>
    <strong><?= money($l['line_total']) ?></strong>
  </li>
  <?php endforeach; ?>
</ul>
<dl class="totals">
  <div><dt>সাবটোটাল</dt><dd><?= money($s['subtotal']) ?></dd></div>
  <div><dt>ডেলিভারি চার্জ <small class="muted">(<?= e($s['delivery']['label']) ?>)</small></dt>
    <dd><?= $s['delivery_charge'] > 0 ? money($s['delivery_charge']) : '<span class="ok">ফ্রি ডেলিভারি</span>' ?></dd></div>
  <?php if ($s['discount'] > 0): ?><div class="ok"><dt>ডিসকাউন্ট<?= $s['coupon_code'] ? ' (' . e($s['coupon_code']) . ')' : '' ?></dt><dd>-<?= money($s['discount']) ?></dd></div><?php endif; ?>
  <?php if ($s['coupon_error']): ?><div><dt colspan="2" class="field-error"><?= e($s['coupon_error']) ?></dt></div><?php endif; ?>
  <div class="grand"><dt>সর্বমোট</dt><dd><?= money($s['total']) ?></dd></div>
</dl>
