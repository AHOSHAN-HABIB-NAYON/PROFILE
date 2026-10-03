<?php
/** Logo + site name shown at the top of auth cards (login, register, reset). */
defined('APP') || exit;
?>
<a class="auth-brand" href="<?= e(url('/')) ?>">
  <span class="brand-logo"><?php if (setting('logo')): ?><img src="<?= e(media_url(setting('logo'))) ?>" alt="" width="46" height="46"><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
  <span><?= e(setting('site_name')) ?></span>
</a>
