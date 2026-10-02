<?php /** @var array $c */ $save = $c['original_price'] && $c['original_price'] > $c['price'] ? (float) $c['original_price'] - (float) $c['price'] : 0; ?>
<article class="combo-card">
  <div class="combo-media"><?= picture($c['image'], $c['name'], 400, 400, 'combo-img') ?>
    <span class="combo-ribbon"><i class="fa fa-gift"></i> কম্বো</span>
  </div>
  <div class="combo-body">
    <h3 class="combo-name"><?= e($c['name']) ?></h3>
    <ul class="combo-items">
      <?php foreach ($c['items'] as $it): ?><li><i class="fa fa-check"></i> <?= e($it['name']) ?> <b>× <?= bn_num($it['quantity']) ?></b></li><?php endforeach; ?>
    </ul>
    <div class="price-row"><span class="price"><?= money($c['price']) ?></span>
      <?php if ($save): ?><del class="old-price"><?= money($c['original_price']) ?></del><?php endif; ?></div>
    <?php if ($save): ?><span class="save-pill"><i class="fa fa-tag"></i> <?= money($save) ?> সাশ্রয়</span><?php endif; ?>
    <?php if ((int) $c['stock'] > 0): ?>
      <button type="button" class="btn btn-primary btn-card btn-block" data-add-cart="<?= (int) $c['id'] ?>" data-type="combo" data-buy-now>কম্বো অর্ডার করুন</button>
    <?php else: ?>
      <button class="btn btn-muted btn-card btn-block" disabled>স্টকে নেই</button>
    <?php endif; ?>
  </div>
</article>
