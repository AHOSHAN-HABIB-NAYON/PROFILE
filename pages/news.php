<?php
/** News feed: featured post, category filter, "load more" pagination. */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';

$cats = rows('SELECT * FROM news_categories ORDER BY sort, id');
$catSlug = input('category');
$cat = $catSlug !== '' ? row('SELECT * FROM news_categories WHERE slug = ?', [$catSlug]) : null;
$where = "n.status = 'published' AND n.publish_at <= NOW()";
$p = [];
if ($cat) { $where .= ' AND n.category_id = ?'; $p[] = $cat['id']; }
$tag = mb_substr(input('tag'), 0, 40);
if ($tag !== '') { $where .= ' AND FIND_IN_SET(?, REPLACE(n.tags, ", ", ",")) > 0'; $p[] = $tag; }

$page = max(1, input_int('page', 1));
$pg = paginate((int)val("SELECT COUNT(*) FROM news n WHERE $where", $p), 10, $page);
$featured = ($page === 1 && !$cat && $tag === '')
    ? row("SELECT n.*, c.name_en AS cat_en, c.name_bn AS cat_bn FROM news n LEFT JOIN news_categories c ON c.id = n.category_id WHERE $where AND n.is_featured = 1 ORDER BY n.publish_at DESC LIMIT 1", $p)
    : null;
$items = rows("SELECT n.*, c.name_en AS cat_en, c.name_bn AS cat_bn, u.name AS author FROM news n LEFT JOIN news_categories c ON c.id = n.category_id LEFT JOIN users u ON u.id = n.author_id
               WHERE $where" . ($featured ? ' AND n.id <> ' . (int)$featured['id'] : '') . " ORDER BY n.publish_at DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);

$catName = fn($r) => loc(['name_en' => $r['cat_en'] ?? '', 'name_bn' => $r['cat_bn'] ?? ''], 'name');
$excerpt = fn($n) => loc($n, 'excerpt') ?: mb_substr(trim(preg_replace('~\s+~u', ' ', html_entity_decode(strip_tags(loc($n, 'content'))))), 0, 150);
meta([
    'title' => $cat ? loc($cat, 'name') . ' · ' . t('news.title') : t('news.title'),
    'description' => t('news.meta_description', ['site' => setting('site_name')]),
    'track_type' => 'news_list',
    'canonical' => '/news' . ($cat ? '?category=' . $cat['slug'] : ''),
]);
$qs = fn(int $pageNo) => '/news?' . http_build_query(array_filter(['category' => $cat['slug'] ?? null, 'tag' => $tag ?: null, 'page' => $pageNo]));
?>
<style data-css="news">
.news-feat{display:block;color:inherit;border-radius:calc(var(--radius) + 4px);overflow:hidden;background:var(--card);border:1px solid var(--border);margin-bottom:16px}
.news-feat .cover{aspect-ratio:16/8;background:linear-gradient(135deg,var(--primary),var(--secondary));display:grid;place-items:center;color:#fff;font-size:3rem;overflow:hidden}
.news-feat .cover img{width:100%;height:100%;object-fit:cover;transition:transform .5s var(--ease)}
.news-feat:hover .cover img{transform:scale(1.03)}
.news-feat .body{padding:16px 18px 18px}
.news-feat h2{font-size:clamp(1.1rem,1rem + .6vw,1.4rem);margin:8px 0 6px}
.news-items{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:760px){.news-items{grid-template-columns:1fr 1fr}}
.n-card{display:flex;gap:12px;color:inherit;padding:12px}
.n-card .thumb{width:96px;height:96px;flex:0 0 96px;border-radius:14px;overflow:hidden;background:var(--soft);display:grid;place-items:center;font-size:1.8rem;color:var(--primary)}
.n-card .thumb img{width:100%;height:100%;object-fit:cover}
.n-card h3{font-size:.95rem;margin:0 0 4px;line-height:1.45}
.n-card p{font-size:.8rem;color:var(--muted);margin:0}
.n-meta{display:flex;gap:8px;align-items:center;font-size:.74rem;color:var(--muted);margin-top:6px;flex-wrap:wrap}
</style>
<div class="page" data-page="news">
  <header class="page-head row-between" style="margin-bottom:12px">
    <div><h1 class="mb-0"><?= e(t('news.title')) ?></h1><p class="muted mb-0"><?= e(t('news.subtitle')) ?></p></div>
  </header>
  <div class="chips mb-2" role="toolbar">
    <a class="chip <?= !$cat ? 'active' : '' ?>" href="<?= e(url('/news')) ?>"><?= e(t('common.all')) ?></a>
    <?php foreach ($cats as $c): ?><a class="chip <?= $cat && $cat['id'] == $c['id'] ? 'active' : '' ?>" href="<?= e(url('/news?category=' . $c['slug'])) ?>"><i class="<?= e(fa($c['icon'], 'fa-solid fa-hashtag')) ?>"></i><?= e(loc($c, 'name')) ?></a><?php endforeach ?>
  </div>
  <?php if ($tag !== ''): ?><p class="badge mb-2">#<?= e($tag) ?></p><?php endif ?>

  <?php if ($featured): ?>
    <a class="news-feat card-link" href="<?= e(url('/news/' . $featured['id'])) ?>">
      <div class="cover"><?= $featured['image'] ? img_tag($featured['image'], loc($featured, 'title'), ['sizes' => '(max-width: 900px) 100vw, 900px']) : '<span>' . e($featured['emoji'] ?: '📰') . '</span>' ?></div>
      <div class="body">
        <span class="badge"><i class="fa-solid fa-fire"></i><?= e(t('news.featured')) ?></span>
        <h2><?= e(loc($featured, 'title')) ?></h2>
        <p class="muted small clamp-2 mb-0"><?= e($excerpt($featured)) ?></p>
        <div class="n-meta"><span><i class="fa-regular fa-clock"></i> <?= e(time_ago($featured['publish_at'])) ?></span><?php if ($featured['cat_en']): ?><span>· <?= e($catName($featured)) ?></span><?php endif ?></div>
      </div>
    </a>
  <?php endif ?>

  <?php if (!$items && !$featured): ?>
    <div class="card empty"><div class="icon-box"><i class="fa-regular fa-newspaper"></i></div><?= e(t('news.empty')) ?></div>
  <?php endif ?>
  <div class="news-items" id="news-items">
    <?php foreach ($items as $n): ?>
      <a class="card card-link n-card" href="<?= e(url('/news/' . $n['id'])) ?>">
        <span class="thumb"><?= $n['image'] ? img_tag($n['image'], '', ['width' => 96, 'height' => 96, 'sizes' => '96px']) : ($n['emoji'] ? e($n['emoji']) : '<i class="' . e(fa($n['icon'], 'fa-regular fa-newspaper')) . '"></i>') ?></span>
        <div class="grow" style="min-width:0">
          <h3 class="clamp-2"><?= e(loc($n, 'title')) ?></h3>
          <p class="clamp-2"><?= e($excerpt($n)) ?></p>
          <span class="n-meta"><span><?= e(time_ago($n['publish_at'])) ?></span><?php if ($n['cat_en']): ?><span class="badge muted"><?= e($catName($n)) ?></span><?php endif ?></span>
        </div>
      </a>
    <?php endforeach ?>
  </div>
  <?php if ($pg['page'] < $pg['pages']): ?>
    <div class="center mt-2"><button class="btn btn-soft" data-action="load-more" data-url="<?= e(url($qs($pg['page'] + 1))) ?>" data-items="#news-items" data-target="#news-items"><?= e(t('common.load_more')) ?></button></div>
    <noscript><a href="<?= e(url($qs($pg['page'] + 1))) ?>"><?= e(t('common.next')) ?></a></noscript>
  <?php endif ?>
</div>
