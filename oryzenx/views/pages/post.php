<?php /** @var array $post @var array $related @var string $shareUrl */
$u = rawurlencode($shareUrl); $tt = rawurlencode($post['title']);
?>
<a class="back-link" href="<?= e(url('/news')) ?>"><i class="fa-solid fa-arrow-left"></i> <?= e(t('news.title')) ?></a>
<article class="article card">
    <?php if ($post['featured_image']): ?>
        <img class="article-cover" src="<?= e(upload_url($post['featured_image'])) ?>" alt="" width="1200" height="630">
    <?php endif; ?>
    <div class="article-body">
        <?php if ($post['status'] !== 'published'): ?><div class="alert alert-warning"><?= e(t('news.draft_preview')) ?></div><?php endif; ?>
        <h1 class="article-title"><?= e(trim(($post['icon'] ? $post['icon'] . ' ' : '') . $post['title'])) ?></h1>
        <div class="news-meta mb-2">
            <span><i class="fa-regular fa-clock"></i> <time datetime="<?= e(date('c', strtotime((string)$post['published_at']))) ?>"><?= e(time_ago($post['published_at'])) ?></time></span>
            <?php if ($post['cat_name']): ?><a href="<?= e(url('/news?cat=' . $post['cat_slug'])) ?>"><i class="fa-regular fa-folder"></i> <?= e(tr($post, 'cat_name')) ?></a><?php endif; ?>
            <span><i class="fa-regular fa-eye"></i> <?= num($post['views']) ?></span>
        </div>
        <div class="prose"><?= emoji_fx((string)$post['content']) ?></div>
        <?php if ($post['tags']): ?>
            <div class="row-gap mt-2"><?php foreach (array_filter(array_map('trim', explode(',', $post['tags']))) as $tag): ?><a class="badge badge-primary" href="<?= e(url('/search?q=' . rawurlencode($tag))) ?>">#<?= e($tag) ?></a><?php endforeach; ?></div>
        <?php endif; ?>
        <div class="share-bar mt-2">
            <span class="small bold"><?= e(t('news.share')) ?></span>
            <a class="share-dot" style="--c:#1877f2" href="https://www.facebook.com/sharer/sharer.php?u=<?= $u ?>" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
            <a class="share-dot" style="--c:#111" href="https://twitter.com/intent/tweet?url=<?= $u ?>&text=<?= $tt ?>" target="_blank" rel="noopener" aria-label="X"><i class="fa-brands fa-x-twitter"></i></a>
            <a class="share-dot" style="--c:#25d366" href="https://wa.me/?text=<?= $tt ?>%20<?= $u ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
            <a class="share-dot" style="--c:#229ed9" href="https://t.me/share/url?url=<?= $u ?>&text=<?= $tt ?>" target="_blank" rel="noopener" aria-label="Telegram"><i class="fa-brands fa-telegram"></i></a>
            <button class="share-dot" style="--c:#64748b" type="button" data-action="copy" data-copy="<?= e($shareUrl) ?>" aria-label="<?= e(t('news.copy')) ?>"><i class="fa-solid fa-link"></i></button>
            <button class="btn btn-sm btn-soft" type="button" data-action="share" data-share-url="<?= e($shareUrl) ?>" data-share-title="<?= e($post['title']) ?>"><i class="fa-solid fa-share-nodes"></i> <?= e(t('news.more')) ?></button>
        </div>
    </div>
</article>
<?php if ($related): ?>
<section class="section">
    <h2 class="section-title mb-1"><?= e(t('news.related')) ?></h2>
    <div class="card"><div class="list">
        <?php foreach ($related as $r): ?>
            <a class="list-item" href="<?= e(url('/news/' . $r['id'])) ?>"><span class="post-emoji"><?= e($r['icon'] ?: '📰') ?></span><span class="title truncate grow"><?= e($r['title']) ?></span><span class="meta"><?= e(time_ago($r['published_at'])) ?></span></a>
        <?php endforeach; ?>
    </div></div>
</section>
<?php endif; ?>
