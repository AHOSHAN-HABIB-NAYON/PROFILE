<?php /** @var array $cats @var string $cat @var array $p */ ?>
<div class="page-head"><h1><?= e(t('news.title')) ?></h1><p><?= e(t('news.sub')) ?></p></div>
<nav class="chips" aria-label="<?= e(t('search.categories')) ?>">
    <a class="chip<?= $cat === '' ? ' active' : '' ?>" href="<?= e(url('/news')) ?>"><?= e(t('common.all')) ?></a>
    <?php foreach ($cats as $c): ?>
        <a class="chip<?= $cat === $c['slug'] ? ' active' : '' ?>" href="<?= e(url('/news?cat=' . $c['slug'])) ?>"><?= e(tr($c, 'name')) ?></a>
    <?php endforeach; ?>
</nav>
<?php if (!$p['rows']): ?>
    <div class="empty"><i class="fa-regular fa-newspaper"></i><?= e(t('news.none')) ?></div>
<?php endif; ?>
<div class="news-list">
    <?php foreach ($p['rows'] as $n): ?>
        <a class="news-item card card-link" href="<?= e(url('/news/' . $n['id'])) ?>">
            <span class="news-thumb">
                <?php if ($n['featured_image']): ?><img src="<?= e(upload_url($n['featured_image'])) ?>" alt="" loading="lazy" width="96" height="72">
                <?php else: ?><span class="news-emoji"><?= e($n['icon'] ?: '📰') ?></span><?php endif; ?>
            </span>
            <span class="grow" style="min-width:0">
                <strong class="clamp-2"><?= e(trim(($n['featured_image'] && $n['icon'] ? $n['icon'] . ' ' : '') . $n['title'])) ?></strong>
                <span class="news-meta"><i class="fa-regular fa-clock"></i> <?= e(time_ago($n['published_at'])) ?>
                    <?php if ($n['cat_name']): ?> · <?= e(tr($n, 'cat_name')) ?><?php endif; ?> · <i class="fa-regular fa-eye"></i> <?= num($n['views']) ?></span>
            </span>
        </a>
    <?php endforeach; ?>
</div>
<?= paginate_links($p, '/news' . ($cat ? '?cat=' . rawurlencode($cat) : '')) ?>
