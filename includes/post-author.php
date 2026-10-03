<?php
/** Post header: site logo avatar, name + Admin badge, time line. Expects $pa = ['time' => ..., 'cat' => ...]. */
defined('APP') || exit;
?>
<div class="post-author">
  <span class="avatar logo"><?php if (setting('logo')): ?><img src="<?= e(media_url(setting('logo'))) ?>" alt="" width="44" height="44" loading="lazy"><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
  <div class="grow" style="min-width:0">
    <div class="pa-name"><b class="truncate"><?= e(setting('site_name')) ?></b><span class="badge solid"><i class="fa-solid fa-circle-check"></i><?= e(t('common.admin')) ?></span></div>
    <div class="pa-sub"><i class="fa-regular fa-clock"></i> <?= e(time_ago($pa['time'])) ?><?php if (!empty($pa['cat'])): ?> · <?= e($pa['cat']) ?><?php endif ?></div>
  </div>
</div>
