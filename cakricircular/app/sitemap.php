<?php
/* ================= XML Sitemap ================= */
header('Content-Type: application/xml; charset=utf-8');
header('X-Robots-Tag: noindex');

$posts = all("SELECT slug, published_at, updated_at, thumb, title FROM posts WHERE status = 1 AND deleted_at IS NULL ORDER BY published_at DESC LIMIT 5000");
$cats  = categories();

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc><?= e(url()) ?></loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <?php foreach ($cats as $c): ?>
  <url>
    <loc><?= e(cat_url($c['slug'])) ?></loc>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>
  <?php endforeach; ?>
  <?php foreach (['about', 'privacy', 'notices', 'trending', 'promoted'] as $s): ?>
  <url>
    <loc><?= e(url($s)) ?></loc>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>
  <?php endforeach; ?>
  <?php foreach ($posts as $p): ?>
  <url>
    <loc><?= e(url('post/' . $p['slug'])) ?></loc>
    <lastmod><?= e(date('c', strtotime($p['updated_at'] ?: $p['published_at']))) ?></lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
    <?php if (!empty($p['thumb'])): ?>
    <image:image>
      <image:loc><?= e(img_url($p['thumb'])) ?></image:loc>
      <image:title><?= e($p['title']) ?></image:title>
    </image:image>
    <?php endif; ?>
  </url>
  <?php endforeach; ?>
</urlset>
