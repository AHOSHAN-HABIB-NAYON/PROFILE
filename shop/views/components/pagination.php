<?php
/** @var int $page @var int $pages */
if ($pages <= 1) {
    return;
}
$q = $_GET;
$link = static function (int $n) use ($q) {
    $q['page'] = $n;
    if ($n === 1) {
        unset($q['page']);
    }
    $qs = http_build_query(array_filter($q, static fn ($v) => is_string($v) && $v !== ''));
    return Request::path() . ($qs ? '?' . $qs : '');
};
$window = [];
for ($i = 1; $i <= $pages; $i++) {
    if ($i === 1 || $i === $pages || abs($i - $page) <= 1) {
        $window[] = $i;
    } elseif (end($window) !== '…') {
        $window[] = '…';
    }
}
?>
<nav class="pagination" aria-label="পেজ নেভিগেশন">
  <?php if ($page > 1): ?><a href="<?= e($link($page - 1)) ?>" rel="prev" aria-label="আগের পেজ"><i class="fa fa-angle-left"></i></a><?php endif; ?>
  <?php foreach ($window as $n): ?>
    <?php if ($n === '…'): ?><span class="dots">…</span>
    <?php elseif ($n === $page): ?><span class="current" aria-current="page"><?= bn_num($n) ?></span>
    <?php else: ?><a href="<?= e($link($n)) ?>"><?= bn_num($n) ?></a><?php endif; ?>
  <?php endforeach; ?>
  <?php if ($page < $pages): ?><a href="<?= e($link($page + 1)) ?>" rel="next" aria-label="পরের পেজ"><i class="fa fa-angle-right"></i></a><?php endif; ?>
</nav>
