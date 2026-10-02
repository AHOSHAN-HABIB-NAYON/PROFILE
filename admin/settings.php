<?php
/** Admin: Master Control Center (all settings groups). */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Settings']);

$schema = settings_schema();
$tab = isset($schema[input('tab')]) ? input('tab') : 'general';
$def = $schema[$tab];
$embedded = ['payment' => ['payment_methods', 'Payment methods'], 'contact' => ['social_links', 'Social links']];
$editingSub = isset($embedded[$tab]) && (input_int('edit') || input('new') === '1');
?>
<div class="page">
  <div class="adm-title"><h1>Settings</h1><span class="muted small">Master control center</span></div>
  <nav class="tabs" aria-label="Settings sections">
    <?php foreach ($schema as $k => $s): ?><a class="tab <?= $k === $tab ? 'active' : '' ?>" href="<?= e(url('/admin/settings?tab=' . $k)) ?>"><i class="<?= e(fa($s['icon'])) ?>"></i><?= e($s['title']) ?></a><?php endforeach ?>
  </nav>

  <?php if ($editingSub): crud_render($embedded[$tab][0], '/admin/settings?tab=' . $tab); else: ?>
  <form class="card card-pad-lg mb-2" method="post" action="<?= e(url('/api/admin?action=settings_save')) ?>" data-ajax enctype="multipart/form-data" novalidate>
    <input type="hidden" name="__tab" value="<?= e($tab) ?>">
    <h2 style="font-size:1rem"><i class="<?= e(fa($def['icon'])) ?>" style="color:var(--primary)"></i> <?= e($def['title']) ?></h2>
    <div class="form-grid">
      <?php foreach ($def['fields'] as $key => $f) echo admin_field($key, $f, setting($key)); ?>
    </div>
    <div class="upload-progress"><i></i></div>
    <div class="form-actions">
      <?php if ($tab === 'smtp'): ?><button type="button" class="btn btn-ghost" data-action="smtp-test"><i class="fa-solid fa-paper-plane"></i>Send test email</button><?php endif ?>
      <?php if ($tab === 'pwa'): ?><button type="button" class="btn btn-ghost" data-action="post" data-url="<?= e(url('/api/admin?action=vapid_generate')) ?>" data-confirm="Generate new VAPID keys? Existing push subscriptions will stop working and visitors must re-subscribe."><i class="fa-solid fa-key"></i>Generate VAPID keys</button><?php endif ?>
      <?php if ($tab === 'maintenance'): ?><button type="button" class="btn btn-ghost" data-action="post" data-url="<?= e(url('/api/admin?action=maintenance_restart')) ?>" data-confirm="Restart the countdown from now using the estimated duration?"><i class="fa-solid fa-rotate-right"></i>Restart countdown</button><?php endif ?>
      <?php if ($tab === 'ai'): ?><a class="btn btn-ghost" href="<?= e(url('/admin/ai')) ?>"><i class="fa-solid fa-vial"></i>Test AI</a><?php endif ?>
      <button class="btn btn-lg" type="submit"><i class="fa-solid fa-floppy-disk"></i>Save <?= e(strtolower($def['title'])) ?></button>
    </div>
  </form>
  <?php if ($tab === 'theme'): ?>
    <section class="card card-pad-lg mb-2"><h2 style="font-size:1rem">Preview</h2>
      <div class="row wrap"><button class="btn">Primary</button><button class="btn btn-soft">Soft</button><button class="btn btn-ghost">Ghost</button><span class="badge">Badge</span><span class="status status-approved">Approved</span><span class="status status-pending">Pending</span><span class="icon-box"><i class="fa-solid fa-bolt"></i></span><span class="icon-box secondary"><i class="fa-solid fa-star"></i></span><span class="icon-box accent"><i class="fa-solid fa-gem"></i></span></div>
      <p class="hint mt-1">Colors update across the whole site immediately after saving (reload to see them here).</p></section>
  <?php endif ?>
  <?php if (isset($embedded[$tab])): ?>
    <section class="mb-2"><h2 style="font-size:1rem"><?= e($embedded[$tab][1]) ?></h2>
      <?php if ($tab === 'payment'): ?><p class="muted small">Enable a method after entering its address / number. Customers see enabled methods on the payment page with copy buttons, QR and instructions.</p><?php endif ?>
      <?php crud_render($embedded[$tab][0], '/admin/settings?tab=' . $tab) ?></section>
  <?php endif ?>
  <?php endif ?>
</div>
