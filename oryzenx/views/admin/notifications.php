<?php /** @var array $p @var int $subs */ ?>
<div class="admin-head"><div><h1><i class="fa-solid fa-bell text-primary"></i> <?= e(t('admin.notifications')) ?></h1><p class="muted small mb-0"><?= e(t('admin.push_subs', ['n' => num($subs)])) ?></p></div></div>
<div class="admin-grid">
    <form class="card form" method="post" action="<?= e(url('/admin/notifications')) ?>" data-ajax data-refresh data-component="audience">
        <?= csrf_field() ?>
        <h2 class="card-title"><?= e(t('admin.send_notification')) ?></h2>
        <div class="seg">
            <?php foreach (['all' => ['fa-solid fa-users', 'admin.aud_all'], 'users' => ['fa-solid fa-user-check', 'admin.aud_users'], 'group' => ['fa-solid fa-people-group', 'admin.aud_group']] as $v => [$ic, $l]): ?>
                <label class="seg-opt"><input type="radio" name="audience" value="<?= $v ?>" <?= $v === 'all' ? 'checked' : '' ?>><span><i class="<?= $ic ?>"></i> <?= e(t($l)) ?></span></label>
            <?php endforeach; ?>
        </div>
        <div class="field" data-aud="users" hidden>
            <label for="user-pick"><?= e(t('admin.pick_users')) ?></label>
            <div class="user-picker" data-component="user-picker">
                <input class="input" id="user-pick" placeholder="<?= e(t('admin.user_search_ph')) ?>" autocomplete="off">
                <div class="picker-results card" hidden></div>
                <div class="picked row-gap mt-1"></div>
            </div>
        </div>
        <div class="field" data-aud="group" hidden>
            <label for="grp"><?= e(t('admin.group')) ?></label>
            <select class="select" id="grp" name="group"><?php foreach (AdminNotificationController::GROUPS as $g): ?><option value="<?= $g ?>"><?= e(t('admin.grp_' . $g)) ?></option><?php endforeach; ?></select>
        </div>
        <div class="field"><label class="req" for="n-t"><?= e(t('admin.notif_title')) ?></label><input class="input" id="n-t" name="title" maxlength="160" required></div>
        <div class="field"><label class="req" for="n-m"><?= e(t('form.message')) ?></label><textarea class="textarea" id="n-m" name="message" rows="3" maxlength="1000" required></textarea></div>
        <div class="grid grid-2">
            <div class="field"><label for="n-i"><?= e(t('admin.icon')) ?></label><div class="input-group" data-component="icon-preview"><span class="ic-box ic-box-sm"><i class="fa-solid fa-bell" data-icon-preview></i></span><input class="input mono" id="n-i" name="icon" value="fa-solid fa-bell"></div></div>
            <div class="field"><label for="n-l"><?= e(t('admin.link')) ?></label><input class="input" id="n-l" name="link" placeholder="/services"></div>
        </div>
        <div class="field"><label for="n-p"><?= e(t('admin.priority')) ?></label><select class="select" id="n-p" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></div>
        <div class="row-gap">
            <label class="switch"><input type="hidden" name="push" value="0"><input type="checkbox" name="push" value="1" checked><span class="track"></span>Web Push</label>
            <label class="switch"><input type="hidden" name="sound" value="0"><input type="checkbox" name="sound" value="1" checked><span class="track"></span><?= e(t('admin.sound')) ?></label>
            <label class="switch"><input type="hidden" name="email" value="0"><input type="checkbox" name="email" value="1"><span class="track"></span>Email</label>
        </div>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> <?= e(t('contact.send')) ?></button>
    </form>
    <section class="card">
        <h2 class="card-title mb-1"><?= e(t('admin.history')) ?></h2>
        <div class="list">
            <?php foreach ($p['rows'] as $n): ?>
                <div class="list-item"><span class="ic-box ic-box-sm"><i class="<?= e($n['icon'] ?: 'fa-solid fa-bell') ?>"></i></span>
                    <span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($n['title']) ?></span><span class="sub truncate" style="display:block"><?= e(str_limit($n['message'], 90)) ?></span>
                        <span class="xs muted"><?= e($n['user_id'] ? $n['target_name'] : t('admin.aud_all')) ?> · <?= e($n['audience']) ?> · <?= e(t('admin.reads', ['n' => num($n['reads_count'])])) ?></span></span>
                    <span class="meta"><?= e(time_ago($n['created_at'])) ?></span></div>
            <?php endforeach; ?>
            <?php if (!$p['rows']): ?><div class="empty-sm"><?= e(t('common.empty')) ?></div><?php endif; ?>
        </div>
        <?= paginate_links($p, '/admin/notifications') ?>
    </section>
</div>
