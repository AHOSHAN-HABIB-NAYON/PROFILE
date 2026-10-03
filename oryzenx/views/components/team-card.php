<?php /** @var array $m */ ?>
<article class="team-card card">
    <a class="team-photo" href="<?= e(url('/team/' . $m['id'])) ?>" aria-label="<?= e($m['name']) ?>">
        <?= $m['photo'] ? '<img src="' . e(upload_url($m['photo'])) . '" alt="" loading="lazy" width="72" height="72">' : avatar_html(['name' => $m['name'], 'email' => $m['name']], 'avatar-lg') ?>
        <?php if ($m['is_vip']): ?><span class="badge badge-vip<?= $m['badge_animated'] ? ' animated' : '' ?>"><?= e($m['badge_text'] ?: 'VIP') ?></span><?php endif; ?>
    </a>
    <a href="<?= e(url('/team/' . $m['id'])) ?>" class="team-name"><?= e($m['name']) ?></a>
    <span class="team-role"><?= e(tr($m, 'role')) ?></span>
    <?php if ($m['skills']): ?>
        <div class="team-skills"><?php foreach (array_slice(array_filter(array_map('trim', explode(',', $m['skills']))), 0, 3) as $sk): ?><span class="badge"><?= e($sk) ?></span><?php endforeach; ?></div>
    <?php endif; ?>
    <div class="team-social">
        <?php if ($m['whatsapp']): ?><a href="https://wa.me/<?= e(preg_replace('/\D/', '', $m['whatsapp'])) ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a><?php endif; ?>
        <?php if ($m['email']): ?><a href="mailto:<?= e($m['email']) ?>" aria-label="Email"><i class="fa-solid fa-envelope"></i></a><?php endif; ?>
        <?php if ($m['telegram']): ?><a href="https://t.me/<?= e(ltrim($m['telegram'], '@')) ?>" target="_blank" rel="noopener" aria-label="Telegram"><i class="fa-brands fa-telegram"></i></a><?php endif; ?>
        <?php if ($m['facebook']): ?><a href="<?= e($m['facebook']) ?>" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a><?php endif; ?>
        <?php if ($m['linkedin']): ?><a href="<?= e($m['linkedin']) ?>" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a><?php endif; ?>
        <?php if ($m['github']): ?><a href="<?= e($m['github']) ?>" target="_blank" rel="noopener" aria-label="GitHub"><i class="fa-brands fa-github"></i></a><?php endif; ?>
        <?php if ($m['cv_file']): ?><a href="<?= e(upload_url($m['cv_file'])) ?>" target="_blank" rel="noopener" aria-label="CV" title="CV"><i class="fa-solid fa-file-arrow-down"></i></a><?php endif; ?>
        <a href="<?= e(url('/team/' . $m['id'])) ?>" aria-label="<?= e(t('team.profile')) ?>"><i class="fa-solid fa-user"></i></a>
    </div>
</article>
