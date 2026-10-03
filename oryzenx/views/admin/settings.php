<?php /** @var array $sections @var ?string $current @var array $s @var array $methods */ ?>
<div class="admin-head"><h1><i class="fa-solid fa-gear text-primary"></i> <?= e(t('admin.settings')) ?></h1></div>
<nav class="chips settings-nav" aria-label="<?= e(t('admin.settings')) ?>">
    <?php foreach ($sections as $key => $sec): ?>
        <a class="chip<?= $current === $key ? ' active' : '' ?>" href="<?= e(url('/admin/settings/' . $key)) ?>"><i class="<?= e($sec['icon']) ?>"></i> <?= e(t('set.' . $key)) ?></a>
    <?php endforeach; ?>
</nav>
<?php if ($current === null): ?>
    <div class="settings-grid">
        <?php foreach ($sections as $key => $sec): ?>
            <a class="card card-link settings-tile" href="<?= e(url('/admin/settings/' . $key)) ?>">
                <span class="ic-box"><i class="<?= e($sec['icon']) ?>"></i></span>
                <span><strong><?= e(t('set.' . $key)) ?></strong><small class="muted"><?= e(t('set.' . $key . '_d')) ?></small></span>
            </a>
        <?php endforeach; ?>
    </div>
<?php else: ?>
<div class="admin-grid">
    <form class="card form" method="post" action="<?= e(url('/admin/settings/' . $current)) ?>" enctype="multipart/form-data" data-ajax>
        <?= csrf_field() ?>
        <h2 class="card-title"><i class="<?= e($s['icon']) ?> text-primary"></i> <?= e(t('set.' . $current)) ?></h2>
        <?php if (!empty($s['info'])): ?><div class="alert alert-info"><i class="fa-solid fa-circle-info"></i><span><?= e(t($s['info'])) ?></span></div><?php endif; ?>
        <div class="form-grid">
        <?php foreach ($s['fields'] as $key => $f):
            $val = (string)setting($key); $id = 's-' . $key; $label = t('set.' . $key);
            $wide = in_array($f['type'], ['textarea', 'image'], true); ?>
            <?php if ($f['type'] === 'checkbox'): ?>
                <div class="field full"><label class="switch"><input type="hidden" name="<?= $key ?>" value="0"><input type="checkbox" id="<?= $id ?>" name="<?= $key ?>" value="1" <?= $val === '1' ? 'checked' : '' ?>><span class="track"></span><?= e($label) ?></label>
                    <?php if (!empty($f['hint'])): ?><span class="hint"><?= e(t($f['hint'])) ?></span><?php endif; ?></div>
            <?php continue; endif; ?>
            <div class="field<?= $wide ? ' full' : ' half' ?>">
                <label for="<?= $id ?>"><?= e($label) ?></label>
                <?php if ($f['type'] === 'textarea'): ?>
                    <textarea class="textarea" id="<?= $id ?>" name="<?= $key ?>" rows="<?= (int)($f['rows'] ?? 3) ?>"><?= e($val) ?></textarea>
                <?php elseif ($f['type'] === 'select'): ?>
                    <select class="select" id="<?= $id ?>" name="<?= $key ?>"><?php foreach ($f['options'] as $k => $lbl): ?><option value="<?= e($k) ?>" <?= $val === (string)$k ? 'selected' : '' ?>><?= e($lbl) ?></option><?php endforeach; ?></select>
                <?php elseif ($f['type'] === 'color'): ?>
                    <div class="input-group"><input class="input" type="color" id="<?= $id ?>" name="<?= $key ?>" value="<?= e($val ?: '#2563eb') ?>"><code style="align-self:center"><?= e($val) ?></code></div>
                <?php elseif ($f['type'] === 'secret'): ?>
                    <div class="input-icon"><i class="fa-solid fa-key"></i><input class="input" type="password" id="<?= $id ?>" name="<?= $key ?>" autocomplete="new-password" placeholder="<?= e($val !== '' ? '•••••••• ' . t('set.saved_secret') : t('set.not_set')) ?>"></div>
                    <?php if ($val !== ''): ?><label class="check xs"><input type="checkbox" name="<?= $key ?>_clear" value="1"> <?= e(t('set.clear_secret')) ?></label><?php endif; ?>
                <?php elseif ($f['type'] === 'image'): ?>
                    <div class="upload-field" data-component="file-preview">
                        <?php if ($val): ?><img class="upload-thumb" src="<?= e(upload_url($val)) ?>" alt=""><label class="check small"><input type="checkbox" name="<?= $key ?>_remove" value="1"> <?= e(t('admin.remove')) ?></label>
                        <?php else: ?><img class="upload-thumb" alt="" hidden><?php endif; ?>
                        <input class="input" type="file" id="<?= $id ?>" name="<?= $key ?>" accept="image/jpeg,image/png,image/webp"><span class="hint" data-file-info></span>
                    </div>
                <?php else: ?>
                    <input class="input" type="<?= $f['type'] === 'number' ? 'number' : ($f['type'] === 'email' ? 'email' : ($f['type'] === 'url' ? 'url' : 'text')) ?>" id="<?= $id ?>" name="<?= $key ?>" value="<?= e($val) ?>" placeholder="<?= e($f['placeholder'] ?? '') ?>" <?= isset($f['min']) ? 'min="' . $f['min'] . '"' : '' ?> <?= isset($f['max']) && $f['type'] === 'number' ? 'max="' . $f['max'] . '"' : '' ?>>
                <?php endif; ?>
                <?php if (!empty($f['hint'])): ?><span class="hint"><?= e(t($f['hint'])) ?></span><?php endif; ?>
            </div>
        <?php endforeach; ?>
        </div>
        <div class="form-actions sticky-actions"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> <?= e(t('common.save')) ?></button></div>
    </form>

    <div class="stack">
        <?php if (!empty($s['google'])): ?>
            <section class="card">
                <h2 class="card-title mb-1"><i class="fa-brands fa-google"></i> <?= e(t('set.redirect_uri')) ?></h2>
                <p class="xs muted"><?= e(t('set.redirect_uri_d')) ?></p>
                <div class="copy-box"><span><?= e(GoogleController::redirectUri()) ?></span><button class="btn btn-xs btn-primary" type="button" data-action="copy" data-copy="<?= e(GoogleController::redirectUri()) ?>"><i class="fa-regular fa-copy"></i></button></div>
                <p class="xs muted mt-1 mb-0"><?= e(t('set.js_origin')) ?>: <code><?= e(preg_replace('#^(https?://[^/]+).*#', '$1', base_url())) ?></code></p>
            </section>
        <?php endif; ?>
        <?php if (($s['test'] ?? '') === 'smtp'): ?>
            <form class="card form" method="post" action="<?= e(url('/admin/settings-test/smtp')) ?>" data-ajax>
                <?= csrf_field() ?>
                <h2 class="card-title"><i class="fa-solid fa-vial"></i> <?= e(t('set.test_smtp')) ?></h2>
                <p class="xs muted mb-0"><?= e(t('set.test_smtp_d')) ?></p>
                <input class="input" type="email" name="to" value="<?= e(auth()['email']) ?>" aria-label="Email">
                <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('set.send_test')) ?></button>
            </form>
        <?php endif; ?>
        <?php if (($s['test'] ?? '') === 'ai'): ?>
            <form class="card form" method="post" action="<?= e(url('/admin/settings-test/ai')) ?>" data-ajax data-component="ai-test">
                <?= csrf_field() ?>
                <h2 class="card-title"><i class="fa-solid fa-vial"></i> <?= e(t('set.test_ai')) ?></h2>
                <textarea class="textarea" name="prompt" rows="2" aria-label="Prompt"><?= e(t('set.test_ai_prompt')) ?></textarea>
                <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-bolt"></i> <?= e(t('set.run_test')) ?></button>
                <div class="ai-test-out msg-body" hidden></div>
            </form>
        <?php endif; ?>
        <?php if (!empty($s['methods'])): ?>
            <section class="card">
                <div class="card-head"><h2 class="card-title"><?= e(t('admin.payment_methods')) ?></h2><a class="btn btn-xs btn-outline" href="<?= e(url('/admin/payment-methods/new')) ?>"><i class="fa-solid fa-plus"></i></a></div>
                <div class="list">
                    <?php foreach ($methods as $m): ?>
                        <a class="list-item" href="<?= e(url('/admin/payment-methods/' . $m['id'])) ?>"><img src="<?= e(Content::media($m['logo'])) ?>" width="26" height="26" alt="">
                            <span class="grow" style="min-width:0"><span class="title" style="display:block"><?= e($m['name']) ?></span><span class="sub mono truncate" style="display:block"><?= e($m['account_number'] ?: t('admin.not_set')) ?></span></span>
                            <?= $m['is_active'] ? ($m['account_number'] || $m['link'] || $m['qr_image'] ? '<span class="badge badge-success">' . e(t('admin.live')) . '</span>' : '<span class="badge badge-warning">' . e(t('admin.hidden_empty')) . '</span>') : '<span class="badge">' . e(t('common.off')) . '</span>' ?></a>
                    <?php endforeach; ?>
                </div>
            </section>
        <?php endif; ?>
        <?php if (!empty($s['seo'])): ?>
            <section class="card">
                <h2 class="card-title mb-1"><?= e(t('set.seo_files')) ?></h2>
                <div class="list">
                    <a class="list-item" href="<?= e(url('/sitemap.xml')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-sitemap"></i> sitemap.xml</a>
                    <a class="list-item" href="<?= e(url('/robots.txt')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-robot"></i> robots.txt</a>
                    <a class="list-item" href="<?= e(url('/manifest.json')) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-mobile"></i> manifest.json</a>
                </div>
            </section>
        <?php endif; ?>
        <?php foreach ($s['links'] ?? [] as [$href, $lbl, $ic]): ?>
            <a class="card card-link row" href="<?= e(url($href)) ?>"><span class="ic-box ic-box-sm"><i class="<?= e($ic) ?>"></i></span><strong class="grow"><?= e(t($lbl)) ?></strong><i class="fa-solid fa-chevron-right muted xs"></i></a>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>
