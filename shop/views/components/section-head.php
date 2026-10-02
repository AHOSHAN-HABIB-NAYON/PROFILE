<div class="section-head">
  <h2 class="section-title"><?php if (!empty($icon)): ?><i class="fa fa-<?= e($icon) ?>"></i> <?php endif; ?><?= e($title) ?></h2>
  <?php if (!empty($extra)): ?><?= $extra ?><?php endif; ?>
  <?php if (!empty($link)): ?><a href="<?= e($link) ?>" class="see-all">সব দেখুন <i class="fa fa-angle-right"></i></a><?php endif; ?>
</div>
