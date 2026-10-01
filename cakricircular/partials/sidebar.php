<?php
/* ===== সাইড ড্রয়ার (মোবাইল ও পিসি – একটাই) ===== */
css_once('sidebar', <<<CSS
.sb-mask{position:fixed;inset:0;background:rgba(3,20,12,.5);backdrop-filter:blur(2px);z-index:130;
  opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s}
.sb-mask.open{opacity:1;visibility:visible}
.sb{position:fixed;top:0;left:0;bottom:0;width:310px;max-width:86vw;z-index:131;background:var(--card);
  transform:translateX(-103%);transition:transform .32s cubic-bezier(.22,.8,.28,1);
  display:flex;flex-direction:column;box-shadow:18px 0 50px rgba(3,20,12,.2);border-radius:0 24px 24px 0;overflow:hidden}
.sb.open{transform:none}
.sb-top{position:relative;padding:calc(18px + env(safe-area-inset-top)) 16px 18px;display:flex;align-items:center;gap:11px;
  background:var(--hd-grad);color:#fff;overflow:hidden}
.sb-top::after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;right:-60px;top:-80px;
  background:radial-gradient(circle,rgba(150,235,185,.25),transparent 70%)}
.sb-top .lg{width:46px;height:46px;flex:none;border-radius:50%;background:#fff;padding:3px;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.sb-top .lg img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.sb-top b{font-size:1.08rem;line-height:1.25;display:block}
.sb-top small{display:block;font-size:.72rem;opacity:.8;font-weight:500}
.sb-close{position:relative;z-index:1;margin-left:auto;width:34px;height:34px;border-radius:11px;border:0;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center}
.sb-body{flex:1;overflow-y:auto;padding:10px 10px 18px;overscroll-behavior:contain}
.sb-lbl{font-size:.72rem;font-weight:700;color:var(--muted);padding:14px 12px 6px;letter-spacing:.2px}
.sb a.sb-i,.sb .sb-row{display:flex;align-items:center;gap:13px;padding:9px 10px;border-radius:13px;font-weight:600;
  font-size:.94rem;color:var(--ink-2);transition:.16s}
.sb a.sb-i>i,.sb .sb-row>i{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;
  background:var(--brand-l);color:var(--brand);font-size:.88rem}
.sb a.sb-i:hover{background:var(--soft)}
.sb a.sb-i.active{background:var(--brand-l);color:var(--brand-d)}
.sb a.sb-i.active>i{background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff}
.sb a.sb-i .cnt{margin-left:auto;font-size:.74rem;color:var(--muted);font-weight:600}
.sb a.sb-i.hot>i{background:#fff1e8;color:#ea580c}
.sb a.sb-i.gold>i{background:#fdf3df;color:#b7791f}
html[data-theme="dark"] .sb a.sb-i.hot>i,html[data-theme="dark"] .sb a.sb-i.gold>i{background:rgba(255,255,255,.06)}
.sb-cats{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 4px}
.sb-cats a{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:12px;background:var(--soft);
  border:1px solid var(--line-2);font-size:.82rem;font-weight:600;color:var(--ink-2);min-width:0}
.sb-cats a i{width:26px;height:26px;flex:none;border-radius:8px;display:grid;place-items:center;font-size:.72rem;color:#fff;
  background:linear-gradient(145deg,var(--t1),var(--t2))}
.sb-cats a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-cats a:hover{border-color:var(--brand)}
.sb .sb-row{cursor:pointer;margin-top:4px}
.sb .sb-row .sw{margin-left:auto}
.sw{position:relative;width:46px;height:26px;flex:none;border-radius:999px;background:var(--line);transition:.22s}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;
  box-shadow:0 2px 6px rgba(0,0,0,.2);transition:.22s}
html[data-theme="dark"] .sw{background:var(--brand)}
html[data-theme="dark"] .sw::after{transform:translateX(20px)}
.sb-social{display:flex;gap:9px;padding:6px 12px 4px;flex-wrap:wrap}
.sb-social a{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:.95rem;transition:.18s}
.sb-social a:hover{transform:translateY(-2px)}
.sb-social .fb{background:#1877f2}.sb-social .x{background:#111}.sb-social .tg{background:#29a9eb}
.sb-social .wa{background:#25d366}.sb-social .yt{background:#ff0000}
CSS);

$cats = categories();
?>
<div class="sb-mask" id="sbMask"></div>
<aside class="sb" id="sb" aria-label="মেনু" aria-hidden="true">
  <div class="sb-top">
    <span class="lg"><img src="<?= e(site_logo()) ?>" alt="" width="46" height="46"></span>
    <div style="position:relative;z-index:1;min-width:0">
      <b><?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></b>
      <small><?= e(setting('tagline', 'সঠিক তথ্য, আপনার সফলতা')) ?></small>
    </div>
    <button class="sb-close" id="sbClose" aria-label="বন্ধ করুন"><i class="fa fa-xmark"></i></button>
  </div>
  <div class="sb-body">
    <a class="sb-i" data-key="home" href="<?= e(url()) ?>"><i class="fa fa-house"></i>হোম</a>
    <a class="sb-i" data-key="categories" href="<?= e(url('categories')) ?>"><i class="fa fa-table-cells-large"></i>ক্যাটাগরি</a>
    <a class="sb-i" data-key="search" href="<?= e(url('search')) ?>"><i class="fa fa-magnifying-glass"></i>খুঁজুন</a>
    <a class="sb-i hot" data-key="trending" href="<?= e(url('trending')) ?>"><i class="fa fa-fire"></i>ট্রেন্ডিং</a>
    <a class="sb-i" data-key="notices" href="<?= e(url('notices')) ?>"><i class="fa fa-bell"></i>নোটিশ</a>
    <a class="sb-i" data-key="saved" href="<?= e(url('saved')) ?>"><i class="fa fa-bookmark"></i>সেভড জব<span class="cnt" data-saved-count></span></a>
    <a class="sb-i gold" data-key="promoted" href="<?= e(url('promoted')) ?>"><i class="fa fa-crown"></i>বিজ্ঞাপন</a>

    <?php if ($cats): ?>
    <div class="sb-lbl">ক্যাটাগরি</div>
    <div class="sb-cats">
      <?php foreach ($cats as $i => $c): ?>
        <a class="tone-<?= ($i % 6) + 1 ?>" href="<?= e(cat_url($c['slug'])) ?>"><i class="fa <?= e($c['icon'] ?: 'fa-folder') ?>"></i><span><?= e($c['name']) ?></span></a>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <div class="sb-lbl">আরও</div>
    <a class="sb-i" data-key="report" href="<?= e(url('report')) ?>"><i class="fa fa-flag"></i>রিপোর্ট করুন</a>
    <a class="sb-i" href="<?= e(url('about')) ?>"><i class="fa fa-circle-info"></i>আমাদের সম্পর্কে</a>
    <a class="sb-i" href="<?= e(url('privacy')) ?>"><i class="fa fa-shield-halved"></i>গোপনীয়তা নীতি</a>
    <a class="sb-i" href="mailto:<?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?>" data-no-spa><i class="fa fa-envelope"></i>যোগাযোগ</a>
    <div class="sb-row" role="button" tabindex="0" data-theme-toggle aria-label="ডার্ক মোড চালু/বন্ধ">
      <i class="fa fa-circle-half-stroke"></i>ডার্ক মোড<span class="sw" aria-hidden="true"></span>
    </div>

    <?php
      $soc = array_filter([
        'fb' => [setting('fb'), 'fa-facebook-f', 'Facebook'],
        'x'  => [setting('twitter'), 'fa-x-twitter', 'X'],
        'yt' => [setting('youtube'), 'fa-youtube', 'YouTube'],
        'tg' => [setting('telegram'), 'fa-telegram', 'Telegram'],
        'wa' => [setting('whatsapp'), 'fa-whatsapp', 'WhatsApp'],
      ], fn($s) => !empty($s[0]));
    ?>
    <?php if ($soc): ?>
      <div class="sb-lbl">সোশ্যাল মিডিয়া</div>
      <div class="sb-social">
        <?php foreach ($soc as $k => $s): ?>
          <a class="<?= $k ?>" href="<?= e($s[0]) ?>" target="_blank" rel="noopener" aria-label="<?= e($s[2]) ?>"><i class="fa-brands <?= e($s[1]) ?>"></i></a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </div>
</aside>
