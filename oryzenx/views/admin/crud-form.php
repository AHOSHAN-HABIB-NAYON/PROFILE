<?php /** @var array $d @var ?array $row */ $e = $d['entity']; ?>
<a class="back-link" href="<?= e(url("/admin/$e")) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t($d['title'])) ?></a>
<div class="admin-head">
    <h1><?= e($row ? t('admin.edit') : t('admin.new')) ?> <span class="muted">· <?= e(t($d['title'])) ?></span></h1>
    <?php if ($row && isset($d['view'])): ?><a class="btn btn-sm btn-outline" href="<?= e($d['view']($row)) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-eye"></i> <?= e(t('common.view')) ?></a><?php endif; ?>
</div>
<form class="card form admin-form" method="post" action="<?= e(url("/admin/$e/save")) ?>" enctype="multipart/form-data" data-ajax novalidate>
    <?= csrf_field() ?>
    <?php if ($row): ?><input type="hidden" name="id" value="<?= (int)$row['id'] ?>"><?php endif; ?>
    <div class="form-grid">
        <?php foreach ($d['fields'] as $name => $f):
            $val = $row[$name] ?? ($f['default'] ?? '');
            $id = 'f-' . $name;
            $label = t($f['label']);
            $cls = 'field' . (!empty($f['half']) ? ' half' : '') . (in_array($f['type'], ['editor', 'textarea', 'lines', 'image', 'file'], true) ? ' full' : '');
        ?>
            <?php if ($f['type'] === 'checkbox'): ?>
                <div class="<?= $cls ?>"><label class="switch"><input type="hidden" name="<?= e($name) ?>" value="0"><input type="checkbox" id="<?= $id ?>" name="<?= e($name) ?>" value="1" <?= $val ? 'checked' : '' ?>><span class="track"></span><?= e($label) ?></label></div>
                <?php continue; endif; ?>
            <div class="<?= $cls ?>">
                <label for="<?= $id ?>" class="<?= !empty($f['required']) ? 'req' : '' ?>"><?= e($label) ?></label>
                <?php switch ($f['type']):
                    case 'textarea': ?>
                        <textarea class="textarea" id="<?= $id ?>" name="<?= e($name) ?>" rows="<?= (int)($f['rows'] ?? 4) ?>" <?= isset($f['max']) ? 'maxlength="' . (int)$f['max'] . '"' : '' ?>><?= e($val) ?></textarea>
                    <?php break; case 'lines': ?>
                        <textarea class="textarea mono" id="<?= $id ?>" name="<?= e($name) ?>" rows="7"><?= e($val) ?></textarea>
                    <?php break; case 'editor': ?>
                        <div class="editor" data-component="editor">
                            <textarea name="<?= e($name) ?>" id="<?= $id ?>" hidden><?= e($val) ?></textarea>
                        </div>
                    <?php break; case 'select':
                        $opts = is_callable($f['options']) ? ($f['options'])() : $f['options']; ?>
                        <select class="select" id="<?= $id ?>" name="<?= e($name) ?>">
                            <?php if (!empty($f['nullable'])): ?><option value="">—</option><?php endif; ?>
                            <?php foreach ($opts as $k => $lbl): ?><option value="<?= e($k) ?>" <?= (string)$val === (string)$k ? 'selected' : '' ?>><?= e(preg_match('/^[a-z_]+\.[a-z_]+$/', (string)$lbl) ? t($lbl) : $lbl) ?></option><?php endforeach; ?>
                        </select>
                    <?php break; case 'number': ?>
                        <input class="input" type="number" id="<?= $id ?>" name="<?= e($name) ?>" value="<?= e($val) ?>" step="<?= e($f['step'] ?? '1') ?>">
                    <?php break; case 'color': ?>
                        <div class="input-group"><input class="input" type="color" id="<?= $id ?>" name="<?= e($name) ?>" value="<?= e($val ?: '#2563eb') ?>"><span class="mono small muted" style="align-self:center"><?= e($val) ?></span></div>
                    <?php break; case 'icon': ?>
                        <div class="input-group" data-component="icon-preview"><span class="ic-box"><i class="<?= e($val) ?>" data-icon-preview></i></span><input class="input mono" id="<?= $id ?>" name="<?= e($name) ?>" value="<?= e($val) ?>" placeholder="fa-solid fa-code"></div>
                        <span class="hint"><?= t('admin.icon_hint') ?></span>
                    <?php break; case 'datetime': ?>
                        <input class="input" type="datetime-local" id="<?= $id ?>" name="<?= e($name) ?>" value="<?= $val ? e(date('Y-m-d\TH:i', strtotime((string)$val))) : '' ?>">
                    <?php break; case 'image': case 'file': ?>
                        <div class="upload-field" data-component="file-preview">
                            <?php if ($val): ?>
                                <?php if ($f['type'] === 'image'): ?><img class="upload-thumb" src="<?= e(Content::media($val)) ?>" alt=""><?php else: ?><a class="badge badge-primary" href="<?= e(upload_url($val)) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-file"></i> <?= e(basename($val)) ?></a><?php endif; ?>
                                <label class="check small"><input type="checkbox" name="<?= e($name) ?>_remove" value="1"> <?= e(t('admin.remove')) ?></label>
                            <?php else: ?><img class="upload-thumb" alt="" hidden><?php endif; ?>
                            <input class="input" type="file" id="<?= $id ?>" name="<?= e($name) ?>" accept="<?= $f['type'] === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : '.pdf,image/png,image/jpeg,image/webp' ?>">
                            <span class="hint" data-file-info></span>
                        </div>
                    <?php break; case 'slug': ?>
                        <input class="input mono" id="<?= $id ?>" name="<?= e($name) ?>" value="<?= e($val) ?>" data-slug-from="f-<?= e($f['from']) ?>" <?= isset($f['max']) ? 'maxlength="' . (int)$f['max'] . '"' : '' ?>>
                    <?php break; default: ?>
                        <input class="input" type="<?= in_array($f['type'], ['email', 'url'], true) ? $f['type'] : 'text' ?>" id="<?= $id ?>" name="<?= e($name) ?>" value="<?= e($val) ?>" <?= isset($f['max']) ? 'maxlength="' . (int)$f['max'] . '"' : '' ?>>
                <?php endswitch; ?>
                <?php if (!empty($f['hint']) && $f['type'] !== 'icon'): ?><span class="hint"><?= e(t($f['hint'])) ?></span><?php endif; ?>
            </div>
        <?php endforeach; ?>
    </div>
    <div class="form-actions sticky-actions">
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> <?= e(t('common.save')) ?></button>
        <a class="btn btn-ghost" href="<?= e(url("/admin/$e")) ?>"><?= e(t('js.cancel')) ?></a>
    </div>
</form>
