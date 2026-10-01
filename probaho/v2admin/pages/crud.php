<?php
/** Generic list / form for resources declared in admin_resources(). */
$res = $resources[$section];
$table = $res['table'];
$fields = $res['fields'];

if ($id !== null) {
    $row = $id === 'new' ? null : db()->row("SELECT * FROM `$table` WHERE id = ?", [(int) $id]);
    if ($id !== 'new' && !$row) {
        echo '<div class="card">' . empty_state('search', 'পাওয়া যায়নি') . '</div>';
        return;
    }
    View::$meta['title'] = ($row ? 'সম্পাদনা' : 'নতুন') . ' — ' . $res['title'];
    ?>
    <div class="admin-toolbar"><a href="<?= e(url('/v2admin/' . $section)) ?>" class="btn btn-ghost btn-sm" data-link><?= icon('chevron-left') ?> তালিকা</a>
      <?php if ($row && $section === 'products' && $row['status'] === 'published'): ?><a href="<?= e(url('/products/' . $row['slug'])) ?>" target="_blank" rel="noopener" class="btn btn-ghost btn-sm"><?= icon('external') ?> দেখুন</a><?php endif; ?>
    </div>
    <form class="card admin-card" action="<?= e(url('/v2admin/api/crud/save')) ?>" method="post" enctype="multipart/form-data" data-ajax>
      <?= csrf_field() ?>
      <input type="hidden" name="resource" value="<?= e($section) ?>">
      <input type="hidden" name="id" value="<?= $row ? (int) $row['id'] : '' ?>">
      <div class="form-error" hidden></div>
      <div class="settings-grid">
      <?php foreach ($fields as $name => $f):
          $val = $row[$name] ?? ($f['default'] ?? '');
          $fid = 'f-' . $name;
          $req = !empty($f['required']) ? 'required' : '';
          ?>
        <?php if ($f['type'] === 'toggle'): ?>
          <label class="setting-toggle"><span><?= e($f['label']) ?></span><input type="hidden" name="data[<?= e($name) ?>]" value="0"><span class="switch"><input type="checkbox" name="data[<?= e($name) ?>]" value="1" <?= (string) $val === '1' ? 'checked' : '' ?>><span></span></span></label>
        <?php else: ?>
        <div class="field <?= in_array($f['type'], ['textarea', 'gallery'], true) ? 'span-2' : '' ?>">
          <label for="<?= e($fid) ?>"><?= e($f['label']) ?><?= $req ? ' *' : '' ?></label>
          <?php switch ($f['type']):
              case 'textarea': ?>
              <textarea class="textarea" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]" rows="<?= (int) ($f['rows'] ?? 5) ?>" <?= $req ?>><?= e($val) ?></textarea>
              <?php break; case 'select': ?>
              <select class="select" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]"><?php foreach ($f['options'] as $k => $v): ?><option value="<?= e($k) ?>" <?= (string) $k === (string) $val ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select>
              <?php break; case 'color': ?>
              <input type="color" class="color-input" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]" value="<?= e($val ?: '#5b4bff') ?>">
              <?php break; case 'money': case 'number': ?>
              <input class="input" type="number" step="<?= $f['type'] === 'money' ? '0.01' : '1' ?>" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]" value="<?= e($val) ?>" <?= $req ?>>
              <?php break; case 'date': ?>
              <input class="input" type="date" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]" value="<?= e($val) ?>">
              <?php break; case 'readonly': ?>
              <input class="input" id="<?= e($fid) ?>" value="<?= e($val) ?>" disabled>
              <?php break; case 'icon': ?>
              <div class="icon-picker">
                <input class="input" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]" value="<?= e($val) ?>" list="icon-list" placeholder="আইকনের নাম">
                <span class="icon-preview"><?= media_icon((string) $val) ?></span>
              </div>
              <datalist id="icon-list"><?php foreach ($f['options'] as $o): ?><option value="<?= e($o) ?>"><?php endforeach; ?></datalist>
              <div class="icon-grid"><?php foreach ($f['options'] as $o): ?><button type="button" data-icon-pick="<?= e($o) ?>" data-target="<?= e($fid) ?>" title="<?= e($o) ?>"><?= icon($o) ?></button><?php endforeach; ?></div>
              <div class="hint">অথবা নিজের আইকন আপলোড করুন:</div>
              <input class="input" type="file" name="files[<?= e($name) ?>]" accept="image/png,image/jpeg,image/webp">
              <?php break; case 'image': ?>
              <div class="row"><?php if ($val): ?><img src="<?= e(upload_url((string) $val)) ?>" alt="" class="thumb"><?php endif; ?><input class="input grow" type="file" id="<?= e($fid) ?>" name="files[<?= e($name) ?>]" accept="image/png,image/jpeg,image/webp"></div>
              <?php if ($val): ?><label class="check small" style="margin-top:6px"><input type="checkbox" name="remove[]" value="<?= e($name) ?>"> ছবি সরান</label><?php endif; ?>
              <?php break; case 'gallery': $imgs = array_filter((array) json_decode((string) $val, true)); ?>
              <?php if ($imgs): ?><div class="gallery-edit"><?php foreach ($imgs as $g): ?><label><img src="<?= e(upload_url($g)) ?>" alt=""><span class="check small"><input type="checkbox" name="gallery_remove[]" value="<?= e($g) ?>"> সরান</span></label><?php endforeach; ?></div><?php endif; ?>
              <input class="input" type="file" id="<?= e($fid) ?>" name="gallery[]" multiple accept="image/png,image/jpeg,image/webp">
              <?php break; default: ?>
              <input class="input" id="<?= e($fid) ?>" name="data[<?= e($name) ?>]" value="<?= e($val) ?>" maxlength="<?= (int) ($f['max'] ?? 255) ?>" <?= $req ?>>
          <?php endswitch; ?>
          <?php if (!empty($f['hint'])): ?><div class="hint"><?= e($f['hint']) ?></div><?php endif; ?>
        </div>
        <?php endif; ?>
      <?php endforeach; ?>
      </div>
      <div class="row" style="margin-top:8px">
        <button type="submit" class="btn btn-primary btn-lg"><?= icon('check') ?> সংরক্ষণ</button>
        <?php if ($row && empty($res['nodelete'])): ?><button type="button" class="btn btn-ghost" style="color:var(--err)" data-post="<?= e(url('/v2admin/api/crud/delete')) ?>" data-resource="<?= e($section) ?>" data-id="<?= (int) $row['id'] ?>" data-confirm="এটি স্থায়ীভাবে মুছে ফেলবেন?" data-danger><?= icon('trash') ?> মুছুন</button><?php endif; ?>
      </div>
    </form>
    <?php
    return;
}

// ---- list ----
View::$meta['title'] = $res['title'];
$q = trim((string) ($_GET['q'] ?? ''));
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 30;
$where = '1';
$args = [];
if ($q !== '' && !empty($res['search'])) {
    $where = '(' . implode(' OR ', array_map(static fn ($c) => "`$c` LIKE ?", $res['search'])) . ')';
    $args = array_fill(0, count($res['search']), '%' . $q . '%');
}
$total = (int) db()->val("SELECT COUNT(*) FROM `$table` WHERE $where", $args);
$rows = db()->all("SELECT * FROM `$table` WHERE $where ORDER BY {$res['order']} LIMIT $per OFFSET " . (($page - 1) * $per), $args);
?>
<div class="admin-toolbar">
  <?php if (!empty($res['search'])): ?>
  <form class="search-form" method="get" action="<?= e(url('/v2admin/' . $section)) ?>" data-get-form>
    <input class="input" name="q" value="<?= e($q) ?>" placeholder="খুঁজুন..."><button class="btn btn-ghost btn-icon" aria-label="খুঁজুন"><?= icon('search') ?></button>
  </form>
  <?php endif; ?>
  <?php if (empty($res['nodelete'])): ?><a href="<?= e(url('/v2admin/' . $section . '/new')) ?>" class="btn btn-primary" data-link><?= icon('plus') ?> নতুন যোগ করুন</a><?php endif; ?>
</div>
<div class="card table-card">
  <div class="table-wrap">
  <table class="table">
    <thead><tr><?php foreach ($res['columns'] as $c => $label): ?><th><?= e($label) ?></th><?php endforeach; ?><th></th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): ?>
      <tr>
        <?php foreach ($res['columns'] as $c => $label): $v = $r[$c] ?? ''; $f = $fields[$c] ?? ['type' => 'text']; ?>
          <td>
          <?php if ($f['type'] === 'toggle'): ?>
            <span class="switch switch-sm"><input type="checkbox" <?= $v ? 'checked' : '' ?> data-toggle-url="<?= e(url('/v2admin/api/crud/toggle')) ?>" data-resource="<?= e($section) ?>" data-id="<?= (int) $r['id'] ?>" data-field="<?= e($c) ?>" aria-label="<?= e($label) ?>"><span></span></span>
          <?php elseif ($f['type'] === 'icon'): ?><span class="tbl-icon" style="--c:<?= e($r['color'] ?? '#5b4bff') ?>"><?= media_icon((string) $v) ?></span>
          <?php elseif ($f['type'] === 'image'): ?><?= $v ? '<img src="' . e(upload_url((string) $v)) . '" alt="" class="thumb thumb-sm">' : '—' ?>
          <?php elseif ($f['type'] === 'select'): ?><?= $c === 'status' ? status_badge((string) $v) : e($f['options'][$v] ?? $v) ?>
          <?php elseif ($c === 'created_at' || $c === 'updated_at'): ?><span class="small muted"><?= e(bn_date((string) $v)) ?></span>
          <?php else: ?><a href="<?= e(url('/v2admin/' . $section . '/' . $r['id'])) ?>" data-link class="tbl-link"><?= e(mb_strimwidth((string) $v, 0, 70, '…')) ?></a>
          <?php endif; ?>
          </td>
        <?php endforeach; ?>
        <td class="tbl-actions"><a href="<?= e(url('/v2admin/' . $section . '/' . $r['id'])) ?>" class="icon-btn" data-link aria-label="সম্পাদনা"><?= icon('edit') ?></a></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  </div>
  <?php if (!$rows): ?><?= empty_state('list', 'কোনো আইটেম নেই') ?><?php endif; ?>
</div>
<?= admin_pagination($total, $page, $per, $q !== '' ? ['q' => $q] : []) ?>
