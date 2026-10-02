<?php /** @var array $items */ ?>
<div class="pgrid">
  <?php foreach ($items as $i => $p): ?>
    <?php View::partial('components/product-card', ['p' => $p, 'lazy' => ($lazyFrom ?? 4) <= $i]); ?>
  <?php endforeach; ?>
</div>
