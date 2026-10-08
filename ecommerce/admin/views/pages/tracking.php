<?php
/**
 * @var array $rows @var array $status
 */
$cards = [
    'meta_pixel' => ['Meta Pixel', 'fa-brands fa-meta'], 'meta_capi' => ['Conversions API', 'fa-solid fa-server'],
    'google_tag' => ['Google Tag Manager', 'fa-brands fa-google'], 'google_ads' => ['Google Ads', 'fa-solid fa-rectangle-ad'],
];
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Pixel &amp; Tracking</h1><p class="muted small">Scripts load only when configured. Route changes inside the app send PageView events too.</p></div></div>
  <div class="courier-cards">
    <?php foreach ($cards as $slug => [$label, $ic]): ?>
      <a class="a-card courier-mini" href="<?= e(url('/admin/plugins/' . $slug)) ?>">
        <span class="plugin-icon"><i class="<?= e($ic) ?>" aria-hidden="true"></i></span>
        <div><strong><?= e($label) ?></strong><span class="small d-block"><?= $status[$slug] ? '<span class="text-success">● Active</span>' : '<span class="muted">● Not configured</span>' ?></span></div>
        <i class="fa-solid fa-chevron-right muted" aria-hidden="true"></i>
      </a>
    <?php endforeach; ?>
  </div>
  <form class="a-card a-table-card" method="post" action="<?= e(url('/admin/tracking')) ?>" data-ajax data-no-spa>
    <h2 class="a-card-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Events</h2>
    <table class="a-table">
      <thead><tr><th>Provider</th><th>Event</th><th>Browser</th><th>Server (CAPI)</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $row): ?>
        <tr>
          <td><?= $row['provider'] === 'meta' ? 'Meta' : 'Google' ?></td>
          <td class="mono"><?= e($row['event_name']) ?></td>
          <td><label class="switch-row compact"><input type="checkbox" name="browser[<?= (int)$row['id'] ?>]" value="1"<?= (int)$row['browser_enabled'] === 1 ? ' checked' : '' ?>><span class="toggle"></span><span class="sr-only">Browser</span></label></td>
          <td><?php if ($row['provider'] === 'meta'): ?><label class="switch-row compact"><input type="checkbox" name="server[<?= (int)$row['id'] ?>]" value="1"<?= (int)$row['server_enabled'] === 1 ? ' checked' : '' ?>><span class="toggle"></span><span class="sr-only">Server</span></label><?php else: ?><span class="muted small">—</span><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <p class="muted small">Server PageView is off by default to save API calls; ViewContent, AddToCart, InitiateCheckout and Purchase are deduplicated with event_id.</p>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Save events</button></div>
  </form>
</div>
