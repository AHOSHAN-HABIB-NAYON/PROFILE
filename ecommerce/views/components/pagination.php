<?php
/**
 * SEO-friendly pagination (real ?page=N links; the router makes them instant).
 * @var int $page @var int $pages @var string $base @var array $query
 */
if ($pages <= 1) {
    return;
}
$link = static fn(int $n) => url($base, $n > 1 ? $query + ['page' => $n] : $query);
$window = array_unique(array_filter([1, $page - 1, $page, $page + 1, $pages], static fn($n) => $n >= 1 && $n <= $pages));
sort($window);
?>
<nav class="pager" aria-label="পৃষ্ঠা">
  <?php if ($page > 1): ?><a class="pager-btn" href="<?= e($link($page - 1)) ?>" rel="prev" aria-label="আগের পৃষ্ঠা"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></a><?php endif; ?>
  <?php $prev = 0; foreach ($window as $n): ?>
    <?php if ($n - $prev > 1): ?><span class="pager-gap">…</span><?php endif; $prev = $n; ?>
    <?php if ($n === $page): ?><span class="pager-btn is-active" aria-current="page"><?= num($n) ?></span>
    <?php else: ?><a class="pager-btn" href="<?= e($link($n)) ?>"><?= num($n) ?></a><?php endif; ?>
  <?php endforeach; ?>
  <?php if ($page < $pages): ?><a class="pager-btn" href="<?= e($link($page + 1)) ?>" rel="next" aria-label="পরের পৃষ্ঠা"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a><?php endif; ?>
</nav>
