<?php
/**
 * @var string $title @var string $icon @var ?string $link @var ?string $extra (pre-escaped HTML)
 */
?>
<div class="section-head">
  <h2 class="section-title"><span class="section-icon"><i class="<?= e($icon) ?>" aria-hidden="true"></i></span><?= e($title) ?></h2>
  <?= $extra ?? '' ?>
  <?php if (!empty($link)): ?><a class="section-link" href="<?= e(url($link)) ?>">সব দেখুন <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><?php endif; ?>
</div>
