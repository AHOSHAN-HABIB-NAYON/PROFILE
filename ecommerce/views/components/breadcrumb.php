<?php
/**
 * @var array $crumbs [[name, path], ...]
 */
?>
<nav class="crumbs" aria-label="ব্রেডক্রাম্ব">
  <ol>
    <?php $last = count($crumbs) - 1; foreach ($crumbs as $i => [$name, $path]): ?>
      <li><?php if ($i < $last): ?><a href="<?= e(url($path)) ?>"><?= e($name) ?></a><?php else: ?><span aria-current="page"><?= e(str_limit($name, 40)) ?></span><?php endif; ?></li>
    <?php endforeach; ?>
  </ol>
</nav>
