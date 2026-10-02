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
$related = rows("SELECT id, title_en, title_bn, emoji, icon, publish_at FROM news WHERE status = 'published' AND publish_at <= NOW() AND id <> ? AND category_id <=> ? ORDER BY publish_at DESC LIMIT 4", [$n['id'], $n['category_id']]);
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
.article{max-width:760px;margin:0 auto}
.article h1{font-size:clamp(1.35rem,1.1rem + 1.4vw,2rem);margin:10px 0 12px}
.art-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;color:var(--muted);font-size:.8rem;margin-bottom:16px}
.art-cover{border-radius:var(--radius);overflow:hidden;margin:0 0 18px;background:var(--soft)}
.art-cover img{width:100%;height:auto}
.art-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 0;padding:10px;border-radius:16px;background:var(--card);border:1px solid var(--border);position:sticky;bottom:calc(var(--bottom-h) + var(--safe-b) + 8px);z-index:5}
@media (min-width:1024px){.art-bar{bottom:16px}}
.reacts{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.react{display:inline-flex;align-items:center;gap:4px;height:36px;padding:0 10px;border-radius:999px;border:1px solid transparent;background:var(--soft);cursor:pointer;font-size:.95rem;transition:transform .15s,background .15s}
.react b{font-size:.75rem;font-weight:600;color:var(--muted)}
.react:active{transform:scale(.9)}.react.active{background:var(--primary-soft);border-color:var(--primary)}.react.active b{color:var(--primary)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
</style>
<div class="page" data-page="news-details">
<article class="article">
  <nav class="crumbs" aria-label="breadcrumb"><a href="<?= e(url('/')) ?>"><?= e(t('nav.home')) ?></a><i class="fa-solid fa-chevron-right tiny"></i><a href="<?= e(url('/news')) ?>"><?= e(t('news.title')) ?></a>
    <?php if ($n['cat_slug']): ?><i class="fa-solid fa-chevron-right tiny"></i><a href="<?= e(url('/news?category=' . $n['cat_slug'])) ?>"><?= e($catName) ?></a><?php endif ?></nav>
  <?php if ($n['status'] !== 'published'): ?><div class="alert warning mb-1"><i class="fa-solid fa-eye-slash"></i><?= e(t('news.draft_preview')) ?></div><?php endif ?>
  <header>
    <?php if ($n['is_featured']): ?><span class="badge"><i class="fa-solid fa-fire"></i><?= e(t('news.featured')) ?></span><?php endif ?>
    <h1><?php if ($n['emoji']): ?><?= e($n['emoji']) ?> <?php endif ?><?= e($title) ?></h1>
    <div class="art-meta">
      <span><i class="fa-regular fa-user"></i> <?= e($n['author'] ?: setting('site_name')) ?></span>
      <time datetime="<?= e(date('c', strtotime($n['publish_at']))) ?>"><i class="fa-regular fa-calendar"></i> <?= e(fmt_date($n['publish_at'], true)) ?></time>
      <span><i class="fa-regular fa-clock"></i> <?= e(t('news.read_time', ['n' => num(max(1, (int)ceil($words / 200)))])) ?></span>
      <span><i class="fa-regular fa-eye"></i> <?= e(num((int)$n['views'])) ?></span>
    </div>
  </header>
  <?php if ($n['image']): ?><figure class="art-cover"><?= img_tag($n['image'], $title, ['sizes' => '(max-width: 800px) 100vw, 760px', 'loading' => 'eager', 'fetchpriority' => 'high']) ?></figure><?php endif ?>
  <div class="rt"><?= sanitize_html($content) ?></div>
  <?php if ($tags): ?><div class="tags"><?php foreach ($tags as $tg): ?><a class="chip" href="<?= e(url('/news?tag=' . rawurlencode($tg))) ?>">#<?= e($tg) ?></a><?php endforeach ?></div><?php endif ?>

  <div class="art-bar" data-reactions>
    <div class="reacts" role="group" aria-label="<?= e(t('news.react')) ?>">
      <?php foreach ($reactions as $k => $emo): ?>
        <button class="react <?= $mine === $k ? 'active' : '' ?>" data-action="react" data-news="<?= (int)$n['id'] ?>" data-reaction="<?= $k ?>" aria-label="<?= e($k) ?>"><?= $emo ?><b><?= (int)($counts[$k] ?? 0) ?></b></button>
      <?php endforeach ?>
    </div>
    <button class="btn btn-sm" data-action="share" data-url="<?= e($url) ?>" data-title="<?= e($title) ?>"><i class="fa-solid fa-share-nodes"></i><?= e(t('common.share')) ?></button>
  </div>

  <?php if ($related): ?>
  <section aria-labelledby="h-related">
    <div class="section-head"><h2 id="h-related"><?= e(t('news.related')) ?></h2></div>
    <div class="list">
      <?php foreach ($related as $r): ?>
        <a class="list-row" href="<?= e(url('/news/' . $r['id'])) ?>"><span class="icon-box sm"><?= $r['emoji'] ? e($r['emoji']) : '<i class="' . e(fa($r['icon'], 'fa-regular fa-newspaper')) . '"></i>' ?></span>
          <span class="grow"><strong class="truncate" style="display:block;font-size:.9rem"><?= e(loc($r, 'title')) ?></strong><span class="tiny muted"><?= e(time_ago($r['publish_at'])) ?></span></span><i class="fa-solid fa-chevron-right chev"></i></a>
      <?php endforeach ?>
    </div>
  </section>
  <?php endif ?>
</article>
</div>
