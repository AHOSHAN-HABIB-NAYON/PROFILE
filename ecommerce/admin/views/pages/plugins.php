<?php
/**
 * @var array $cards
 */
$groups = ['tracking' => 'Marketing & tracking', 'courier' => 'Courier & delivery', 'security' => 'Security', 'support' => 'Support'];
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Plugins</h1><p class="muted small">Connect integrations without editing code. API secrets are stored encrypted and never sent to the browser.</p></div></div>
  <?php foreach ($groups as $g => $label): $items = array_filter($cards, static fn($c) => $c['category'] === $g); if (!$items) continue; ?>
    <h2 class="group-title"><?= e($label) ?></h2>
    <div class="plugin-grid">
      <?php foreach ($items as $c): ?>
        <a class="plugin-card" href="<?= e(url($c['link'] ?: '/admin/plugins/' . $c['slug'])) ?>">
          <div class="plugin-top">
            <span class="plugin-icon"><i class="<?= e($c['icon']) ?>" aria-hidden="true"></i></span>
            <span class="plugin-status">
              <?= $c['enabled'] ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-muted">Disabled</span>' ?>
              <?= $c['connected'] ? '<span class="badge badge-info">' . ($c['category'] === 'courier' ? 'Connected' : 'Configured') . '</span>' : '<span class="badge badge-warning">Not connected</span>' ?>
            </span>
          </div>
          <strong class="plugin-name"><?= e($c['name']) ?></strong>
          <p class="muted small"><?= e($c['description']) ?></p>
          <div class="plugin-features"><?php foreach (array_slice($c['features'], 0, 4) as $f): ?><span><?= e($f) ?></span><?php endforeach; ?></div>
          <span class="plugin-cta">Settings <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
        </a>
      <?php endforeach; ?>
    </div>
  <?php endforeach; ?>
</div>
