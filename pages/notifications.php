<?php
/** Notification center. */
defined('APP') || exit;

$u = user();
meta(['title' => t('nav.notifications'), 'robots' => 'noindex', 'cache' => false]);
$filter = input('filter', 'all');
if ($filter !== 'all' && $filter !== 'unread' && !in_array($filter, NOTIFY_TYPES, true)) $filter = 'all';
$page = max(1, input_int('page', 1));
?>
<div class="page" data-page="notifications">
  <header class="page-head row-between">
    <div><h1 class="mb-0"><?= e(t('nav.notifications')) ?></h1><p><?= e(t('notif.subtitle')) ?></p></div>
    <?php if ($u): ?><button class="btn btn-sm btn-ghost" data-action="mark-all-read"><i class="fa-solid fa-check-double"></i><span class="hide-sm"><?= e(t('notif.mark_all')) ?></span></button><?php endif ?>
  </header>

  <div class="card mb-2">
    <div class="row-between"><span class="row"><span class="icon-box sm"><i class="fa-solid fa-volume-high"></i></span><span><strong style="font-size:.9rem"><?= e(t('notif.sound')) ?></strong><br><span class="tiny muted"><?= e(t('notif.sound_text')) ?></span></span></span>
      <label class="switch"><input type="checkbox" data-action="sound-toggle" aria-label="<?= e(t('notif.sound')) ?>"><span></span></label></div>
    <?php if (setting_bool('notify.push_enabled') && setting('pwa.vapid_public')): ?>
    <div class="row-between mt-2" style="border-top:1px solid var(--border);padding-top:12px"><span class="row"><span class="icon-box sm accent"><i class="fa-solid fa-mobile-screen"></i></span><span><strong style="font-size:.9rem"><?= e(t('notif.push')) ?></strong><br><span class="tiny muted"><?= e(t('notif.push_text')) ?></span></span></span>
      <button class="btn btn-sm" data-action="push-enable"><?= e(t('notif.enable')) ?></button><span class="badge success" data-push-on hidden><i class="fa-solid fa-check"></i><?= e(t('sec.on')) ?></span></div>
    <?php endif ?>
  </div>

  <?php if (!$u): ?>
    <div class="card empty"><div class="icon-box"><i class="fa-regular fa-bell"></i></div><p><?= e(t('notif.login_to_see')) ?></p><a class="btn" href="<?= e(url('/login?next=/notifications')) ?>"><?= e(t('auth.login')) ?></a></div>
  <?php else:
      $items = user_notifications((int)$u['id'], 20, ($page - 1) * 20, $filter); ?>
    <div class="chips mb-2">
      <?php foreach (array_merge(['all', 'unread'], NOTIFY_TYPES) as $f): ?>
        <a class="chip <?= $filter === $f ? 'active' : '' ?>" href="<?= e(url('/notifications' . ($f === 'all' ? '' : '?filter=' . $f))) ?>"><?= e(t($f === 'all' ? 'common.all' : ($f === 'unread' ? 'notif.unread' : 'notif.type_' . $f))) ?></a>
      <?php endforeach ?>
    </div>
    <div id="notif-items"><?= render_notification_list($items) ?></div>
    <?php if (count($items) === 20): ?>
      <div class="center mt-2"><button class="btn btn-soft" data-action="load-more" data-url="<?= e(url('/notifications?' . http_build_query(['filter' => $filter, 'page' => $page + 1]))) ?>" data-items="#notif-items .notif-list" data-target="#notif-items .notif-list"><?= e(t('common.load_more')) ?></button></div>
    <?php endif ?>
  <?php endif ?>
</div>
