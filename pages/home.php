<?php
/** Home / landing page — every section is admin-controlled (Settings → Home). */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';

meta([
    'title' => setting_l('seo.meta_title') ?: null,
    'description' => default_description(),
    'track_type' => 'home',
    'schema' => [['@context' => 'https://schema.org', '@type' => 'WebSite', 'name' => setting('site_name'), 'url' => BASE_URL . '/', 'inLanguage' => lang()]],
]);

$sections = array_values(array_filter(array_map('trim', explode(',', (string)setting('home.sections')))));
$cats = rows('SELECT c.*, (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id AND s.status = 1) AS cnt FROM service_categories c WHERE c.status = 1 ORDER BY c.sort, c.id');
$featured = rows('SELECT s.*, c.name_en AS cat_en, c.name_bn AS cat_bn FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.status = 1 AND s.is_featured = 1 ORDER BY s.sort, s.id LIMIT 8');
$news = rows("SELECT n.id, n.title_en, n.title_bn, n.icon, n.emoji, n.publish_at, c.name_en AS cat_en, c.name_bn AS cat_bn FROM news n LEFT JOIN news_categories c ON c.id = n.category_id
              WHERE n.status = 'published' AND n.publish_at <= NOW() ORDER BY n.publish_at DESC LIMIT " . max(1, min(12, (int)setting('home.latest_count', 5))));
$split = fn(string $key) => array_map(fn($l) => array_map('trim', explode('|', $l)), lines((string)setting($key)));
$L = lang() === 'bn' ? 1 : 0;
?>
<style data-css="home">
.hero.hero-navy{padding:30px 22px 26px}
.hero h1{font-size:clamp(1.6rem,1.15rem + 2.3vw,2.7rem);max-width:720px;margin:12px 0 .4em;line-height:1.2;letter-spacing:-.02em}
.hero h1 .grad{background:linear-gradient(90deg,#a5b4ff,#ffd27a);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{max-width:620px;font-size:clamp(.94rem,.9rem + .25vw,1.06rem)}
.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.hero-tech{display:flex;gap:16px;margin-top:24px;font-size:1.25rem;flex-wrap:wrap;opacity:.7}
.hero-dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.14) 1px,transparent 1px);background-size:20px 20px;mask-image:radial-gradient(circle at 85% 15%,#000,transparent 65%);pointer-events:none}
@media (min-width:900px){.hero.hero-navy{padding:52px 46px}}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media (min-width:720px){.stats{grid-template-columns:repeat(4,1fr)}}
.cat-tile{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:14px}
.cat-tile strong{font-size:.9rem;line-height:1.35}.cat-tile small{color:var(--muted);font-size:.74rem}
.hscroll{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(240px,78%);gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.hscroll::-webkit-scrollbar{display:none}.hscroll>*{scroll-snap-align:start}
@media (min-width:720px){.hscroll{grid-auto-flow:row;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));overflow:visible}}
.svc-card{display:flex;flex-direction:column;gap:10px;height:100%}
.svc-card h3{margin:0;font-size:.98rem}.svc-card p{margin:0;color:var(--muted);font-size:.84rem}
.svc-price{margin-top:auto;display:flex;align-items:center;justify-content:space-between;font-size:.84rem}
.svc-price b{color:var(--primary);font-size:1rem}
.news-row .nr-icon{width:36px;height:36px;flex:0 0 36px;border-radius:11px;display:grid;place-items:center;background:var(--soft);font-size:1rem}
.news-row strong{font-weight:600;font-size:.9rem}
.slider{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none;padding:2px 2px 8px;-webkit-overflow-scrolling:touch;mask-image:linear-gradient(90deg,#000 85%,transparent)}
.slider::-webkit-scrollbar{display:none}
.slide{scroll-snap-align:start;flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:16px;background:var(--card);border:1px solid var(--border);color:var(--text);font-weight:600;font-size:.88rem;transition:transform .2s var(--ease),border-color .2s}
.slide:hover{transform:translateY(-2px);border-color:var(--primary)}
.why-item p{margin:6px 0 0;color:var(--muted);font-size:.85rem}
.about{display:grid;gap:18px;align-items:center}
.about img{border-radius:var(--radius);width:100%;object-fit:cover;aspect-ratio:16/10}
@media (min-width:820px){.about{grid-template-columns:1.2fr 1fr}}
.cta.hero-navy{padding:28px 22px}
.contact-strip{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
</style>
<div class="page" data-page="home">
<?php foreach ($sections as $sec): switch ($sec):
case 'hero': ?>
  <section class="hero hero-navy section" aria-labelledby="hero-title">
    <span class="hero-dots" aria-hidden="true"></span><i class="fa-solid fa-code wm" aria-hidden="true"></i>
    <span class="kicker"><i class="fa-solid fa-bolt"></i><?= e(setting_l('home.hero_badge')) ?></span>
    <?php $title = setting_l('home.hero_title'); $parts = preg_split('~(?<=[.।!?])\s+~u', $title, 2); ?>
    <h1 id="hero-title"><?= e($parts[0]) ?><?php if (isset($parts[1])): ?> <span class="grad"><?= e($parts[1]) ?></span><?php endif ?></h1>
    <p><?= e(setting_l('home.hero_subtitle')) ?></p>
    <div class="hero-actions">
      <a class="btn btn-lg btn-white" href="<?= e(url(setting('home.btn1_link') ?: '/services')) ?>"><i class="fa-solid fa-layer-group"></i><?= e(setting_l('home.btn1')) ?></a>
      <a class="btn btn-lg btn-glass" href="<?= e(url(setting('home.btn2_link') ?: '/contact')) ?>"><i class="fa-regular fa-comments"></i><?= e(setting_l('home.btn2')) ?></a>
    </div>
    <div class="hero-tech" aria-hidden="true"><i class="fa-brands fa-node-js"></i><i class="fa-brands fa-react"></i><i class="fa-brands fa-php"></i><i class="fa-solid fa-database"></i><i class="fa-brands fa-js"></i><i class="fa-brands fa-html5"></i><i class="fa-brands fa-css3-alt"></i><i class="fa-solid fa-robot"></i></div>
  </section>
<?php break; case 'stats': $stats = $split('home.stats'); if (!$stats) break; ?>
  <section class="section stats" aria-label="<?= e(t('home.stats')) ?>">
    <?php foreach ($stats as $i => $s): ?>
      <div class="card stat-tile"><span class="lbl"><?= e($s[1 + $L] ?? $s[1] ?? '') ?></span><span class="val"><?= e(lang() === 'bn' ? bn_digits($s[0]) : $s[0]) ?></span><i class="<?= e(fa($s[3] ?? '', 'fa-solid fa-star')) ?> ic"></i></div>
    <?php endforeach ?>
  </section>
<?php break; case 'categories': if (!$cats) break; ?>
  <section class="section" aria-labelledby="h-cats">
    <div class="section-head"><h2 id="h-cats"><?= e(t('home.what_we_do')) ?></h2><a href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="grid" style="--min:140px">
      <?php foreach ($cats as $i => $c): ?>
        <a class="card card-link cat-tile" href="<?= e(url('/services?category=' . $c['slug'])) ?>">
          <span class="icon-box <?= ['', 'secondary', 'accent', 'success', 'warning'][$i % 5] ?>"><i class="<?= e(fa($c['icon'], 'fa-solid fa-folder')) ?>"></i></span>
          <span><strong><?= e(loc($c, 'name')) ?></strong><br><small><?= e(t('home.n_services', ['n' => num((int)$c['cnt'])])) ?></small></span>
        </a>
      <?php endforeach ?>
    </div>
  </section>
<?php break; case 'featured': if (!$featured) break; ?>
  <section class="section" aria-labelledby="h-feat">
    <div class="section-head"><h2 id="h-feat"><?= e(t('home.featured')) ?></h2><a href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <div class="hscroll">
      <?php foreach ($featured as $s): ?>
        <a class="card card-link svc-card" href="<?= e(url('/services/' . $s['slug'])) ?>">
          <div class="row"><span class="icon-box"><?php if ($s['icon_image']): ?><img src="<?= e(media_url($s['icon_image'])) ?>" alt="" loading="lazy" width="26" height="26"><?php else: ?><i class="<?= e(fa($s['icon'], 'fa-solid fa-code')) ?>"></i><?php endif ?></span>
            <span class="badge muted"><?= e(loc(['name_en' => $s['cat_en'], 'name_bn' => $s['cat_bn']], 'name')) ?></span></div>
          <h3><?= e(loc($s, 'title')) ?></h3>
          <p class="clamp-2"><?= e(loc($s, 'short')) ?></p>
          <div class="svc-price"><span class="muted"><?= e(t('services.starting')) ?></span><b><?= $s['price_from'] !== null ? e(money($s['price_from'])) : e(t('services.custom_quote')) ?></b></div>
        </a>
      <?php endforeach ?>
    </div>
  </section>
<?php break; case 'news': ?>
  <section class="section" aria-labelledby="h-news">
    <div class="section-head"><h2 id="h-news"><?= e(t('home.latest_news')) ?></h2><a href="<?= e(url('/news')) ?>"><?= e(t('common.view_all')) ?></a></div>
    <?php if ($news): ?>
    <div class="list flat">
      <?php foreach ($news as $n): ?>
        <a class="list-row news-row" href="<?= e(url('/news/' . $n['id'])) ?>">
          <span class="nr-icon"><?php if ($n['emoji']): ?><?= e($n['emoji']) ?><?php else: ?><i class="<?= e(fa($n['icon'], 'fa-regular fa-newspaper')) ?>" style="color:var(--primary)"></i><?php endif ?></span>
          <span class="grow"><strong class="truncate" style="display:block"><?= e(loc($n, 'title')) ?></strong>
            <span class="tiny muted"><?= e(time_ago($n['publish_at'])) ?><?php if ($n['cat_en']): ?> · <?= e(loc(['name_en' => $n['cat_en'], 'name_bn' => $n['cat_bn']], 'name')) ?><?php endif ?></span></span>
          <i class="fa-solid fa-chevron-right chev"></i>
        </a>
      <?php endforeach ?>
    </div>
    <?php else: ?><div class="card empty"><?= e(t('news.empty')) ?></div><?php endif ?>
  </section>
<?php break; case 'slider': $items = $split('home.slider_items'); if (!$items) break; ?>
  <section class="section" aria-labelledby="h-plat">
    <div class="section-head"><h2 id="h-plat"><?= e(t('home.platforms')) ?></h2></div>
    <div class="slider">
      <?php foreach ($items as $it): ?>
        <a class="slide" href="<?= e(url($it[2] ?? '/services')) ?>"><span class="icon-box sm"><i class="<?= e(fa($it[0] ?? '', 'fa-solid fa-code')) ?>"></i></span><?= e($it[1] ?? '') ?></a>
      <?php endforeach ?>
    </div>
  </section>
<?php break; case 'why': $why = $split('home.why_items'); if (!$why) break; ?>
  <section class="section" aria-labelledby="h-why">
    <div class="section-head"><h2 id="h-why"><?= e(setting_l('home.why_title')) ?></h2></div>
    <div class="grid" style="--min:220px">
      <?php foreach ($why as $i => $w): ?>
        <div class="card why-item"><span class="icon-box <?= ['', 'success', 'secondary', 'accent'][$i % 4] ?>"><i class="<?= e(fa($w[0] ?? '', 'fa-solid fa-check')) ?>"></i></span>
          <h3 class="mt-1 mb-0"><?= e($w[1 + $L] ?? $w[1] ?? '') ?></h3><p><?= e($w[3 + $L] ?? $w[3] ?? '') ?></p></div>
      <?php endforeach ?>
    </div>
  </section>
<?php break; case 'about': ?>
  <section class="section card card-pad-lg about" aria-labelledby="h-about">
    <div>
      <h2 id="h-about"><?= e(setting_l('home.about_title')) ?></h2>
      <p class="muted"><?= nl2br(e(setting_l('home.about_text'))) ?></p>
      <a class="btn btn-soft" href="<?= e(url('/team')) ?>"><i class="fa-solid fa-users"></i><?= e(t('home.meet_team')) ?></a>
    </div>
    <?php if (setting('home.about_image')): ?><?= img_tag(setting('home.about_image'), setting_l('home.about_title')) ?><?php endif ?>
  </section>
<?php break; case 'cta': ?>
  <section class="section cta hero-navy">
    <i class="fa-solid fa-rocket wm" aria-hidden="true"></i>
    <h2><?= e(setting_l('home.cta_title')) ?></h2>
    <p><?= e(setting_l('home.cta_text')) ?></p>
    <a class="btn btn-lg btn-white" href="<?= e(url(setting('home.cta_link') ?: '/contact')) ?>"><?= e(setting_l('home.cta_btn')) ?> <i class="fa-solid fa-arrow-right"></i></a>
  </section>
<?php break; case 'contact': ?>
  <section class="section contact-strip" aria-label="<?= e(t('contact.title')) ?>">
    <?php if (setting('contact.whatsapp')): ?>
      <a class="card card-link row" href="https://wa.me/<?= e(preg_replace('~\D~', '', (string)setting('contact.whatsapp'))) ?>" target="_blank" rel="noopener"><span class="icon-box success"><i class="fa-brands fa-whatsapp"></i></span><span><strong>WhatsApp</strong><br><span class="tiny muted"><?= e(t('contact.chat_now')) ?></span></span></a>
    <?php endif ?>
    <?php if (setting('contact.email')): ?>
      <a class="card card-link row" href="mailto:<?= e(setting('contact.email')) ?>"><span class="icon-box"><i class="fa-regular fa-envelope"></i></span><span class="grow" style="min-width:0"><strong><?= e(t('form.email')) ?></strong><br><span class="tiny muted truncate" style="display:block"><?= e(setting('contact.email')) ?></span></span></a>
    <?php endif ?>
    <a class="card card-link row" href="<?= e(url('/contact')) ?>"><span class="icon-box secondary"><i class="fa-solid fa-headset"></i></span><span><strong><?= e(t('footer.support')) ?></strong><br><span class="tiny muted"><?= e(t('contact.we_reply')) ?></span></span></a>
  </section>
<?php break; endswitch; endforeach ?>
</div>
