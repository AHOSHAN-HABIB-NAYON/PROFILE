<?php
/**
 * KPI card. @var string $label @var string $value @var string $icon @var string $tone (primary|success|warning|danger|info) @var ?string $href
 */
$tag = !empty($href) ? 'a' : 'div';
?>
<<?= $tag ?> class="kpi kpi-<?= e($tone ?? 'primary') ?>"<?= !empty($href) ? ' href="' . e(url($href)) . '"' : '' ?>>
  <span class="kpi-icon"><i class="<?= e($icon) ?>" aria-hidden="true"></i></span>
  <span class="kpi-body"><span class="kpi-label"><?= e($label) ?></span><strong class="kpi-value"><?= e($value) ?></strong></span>
</<?= $tag ?>>
