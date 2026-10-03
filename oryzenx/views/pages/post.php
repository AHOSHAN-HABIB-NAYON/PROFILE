<?php /** @var array $post @var array $related @var string $shareUrl */
$n = $post; $full = true;
?>
<a class="back-link" href="<?= e(url('/news')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('news.title')) ?></a>
<?php if ($post['status'] !== 'published'): ?><div class="alert alert-warning"><?= e(t('news.draft_preview')) ?></div><?php endif; ?>
<div class="post-feed">
    <?php require VIEWS . '/components/post-card.php'; ?>
</div>
<?php if ($post['tags']): ?>
    <div class="row-gap mt-2"><?php foreach (array_filter(array_map('trim', explode(',', $post['tags']))) as $tag): ?><a class="badge badge-primary" href="<?= e(url('/search?q=' . rawurlencode($tag))) ?>">#<?= e($tag) ?></a><?php endforeach; ?></div>
<?php endif; ?>
<?php if ($related): ?>
<section class="section post-feed">
    <h2 class="section-title mb-1"><?= e(t('news.related')) ?></h2>
    <div class="card"><div class="list">
        <?php foreach ($related as $r): ?>
            <a class="list-item" href="<?= e(url('/news/' . $r['id'])) ?>"><span class="post-emoji"><?= e($r['icon'] ?: '📰') ?></span><span class="title truncate grow"><?= e($r['title']) ?></span><span class="meta"><?= e(time_ago($r['published_at'])) ?></span></a>
        <?php endforeach; ?>
    </div></div>
</section>
<?php endif; ?>
