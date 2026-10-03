<?php /** @var array $n post row (with liked, likes, author) @var bool $full full article mode */
$full = $full ?? false;
$href = url('/news/' . $n['id']);
$byAdmin = empty($n['author']) || ($n['author_role'] ?? 'admin') === 'admin';
$authorName = $byAdmin ? setting('site_name') . ' Admin' : $n['author'];
?>
<article class="post-card card">
    <header class="post-author">
        <?= brand_avatar() ?>
        <strong class="truncate"><?= e($authorName) ?></strong>
        <?php if ($byAdmin): ?><span class="admin-pill"><i class="fa-solid fa-circle-check"></i> Admin</span><?php endif; ?>
    </header>
    <?php if ($full): ?>
        <h1 class="post-title post-title-lg"><?= e(trim(($n['icon'] ? $n['icon'] . ' ' : '') . $n['title'])) ?></h1>
    <?php else: ?>
        <h2 class="post-title"><a href="<?= e($href) ?>"><?= e($n['title']) ?></a></h2>
    <?php endif; ?>
    <?php if ($n['featured_image']): ?>
        <a class="post-media" href="<?= e($full ? upload_url($n['featured_image']) : $href) ?>" <?= $full ? 'target="_blank" rel="noopener" data-no-spa' : '' ?>><img src="<?= e(upload_url($n['featured_image'])) ?>" alt="" loading="lazy" width="1200" height="630"></a>
    <?php endif; ?>
    <?php if ($full): ?>
        <div class="prose post-body"><?= emoji_fx((string)$n['content']) ?></div>
    <?php else: ?>
        <p class="post-excerpt"><?= emoji_fx(e(rich_preview($n['content'] ?: $n['excerpt'], 360))) ?></p>
        <a class="read-more" href="<?= e($href) ?>"><?= e(t('news.read_more')) ?> <i class="fa-solid fa-arrow-right"></i></a>
    <?php endif; ?>
    <footer class="post-actions">
        <button class="like-btn<?= !empty($n['liked']) ? ' liked' : '' ?>" type="button" data-action="like" data-id="<?= (int)$n['id'] ?>" aria-pressed="<?= !empty($n['liked']) ? 'true' : 'false' ?>" aria-label="<?= e(t('news.like')) ?>">
            <i class="fa-solid fa-heart"></i><span data-like-count><?= num((int)($n['likes'] ?? 0)) ?></span>
        </button>
        <button class="share-pill" type="button" data-action="share" data-share-url="<?= e(abs_url($href)) ?>" data-share-title="<?= e($n['title']) ?>"><i class="fa-solid fa-share-nodes"></i> <?= e(t('news.share')) ?></button>
        <span class="post-date"><?= e(time_ago($n['published_at'])) ?> · <?= e(fmt_date($n['published_at'])) ?></span>
    </footer>
</article>
