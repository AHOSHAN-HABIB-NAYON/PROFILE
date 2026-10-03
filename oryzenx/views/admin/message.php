<?php /** @var array $m */ ?>
<a class="back-link" href="<?= e(url('/admin/messages')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('admin.messages')) ?></a>
<div class="admin-grid">
    <section class="card">
        <div class="between mb-1"><h1 style="font-size:1.1rem;margin:0"><?= e($m['subject']) ?></h1><?= status_badge($m['status']) ?></div>
        <dl class="kv mb-2">
            <dt><?= e(t('form.name')) ?></dt><dd><?= e($m['name']) ?><?= $m['user_id'] ? ' · <a href="' . e(url('/admin/users/' . $m['user_id'])) . '">#' . (int)$m['user_id'] . '</a>' : '' ?></dd>
            <dt><?= e(t('form.email')) ?></dt><dd><a href="mailto:<?= e($m['email']) ?>"><?= e($m['email']) ?></a></dd>
            <dt><?= e(t('profile.date')) ?></dt><dd><?= e(fmt_date($m['created_at'], true)) ?> · <?= e($m['ip']) ?></dd>
            <?php if ($m['attachment']): ?><dt><?= e(t('form.attachment')) ?></dt><dd><a class="badge badge-primary" href="<?= e(url('/files/contact/' . $m['id'])) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-paperclip"></i> <?= e(t('common.open')) ?></a></dd><?php endif; ?>
        </dl>
        <div class="msg-body"><?= nl2br(e($m['message'])) ?></div>
        <?php if ($m['admin_reply']): ?>
            <h2 class="card-title mt-2 mb-1"><?= e(t('admin.your_reply')) ?> <small class="muted"><?= e(fmt_date($m['replied_at'], true)) ?></small></h2>
            <div class="msg-body reply"><?= nl2br(e($m['admin_reply'])) ?></div>
        <?php endif; ?>
    </section>
    <form class="card form" method="post" action="<?= e(url('/admin/messages/' . $m['id'])) ?>" data-ajax data-refresh>
        <?= csrf_field() ?>
        <h2 class="card-title"><?= e(t('admin.reply')) ?></h2>
        <textarea class="textarea" name="reply" rows="7" maxlength="5000" placeholder="<?= e(t('admin.reply_ph')) ?>" aria-label="<?= e(t('admin.reply')) ?>"></textarea>
        <p class="xs muted mb-0"><?= e(Mailer::configured() ? t('admin.reply_via_email', ['email' => $m['email']]) : t('admin.smtp_missing')) ?></p>
        <div class="form-actions">
            <button class="btn btn-primary btn-sm" type="submit" name="action" value="reply"><i class="fa-solid fa-reply"></i> <?= e(t('admin.send_reply')) ?></button>
            <a class="btn btn-sm btn-outline" href="mailto:<?= e($m['email']) ?>?subject=<?= rawurlencode('Re: ' . $m['subject']) ?>" data-no-spa><i class="fa-solid fa-envelope"></i> <?= e(t('admin.open_mail')) ?></a>
            <button class="btn btn-sm btn-ghost" type="submit" name="action" value="close" formnovalidate><i class="fa-solid fa-box-archive"></i> <?= e(t('admin.close')) ?></button>
        </div>
    </form>
</div>
