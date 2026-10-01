<?php
/** Admin-editable static pages: privacy, terms, about, contact. */
$pg = db()->row('SELECT * FROM pages WHERE slug = ?', [$route['slug']]);
if (!$pg) {
    http_response_code(404);
    require __DIR__ . '/404.php';
    return;
}
View::$meta['title'] = $pg['title'];
View::$meta['description'] = mb_substr((string) $pg['content'], 0, 180);
View::$meta['back'] = true;
?>
<?php if (!$user): ?><div class="container public-page"><div class="narrow"><?php endif; ?>
<article class="card" style="padding:22px 20px">
  <h1 style="font-size:24px"><?= e($pg['title']) ?></h1>
  <p class="small muted">সর্বশেষ আপডেট: <?= e(bn_date($pg['updated_at'], false)) ?></p>
  <div class="prose"><?= nl2p($pg['content']) ?></div>
  <?php if ($pg['slug'] === 'contact'): ?>
    <div class="kv" style="margin-top:10px">
      <?php if (setting('contact_email') !== ''): ?><div><span class="k">ইমেইল</span><span class="v"><a href="mailto:<?= e(setting('contact_email')) ?>"><?= e(setting('contact_email')) ?></a></span></div><?php endif; ?>
      <?php if (setting('contact_phone') !== ''): ?><div><span class="k">ফোন</span><span class="v"><a href="tel:<?= e(setting('contact_phone')) ?>"><?= e(setting('contact_phone')) ?></a></span></div><?php endif; ?>
      <?php if (setting('contact_address') !== ''): ?><div><span class="k">ঠিকানা</span><span class="v"><?= e(setting('contact_address')) ?></span></div><?php endif; ?>
    </div>
    <a href="<?= e(url('/support')) ?>" class="btn btn-primary btn-block" style="margin-top:14px" data-link>সাপোর্ট পেজ</a>
  <?php endif; ?>
</article>
<?php if (!$user): ?></div></div><?php endif; ?>
