<?php
/**
 * Admin pagination. @var int $page @var int $pages @var string $base @var array $query
 */
if ($pages <= 1) {
    return;
}
$link = static fn(int $n) => url($base, array_merge($query, ['page' => $n > 1 ? $n : null]));
?>
<nav class="a-pager" aria-label="Pagination">
  <?php if ($page > 1): ?><a class="btn btn-sm btn-ghost" href="<?= e($link($page - 1)) ?>"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Prev</a><?php endif; ?>
  <span class="muted small">Page <?= (int)$page ?> of <?= (int)$pages ?></span>
  <?php if ($page < $pages): ?><a class="btn btn-sm btn-ghost" href="<?= e($link($page + 1)) ?>">Next <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a><?php endif; ?>
</nav>
