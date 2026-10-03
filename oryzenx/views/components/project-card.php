<?php
/** @var array $p */
$imgs = ProjectController::images($p);
$host = $p['link'] ? preg_replace('#^www\.#', '', (string)parse_url($p['link'], PHP_URL_HOST)) : '';
$tags = array_slice(array_filter(array_map('trim', explode(',', (string)$p['tags']))), 0, 4);
?>
<article class="project-card" id="project-<?= (int)$p['id'] ?>" data-component="project-card" data-cat="<?= e(trim((string)$p['category'])) ?>">
    <div class="project-media">
        <?php if ($imgs): ?>
            <img class="project-main" src="<?= e(upload_url($imgs[0])) ?>" alt="<?= e(tr($p, 'title')) ?>" loading="lazy" decoding="async" data-full="<?= e(upload_url($imgs[0])) ?>">
        <?php else: ?>
            <div class="project-main project-ph"><i class="fa-solid fa-briefcase"></i></div>
        <?php endif; ?>
        <?php if ($p['brand']): ?><span class="project-brand"><i class="fa-solid fa-circle-check"></i><?= e($p['brand']) ?></span><?php endif; ?>
        <?php if (count($imgs) > 1): ?><span class="project-count"><i class="fa-regular fa-images"></i> <?= num(count($imgs)) ?></span><?php endif; ?>
    </div>
    <?php if (count($imgs) > 1): ?>
        <div class="project-thumbs" role="list">
            <?php foreach ($imgs as $i => $img): ?>
                <button type="button" class="project-thumb<?= $i === 0 ? ' active' : '' ?>" data-src="<?= e(upload_url($img)) ?>" aria-label="<?= e(t('projects.image', ['n' => num($i + 1)])) ?>" role="listitem"><img src="<?= e(upload_url($img)) ?>" alt="" loading="lazy" width="44" height="32"></button>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
    <div class="project-body">
        <h3 class="project-title"><?= e(tr($p, 'title')) ?></h3>
        <?php if ($d = tr($p, 'description')): ?><p class="project-desc"><?= e($d) ?></p><?php endif; ?>
        <?php if ($tags): ?><div class="project-tags"><?php foreach ($tags as $tg): ?><span><?= e($tg) ?></span><?php endforeach; ?></div><?php endif; ?>
        <div class="project-foot">
            <?php if ($host): ?><span class="project-host"><i class="fa-solid fa-globe"></i><?= e($host) ?></span><?php else: ?><span></span><?php endif; ?>
            <?php if ($p['link']): ?><a class="btn btn-xs btn-primary" href="<?= e($p['link']) ?>" target="_blank" rel="noopener" data-no-spa><?= e(t('projects.visit')) ?> <i class="fa-solid fa-arrow-up-right-from-square"></i></a><?php endif; ?>
        </div>
    </div>
</article>
