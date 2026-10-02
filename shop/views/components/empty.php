<div class="empty">
  <span class="empty-icon"><i class="fa fa-<?= e($icon ?? 'inbox') ?>"></i></span>
  <p class="empty-title"><?= e($title) ?></p>
  <?php if (!empty($text)): ?><p class="muted small"><?= e($text) ?></p><?php endif; ?>
  <?php if (!empty($link)): ?><a href="<?= e($link) ?>" class="btn btn-primary btn-sm"><?= e($linkText ?? 'কেনাকাটা শুরু করুন') ?></a><?php endif; ?>
</div>
