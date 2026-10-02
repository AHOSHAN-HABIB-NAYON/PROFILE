<?php /** @var array $items  Optional: $flash, $lazyFrom */ ?>
<div class="pgrid<?= count($items) === 1 ? ' is-single' : '' ?>">
  <?php foreach ($items as $i => $p): ?>
    <?php View::partial('components/product-card', ['p' => $p, 'lazy' => ($lazyFrom ?? 4) <= $i, 'flash' => $flash ?? false]); ?>
  <?php endforeach; ?>
</div>
