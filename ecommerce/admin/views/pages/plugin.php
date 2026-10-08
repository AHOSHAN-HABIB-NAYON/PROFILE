<?php
/**
 * Single plugin settings (generic plugin or courier).
 * @var string $type @var string $slug @var string $name @var string $icon @var string $description @var array $features @var bool $enabled
 */
$canTest = $type === 'courier' || in_array($slug, ['meta_pixel', 'meta_capi'], true);
?>
<div class="a-page narrow">
  <a href="<?= e(url('/admin/plugins')) ?>" class="back-link"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Plugins</a>
  <div class="plugin-hero a-card">
    <span class="plugin-icon lg"><i class="<?= e($icon) ?>" aria-hidden="true"></i></span>
    <div>
      <h1 class="a-title"><?= e($name) ?></h1>
      <p class="muted small"><?= e($description) ?></p>
      <div class="plugin-features"><?php foreach ($features as $f): ?><span><?= e(ucfirst($f)) ?></span><?php endforeach; ?></div>
    </div>
  </div>

  <form class="a-card" method="post" action="<?= e(url('/admin/plugins/' . $slug)) ?>" data-ajax data-no-spa autocomplete="off">
    <label class="switch-row"><input type="checkbox" name="enabled" value="1"<?= $enabled ? ' checked' : '' ?>><span class="toggle"></span><span><strong>Enable <?= e($name) ?></strong></span></label>

    <?php if ($type === 'courier'): ?>
      <label class="switch-row"><input type="checkbox" name="is_default" value="1"<?= $isDefault ? ' checked' : '' ?>><span class="toggle"></span><span>Default courier (pre-selected when sending orders)</span></label>
      <h2 class="a-card-title mt"><i class="fa-solid fa-key" aria-hidden="true"></i> API credentials</h2>
      <?php foreach ($credentialFields as $key => $f): ?>
        <div class="field">
          <label class="label" for="cred-<?= e($key) ?>"><?= e($f['label']) ?></label>
          <input id="cred-<?= e($key) ?>" class="input" type="password" name="cred[<?= e($key) ?>]" autocomplete="new-password" placeholder="<?= !empty($savedCreds[$key]) ? '•••••••• saved — leave blank to keep' : e($f['placeholder'] ?: 'Enter value') ?>">
        </div>
      <?php endforeach; ?>
      <?php if ($settingFields): ?>
        <h2 class="a-card-title mt"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Options</h2>
        <?php foreach ($settingFields as $key => $f): ?>
          <div class="field"><label class="label" for="opt-<?= e($key) ?>"><?= e($f['label']) ?></label><input id="opt-<?= e($key) ?>" class="input" name="opt[<?= e($key) ?>]" value="<?= e($settings[$key] ?? $f['default'] ?? '') ?>" placeholder="<?= e($f['placeholder']) ?>"></div>
        <?php endforeach; ?>
      <?php endif; ?>
      <p class="small <?= (int)$row['connected'] === 1 ? 'text-success' : 'muted' ?>">
        <?= $row['last_tested_at'] ? ((int)$row['connected'] === 1 ? '● Connected' : '● Last test failed') . ' · tested ' . e(time_ago($row['last_tested_at'])) : '● Not tested yet' ?>
        <?= $row['last_error'] && (int)$row['connected'] !== 1 ? '<span class="d-block text-danger">' . e($row['last_error']) . '</span>' : '' ?>
      </p>
    <?php else: ?>
      <?php foreach ($fields as $key => $f): ?>
        <?php if (($f['type'] ?? '') === 'toggle'): ?>
          <label class="switch-row"><input type="checkbox" name="cfg[<?= e($key) ?>]" value="1"<?= ($values[$key] ?? '') === '1' ? ' checked' : '' ?>><span class="toggle"></span><span><?= e($f['label']) ?></span></label>
        <?php else: ?>
          <div class="field">
            <label class="label" for="cfg-<?= e($key) ?>"><?= e($f['label']) ?><?= !empty($f['secret']) ? ' <i class="fa-solid fa-lock muted" aria-hidden="true" title="Stored encrypted, never shown"></i>' : '' ?></label>
            <input id="cfg-<?= e($key) ?>" class="input" type="<?= !empty($f['secret']) ? 'password' : 'text' ?>" name="cfg[<?= e($key) ?>]" value="<?= e($values[$key] ?? '') ?>" autocomplete="<?= !empty($f['secret']) ? 'new-password' : 'off' ?>"
                   placeholder="<?= !empty($values[$key . '__saved']) ? '•••••••• saved — leave blank to keep' : e($f['placeholder'] ?? '') ?>">
          </div>
        <?php endif; ?>
      <?php endforeach; ?>
      <?php if ($slug === 'meta_capi'): ?><p class="muted small">Purchase, AddToCart, ViewContent and InitiateCheckout are sent from the server with the same <code>event_id</code> as the browser Pixel so Meta deduplicates them. Phone and name are SHA-256 hashed.</p><?php endif; ?>
    <?php endif; ?>

    <div class="form-actions">
      <?php if ($canTest): ?><button type="button" class="btn btn-outline" data-action="post" data-url="<?= e(url('/admin/plugins/' . $slug . '/test')) ?>"><i class="fa-solid fa-plug-circle-check" aria-hidden="true"></i> Test connection</button><?php endif; ?>
      <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save</button>
    </div>
  </form>
</div>
