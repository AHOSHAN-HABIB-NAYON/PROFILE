<?php /** @var array $rows label/n */ if (!$rows): ?><p class="small muted">ডেটা নেই।</p><?php else: $max = max(array_column($rows, 'n')) ?: 1; ?>
<ul class="bar-list"><?php foreach ($rows as $r): ?><li><span class="bl-name"><?= e($r['label']) ?></span><span class="bl-bar"><i style="width:<?= round($r['n'] / $max * 100) ?>%"></i></span><b><?= bn_num($r['n']) ?></b></li><?php endforeach; ?></ul>
<?php endif; ?>
