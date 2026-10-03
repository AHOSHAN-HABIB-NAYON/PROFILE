<?php
/** Single news article with reactions, share and related posts. */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';
require_once ROOT . '/core/analytics.php';

$n = row("SELECT n.*, c.name_en AS cat_en, c.name_bn AS cat_bn, c.slug AS cat_slug, u.name AS author FROM news n
          LEFT JOIN news_categories c ON c.id = n.category_id LEFT JOIN users u ON u.id = n.author_id
          WHERE n.id = ? AND ((n.status = 'published' AND n.publish_at <= NOW()) OR ? = 1)", [(int)$params['id'], can('news') ? 1 : 0]);
if (!$n) abort(404);
$title = loc($n, 'title');
$content = loc($n, 'content');
$catName = loc(['name_en' => $n['cat_en'], 'name_bn' => $n['cat_bn']], 'name');
$tags = array_filter(array_map('trim', explode(',', (string)$n['tags'])));
$reactions = ['like' => '👍', 'love' => '❤️', 'fire' => '🔥', 'wow' => '😮', 'sad' => '😢'];
$counts = array_column(rows('SELECT reaction, COUNT(*) c FROM news_reactions WHERE news_id = ? GROUP BY reaction', [$n['id']]), 'c', 'reaction');
$mine = val('SELECT reaction FROM news_reactions WHERE news_id = ? AND visitor_hash = ?', [$n['id'], visitor_hash()]);
$related = rows("SELECT id, title_en, title_bn, emoji, icon, image, publish_at FROM news WHERE status = 'published' AND publish_at <= NOW() AND id <> ? ORDER BY (category_id <=> ?) DESC, publish_at DESC LIMIT 4", [$n['id'], $n['category_id']]);
$words = max(1, count(preg_split('~\s+~u', trim(strip_tags($content)))));
$url = abs_url('/news/' . $n['id']);

meta([
    'title' => $n['seo_title'] ?: $title,
    'description' => $n['seo_description'] ?: (loc($n, 'excerpt') ?: mb_substr(trim(preg_replace('~\s+~u', ' ', html_entity_decode(strip_tags($content)))), 0, 160)),
    'keywords' => $n['seo_keywords'] ?: implode(', ', $tags),
    'image' => $n['image'] ?: null,
    'og_type' => 'article',
    'track_type' => 'news',
    'track_ref' => $n['id'],
    'canonical' => '/news/' . $n['id'],
    'robots' => $n['status'] !== 'published' ? 'noindex' : null,
    'schema' => [
        ['@context' => 'https://schema.org', '@type' => 'NewsArticle', 'headline' => mb_substr($title, 0, 110), 'datePublished' => date('c', strtotime($n['publish_at'])),
            'dateModified' => date('c', strtotime($n['updated_at'] ?: $n['publish_at'])), 'mainEntityOfPage' => $url, 'inLanguage' => lang(),
            'image' => [abs_url($n['image'] ?: (setting('og_image') ?: '/assets/icons/og-default.png'))],
            'author' => ['@type' => 'Person', 'name' => $n['author'] ?: setting('site_name')],
            'publisher' => ['@type' => 'Organization', 'name' => setting('site_name'), 'logo' => ['@type' => 'ImageObject', 'url' => abs_url(setting('logo') ?: '/assets/icons/icon-512.png')]]],
        breadcrumb_schema([t('nav.home') => '/', t('news.title') => '/news', $title => '/news/' . $n['id']]),
    ],
]);
?>
<style data-css="news-details">
.article{max-width:720px;margin:0 auto}
.article .post{padding:20px 20px 16px}
.post-author{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.pa-name{display:flex;align-items:center;gap:8px;min-width:0}
.pa-name b{font-size:1rem}
.pa-sub{font-size:.8rem;color:var(--muted);margin-top:2px}
.article h1{font-size:clamp(1.3rem,1.1rem + 1.2vw,1.85rem);line-height:1.35;margin:0 0 8px;letter-spacing:-.015em}
.art-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;color:var(--muted);font-size:.8rem;margin-bottom:6px}
.art-cover{border-radius:16px;overflow:hidden;margin:12px 0 16px;background:var(--soft)}
.art-cover img{width:100%;height:auto;display:block}
.post-foot{display:flex;align-items:center;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);flex-wrap:wrap}
.post-foot .when{margin-left:auto;font-size:.78rem;color:var(--muted)}
.reacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.react{display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-size:.95rem;transition:transform .15s,background .15s}
.react b{font-size:.78rem;font-weight:700;color:var(--muted)}
.react:active{transform:scale(.9)}.react.active{background:var(--primary-soft);border-color:var(--primary)}.react.active b{color:var(--primary)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.more-grid{display:grid;gap:12px}
@media (min-width:640px){.more-grid{grid-template-columns:1fr 1fr}}
.more-card{display:flex;gap:12px;align-items:center;padding:12px;color:inherit}
.more-card .thumb{width:64px;height:64px;flex:0 0 64px;border-radius:14px;overflow:hidden;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center;font-size:1.5rem}
.more-card .thumb img{width:100%;height:100%;object-fit:cover}
.more-card b{font-size:.92rem;line-height:1.45}
</style>
<div class="page" data-page="news-details">
<article class="article">
  <nav class="crumbs" aria-label="breadcrumb"><a href="<?= e(url('/')) ?>"><?= e(t('nav.home')) ?></a><i class="fa-solid fa-chevron-right tiny"></i><a href="<?= e(url('/news')) ?>"><?= e(t('news.title')) ?></a>
    <?php if ($n['cat_slug']): ?><i class="fa-solid fa-chevron-right tiny"></i><a href="<?= e(url('/news?category=' . $n['cat_slug'])) ?>"><?= e($catName) ?></a><?php endif ?></nav>
  <?php if ($n['status'] !== 'published'): ?><div class="alert warning mb-1"><i class="fa-solid fa-eye-slash"></i><?= e(t('news.draft_preview')) ?></div><?php endif ?>
  <div class="card post">
    <?php $pa = ['time' => $n['publish_at'], 'cat' => $n['cat_en'] ? $catName : '']; include ROOT . '/includes/post-author.php'; ?>
    <header>
      <h1><?php if ($n['emoji']): ?><?= e($n['emoji']) ?> <?php endif ?><?= e($title) ?></h1>
      <div class="art-meta">
        <time datetime="<?= e(date('c', strtotime($n['publish_at']))) ?>"><i class="fa-regular fa-calendar"></i> <?= e(fmt_date($n['publish_at'], true)) ?></time>
        <span><i class="fa-regular fa-clock"></i> <?= e(t('news.read_time', ['n' => num(max(1, (int)ceil($words / 200)))])) ?></span>
        <span><i class="fa-regular fa-eye"></i> <?= e(num((int)$n['views'])) ?></span>
      </div>
      <?php if ($coins = coin_symbols($title . ' ' . $content)): ?><div class="coin-row"><?php foreach ($coins as $cs): ?><?= coin_chip($cs) ?><?php endforeach ?></div><?php endif ?>
    </header>
    <?php if ($n['image']): ?><figure class="art-cover"><?= img_tag($n['image'], $title, ['sizes' => '(max-width: 760px) 100vw, 720px', 'loading' => 'eager', 'fetchpriority' => 'high']) ?></figure><?php endif ?>
    <div class="rt"><?= render_rich($content) ?></div>
    <?php if ($tags): ?><div class="tags"><?php foreach ($tags as $tg): ?><a class="chip" href="<?= e(url('/news?tag=' . rawurlencode($tg))) ?>">#<?= e($tg) ?></a><?php endforeach ?></div><?php endif ?>
    <div data-reactions>
      <div class="post-foot">
        <button class="pill-btn like <?= $mine === 'love' ? 'active' : '' ?>" data-action="react" data-news="<?= (int)$n['id'] ?>" data-reaction="love" aria-label="<?= e(t('news.like')) ?>"><i class="fa-regular fa-heart"></i><b><?= (int)($counts['love'] ?? 0) ?></b></button>
        <button class="pill-btn" data-action="share" data-url="<?= e($url) ?>" data-title="<?= e($title) ?>"><i class="fa-solid fa-share-nodes"></i><?= e(t('common.share')) ?></button>
        <span class="when"><?= e(time_ago($n['publish_at'])) ?></span>
      </div>
      <div class="reacts" role="group" aria-label="<?= e(t('news.react')) ?>">
        <?php foreach ($reactions as $k => $emo): if ($k === 'love') continue; ?>
          <button class="react <?= $mine === $k ? 'active' : '' ?>" data-action="react" data-news="<?= (int)$n['id'] ?>" data-reaction="<?= $k ?>" aria-label="<?= e($k) ?>"><?= $emo ?><b><?= (int)($counts[$k] ?? 0) ?></b></button>
        <?php endforeach ?>
      </div>
    </div>
  </div>

  <?php if ($related): ?>
  <section aria-labelledby="h-related" class="mt-3">
    <div class="section-head"><h2 id="h-related"><?= e(t('news.more_posts')) ?></h2><a class="small" style="font-weight:700" href="<?= e(url('/news')) ?>"><?= e(t('common.view_all')) ?> <i class="fa-solid fa-arrow-right"></i></a></div>
    <div class="more-grid">
      <?php foreach ($related as $r): ?>
        <a class="card card-link more-card" href="<?= e(url('/news/' . $r['id'])) ?>">
          <span class="thumb"><?= $r['image'] ? img_tag($r['image'], '', ['width' => 64, 'height' => 64, 'sizes' => '64px']) : ($r['emoji'] ? e($r['emoji']) : '<i class="' . e(fa($r['icon'], 'fa-regular fa-newspaper')) . '"></i>') ?></span>
          <span class="grow" style="min-width:0"><b class="clamp-2"><?= e(loc($r, 'title')) ?></b><span class="tiny muted" style="display:block;margin-top:4px"><?= e(time_ago($r['publish_at'])) ?></span></span>
        </a>
      <?php endforeach ?>
    </div>
  </section>
  <?php endif ?>
</article>
</div>
