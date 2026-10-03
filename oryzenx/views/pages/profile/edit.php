<?php /** @var array $u @var string $tab */ require VIEWS . '/components/profile-head.php'; ?>
<div class="profile-cols">
    <form class="card form" method="post" action="<?= e(url('/profile/edit')) ?>" data-ajax novalidate>
        <?= csrf_field() ?>
        <h2 class="card-title"><?= e(t('profile.personal')) ?></h2>
        <div class="field"><label class="req" for="p-name"><?= e(t('form.name')) ?></label><input class="input" id="p-name" name="name" value="<?= e($u['name']) ?>" required maxlength="100" autocomplete="name"></div>
        <div class="field"><label class="req" for="p-email"><?= e(t('form.email')) ?></label><input class="input" id="p-email" type="email" name="email" value="<?= e($u['email']) ?>" required maxlength="190" autocomplete="email"><span class="hint"><?= e(t('profile.email_hint')) ?></span></div>
        <?php if ($u['password_hash']): ?>
        <div class="field"><label for="p-cur"><?= e(t('profile.current_pw_email')) ?></label><input class="input" id="p-cur" type="password" name="current_password" autocomplete="current-password"></div>
        <?php endif; ?>
        <div class="grid grid-2">
            <div class="field"><label for="p-phone"><?= e(t('form.phone')) ?></label><input class="input" id="p-phone" name="phone" value="<?= e($u['phone']) ?>" maxlength="30" autocomplete="tel" inputmode="tel"></div>
            <div class="field"><label for="p-lang"><?= e(t('nav.language')) ?></label><select class="select" id="p-lang" name="lang"><option value=""><?= e(t('profile.lang_default')) ?></option><?php foreach (Lang::AVAILABLE as $k => $l): ?><option value="<?= $k ?>" <?= $u['lang'] === $k ? 'selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select></div>
        </div>
        <div class="field" data-component="char-count"><label for="p-bio"><?= e(t('profile.bio')) ?></label><textarea class="textarea" id="p-bio" name="bio" maxlength="500" rows="3"><?= e($u['bio']) ?></textarea><span class="hint right" data-count></span></div>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> <?= e(t('common.save')) ?></button>
    </form>
    <div class="stack">
        <form class="card form" method="post" action="<?= e(url('/profile/avatar')) ?>" enctype="multipart/form-data" data-ajax>
            <?= csrf_field() ?>
            <h2 class="card-title"><?= e(t('profile.photo')) ?></h2>
            <div class="row" data-component="file-preview">
                <?= avatar_html($u, 'avatar-lg') ?>
                <img class="avatar avatar-lg" alt="" hidden>
                <div class="grow"><input class="input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp" aria-label="<?= e(t('profile.photo')) ?>"><span class="hint" data-file-info><?= e(t('profile.photo_hint')) ?></span></div>
            </div>
            <div class="form-actions">
                <button class="btn btn-sm btn-primary" type="submit"><i class="fa-solid fa-upload"></i> <?= e(t('profile.upload')) ?></button>
                <?php if ($u['avatar']): ?><button class="btn btn-sm btn-ghost text-danger" type="submit" name="remove" value="1"><?= e(t('admin.remove')) ?></button><?php endif; ?>
            </div>
        </form>
        <section class="card">
            <h2 class="card-title mb-1"><?= e(t('profile.notifications')) ?></h2>
            <p class="small muted"><?= e(t('profile.push_d')) ?> <b data-component="push-status"></b></p>
            <button class="btn btn-sm btn-outline" type="button" data-action="push-enable"><i class="fa-solid fa-bell"></i> <?= e(t('profile.enable_push')) ?></button>
        </section>
    </div>
</div>
