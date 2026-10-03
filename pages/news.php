<?php
/** News feed: featured post, category filter, "load more" pagination. */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';
require_once ROOT . '/core/analytics.php';

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
$items = rows("SELECT n.*, c.name_en AS cat_en, c.name_bn AS cat_bn, u.name AS author FROM news n LEFT JOIN news_categories c ON c.id = n.category_id LEFT JOIN users u ON u.id = n.author_id
               WHERE $where ORDER BY n.is_featured DESC, n.publish_at DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
if ($page > 1) {
    // featured posts are pinned to page 1 only; later pages are plain chronological
    $items = rows("SELECT n.*, c.name_en AS cat_en, c.name_bn AS cat_bn FROM news n LEFT JOIN news_categories c ON c.id = n.category_id
                   WHERE $where ORDER BY n.publish_at DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
}
$ids = array_column($items, 'id') ?: [0];
$in = implode(',', array_map('intval', $ids));
$loves = array_column(rows("SELECT news_id, COUNT(*) c FROM news_reactions WHERE news_id IN ($in) GROUP BY news_id"), 'c', 'news_id');
$mine = array_column(rows("SELECT news_id, reaction FROM news_reactions WHERE news_id IN ($in) AND visitor_hash = ?", [visitor_hash()]), 'reaction', 'news_id');

$catName = fn($r) => loc(['name_en' => $r['cat_en'] ?? '', 'name_bn' => $r['cat_bn'] ?? ''], 'name');
meta([
    'title' => $cat ? loc($cat, 'name') . ' · ' . t('news.title') : t('news.title'),
    'description' => t('news.meta_description', ['site' => setting('site_name')]),
    'track_type' => 'news_list',
    'canonical' => '/news' . ($cat ? '?category=' . $cat['slug'] : ''),
]);
$qs = fn(int $pageNo) => '/news?' . http_build_query(array_filter(['category' => $cat['slug'] ?? null, 'tag' => $tag ?: null, 'page' => $pageNo]));
?>
<style data-css="news">
.feed{max-width:720px;margin:0 auto;display:grid;gap:16px}
.post{padding:18px 18px 14px}
.post-author{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.pa-name{display:flex;align-items:center;gap:8px;min-width:0}
.pa-name b{font-size:1rem}
.pa-sub{font-size:.8rem;color:var(--muted);margin-top:2px}
.post-title{font-size:clamp(1.15rem,1.05rem + .5vw,1.4rem);line-height:1.4;margin:0 0 6px;letter-spacing:-.01em}
.post-title a{color:var(--text)}
.post-cover{display:block;border-radius:16px;overflow:hidden;margin:10px 0 12px;background:var(--soft)}
.post-cover img{width:100%;height:auto;display:block}
.post-body{position:relative;max-height:13.5em;overflow:hidden;font-size:.98rem}
.post-body.short{max-height:none}
.post-body:not(.short)::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4.5em;background:linear-gradient(transparent,var(--card))}
.read-more{display:inline-flex;align-items:center;gap:6px;font-weight:800;margin-top:6px}
.post-foot{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.post-foot .when{margin-left:auto;font-size:.78rem;color:var(--muted);text-align:right}
.post.pinned{border-color:color-mix(in srgb,var(--primary) 35%,var(--border))}
.pin-tag{font-size:.72rem;font-weight:800;color:var(--primary);display:inline-flex;gap:6px;align-items:center;margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em}
</style>
<div class="page" data-page="news">
  <div class="feed">
  <header class="page-head" style="margin-bottom:0">
    <h1 class="mb-0"><?= e(t('news.title')) ?></h1><p class="muted mb-0"><?= e(t('news.subtitle')) ?></p>
  </header>
  <div class="chips" role="toolbar">
    <a class="chip <?= !$cat ? 'active' : '' ?>" href="<?= e(url('/news')) ?>"><?= e(t('common.all')) ?></a>
    <?php foreach ($cats as $c): ?><a class="chip <?= $cat && $cat['id'] == $c['id'] ? 'active' : '' ?>" href="<?= e(url('/news?category=' . $c['slug'])) ?>"><i class="<?= e(fa($c['icon'], 'fa-solid fa-hashtag')) ?>"></i><?= e(loc($c, 'name')) ?></a><?php endforeach ?>
  </div>
  <?php if ($tag !== ''): ?><p class="badge">#<?= e($tag) ?></p><?php endif ?>

  <?php if (!$items): ?>
    <div class="card empty"><div class="icon-box"><i class="fa-regular fa-newspaper"></i></div><?= e(t('news.empty')) ?></div>
  <?php endif ?>
  <div class="feed" id="news-items">
    <?php foreach ($items as $n):
      $link = url('/news/' . $n['id']);
      $html = render_rich(loc($n, 'content'));
      $coins = coin_symbols(loc($n, 'title') . ' ' . loc($n, 'content'));
      $short = mb_strlen(strip_tags($html)) < 420 && !str_contains($html, '<img');
      $pa = ['time' => $n['publish_at'], 'cat' => $n['cat_en'] ? $catName($n) : ''];
      $liked = ($mine[$n['id']] ?? '') === 'love'; ?>
      <article class="card post <?= $n['is_featured'] && $page === 1 ? 'pinned' : '' ?>">
        <?php if ($n['is_featured'] && $page === 1): ?><div class="pin-tag"><i class="fa-solid fa-thumbtack"></i><?= e(t('news.featured')) ?></div><?php endif ?>
        <?php include ROOT . '/includes/post-author.php'; ?>
        <h2 class="post-title"><a href="<?= e($link) ?>"><?php if ($n['emoji']): ?><?= e($n['emoji']) ?> <?php endif ?><?= e(loc($n, 'title')) ?></a></h2>
        <?php if ($coins): ?><div class="coin-row"><?php foreach ($coins as $cs): ?><?= coin_chip($cs) ?><?php endforeach ?></div><?php endif ?>
        <?php if ($n['image']): ?><a class="post-cover" href="<?= e($link) ?>"><?= img_tag($n['image'], loc($n, 'title'), ['sizes' => '(max-width: 760px) 100vw, 720px']) ?></a><?php endif ?>
        <div class="rt post-body <?= $short ? 'short' : '' ?>"><?= $html ?: '<p>' . e(loc($n, 'excerpt')) . '</p>' ?></div>
        <?php if (!$short): ?><a class="read-more" href="<?= e($link) ?>"><?= e(t('news.read_more')) ?> <i class="fa-solid fa-arrow-right"></i></a><?php endif ?>
        <footer class="post-foot" data-reactions>
          <button class="pill-btn like <?= $liked ? 'active' : '' ?>" data-action="react" data-news="<?= (int)$n['id'] ?>" data-reaction="love" aria-label="<?= e(t('news.like')) ?>"><i class="fa-regular fa-heart"></i><b><?= num((int)($loves[$n['id']] ?? 0)) ?></b></button>
          <button class="pill-btn" data-action="share" data-url="<?= e(abs_url('/news/' . $n['id'])) ?>" data-title="<?= e(loc($n, 'title')) ?>"><i class="fa-solid fa-share-nodes"></i><?= e(t('common.share')) ?></button>
          <span class="when"><?= e(fmt_date($n['publish_at'])) ?></span>
        </footer>
      </article>
    <?php endforeach ?>
  </div>
  <?php if ($pg['page'] < $pg['pages']): ?>
    <div class="center"><button class="btn btn-soft" data-action="load-more" data-url="<?= e(url($qs($pg['page'] + 1))) ?>" data-items="#news-items" data-target="#news-items"><?= e(t('common.load_more')) ?></button></div>
    <noscript><a href="<?= e(url($qs($pg['page'] + 1))) ?>"><?= e(t('common.next')) ?></a></noscript>
  <?php endif ?>
  </div>
</div>
