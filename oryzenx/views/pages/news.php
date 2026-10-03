<?php /** @var array $cats @var string $cat @var array $p */ ?>
<div class="page-head"><h1><?= e(t('news.title')) ?></h1><p><?= e(t('news.sub')) ?></p></div>
<nav class="chips" aria-label="<?= e(t('search.categories')) ?>">
    <a class="chip<?= $cat === '' ? ' active' : '' ?>" href="<?= e(url('/news')) ?>"><?= e(t('common.all')) ?></a>
    <?php foreach ($cats as $c): ?>
        <a class="chip<?= $cat === $c['slug'] ? ' active' : '' ?>" href="<?= e(url('/news?cat=' . $c['slug'])) ?>"><?= e(tr($c, 'name')) ?></a>
    <?php endforeach; ?>
</nav>
<?php if (!$p['rows']): ?><div class="empty card"><i class="fa-regular fa-newspaper"></i><?= e(t('news.none')) ?></div><?php endif; ?>
<div class="post-feed">
    <?php foreach ($p['rows'] as $n) require VIEWS . '/components/post-card.php'; ?>
</div>
<?= paginate_links($p, '/news' . ($cat ? '?cat=' . rawurlencode($cat) : '')) ?>
