<div class="page-a" data-page="trash">
  <p class="small muted mb-12">মুছে ফেলা আইটেম এখানে থাকে। রিস্টোর করুন অথবা স্থায়ীভাবে মুছে ফেলুন।</p>
  <?php if ($items): ?>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>ধরন</th><th>নাম</th><th>মুছেছেন</th><th>তারিখ</th><th></th></tr></thead>
    <tbody><?php foreach ($items as $t): ?>
      <tr>
        <td data-label="ধরন"><span class="pill"><?= e(TrashService::ENTITIES[$t['entity']]['label'] ?? $t['entity']) ?></span></td>
        <td data-label="নাম"><b><?= e($t['title']) ?></b></td>
        <td data-label="মুছেছেন" class="small"><?= e($t['admin_name'] ?: '—') ?></td>
        <td data-label="তারিখ" class="small"><?= date('d/m/y h:i A', strtotime($t['deleted_at'])) ?></td>
        <td class="actions">
          <button type="button" class="btn btn-soft btn-xs" data-post="/admin/api/trash/<?= (int) $t['id'] ?>/restore" data-reload><i class="fa fa-undo"></i> রিস্টোর</button>
          <button type="button" class="btn btn-ghost btn-xs danger-text" data-post="/admin/api/trash/<?= (int) $t['id'] ?>/purge" data-confirm="স্থায়ীভাবে মুছে ফেলবেন? এটি আর ফিরিয়ে আনা যাবে না।" data-reload><i class="fa fa-times"></i> স্থায়ী ডিলিট</button>
        </td>
      </tr>
    <?php endforeach; ?></tbody></table></div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'trash', 'title' => 'ট্র্যাশ খালি']); ?>
  <?php endif; ?>
</div>
