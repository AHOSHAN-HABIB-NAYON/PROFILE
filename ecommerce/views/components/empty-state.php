<?php
/**
 * @var string $icon @var string $title @var string $text @var ?string $cta @var ?string $href
 */
?>
<div class="empty">
  <span class="empty-icon"><i class="<?= e($icon) ?>" aria-hidden="true"></i></span>
  <h2 class="empty-title"><?= e($title) ?></h2>
  <?php if (!empty($text)): ?><p class="muted"><?= e($text) ?></p><?php endif; ?>
  <?php if (!empty($cta)): ?><a href="<?= e(url($href ?? '/')) ?>" class="btn btn-primary"><?= e($cta) ?></a><?php endif; ?>
</div>
