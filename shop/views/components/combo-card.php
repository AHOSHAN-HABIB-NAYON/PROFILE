<?php /** @var array $c */ ?>
<article class="combo-card">
  <div class="combo-media"><?= picture($c['image'], $c['name'], 400, 300, 'combo-img') ?>
    <?php if ($c['discount_pct']): ?><span class="tag tag-sale">-<?= bn_num($c['discount_pct']) ?>%</span><?php endif; ?>
  </div>
  <div class="combo-body">
    <h3 class="combo-name"><?= e($c['name']) ?></h3>
    <ul class="combo-items">
      <?php foreach ($c['items'] as $it): ?><li><i class="fa fa-check"></i> <?= e($it['name']) ?> × <?= bn_num($it['quantity']) ?></li><?php endforeach; ?>
    </ul>
    <div class="price-row"><span class="price"><?= money($c['price']) ?></span>
      <?php if ($c['original_price'] && $c['original_price'] > $c['price']): ?><del class="old-price"><?= money($c['original_price']) ?></del><?php endif; ?>
    </div>
    <?php if ((int) $c['stock'] > 0): ?>
      <button type="button" class="btn btn-primary btn-xs btn-block" data-add-cart="<?= (int) $c['id'] ?>" data-type="combo" data-buy-now>কম্বো অর্ডার করুন</button>
    <?php else: ?>
      <button class="btn btn-muted btn-xs btn-block" disabled>স্টকে নেই</button>
    <?php endif; ?>
  </div>
</article>
