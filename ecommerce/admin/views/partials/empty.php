<?php
/**
 * @var string $icon @var string $title @var ?string $text @var ?string $cta @var ?string $href
 */
?>
<div class="a-empty">
  <span class="empty-icon"><i class="<?= e($icon) ?>" aria-hidden="true"></i></span>
  <strong><?= e($title) ?></strong>
  <?php if (!empty($text)): ?><p class="muted small"><?= e($text) ?></p><?php endif; ?>
  <?php if (!empty($cta)): ?><a class="btn btn-primary btn-sm" href="<?= e(url($href)) ?>"><?= e($cta) ?></a><?php endif; ?>
</div>
