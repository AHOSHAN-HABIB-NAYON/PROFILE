<?php
/* ===== ফুটার (লাইট / সাদা) + অ্যাপ ইনস্টল ===== */
css_once('footer', <<<CSS
.ft{color:var(--ink-2);margin-top:40px;background:var(--card);border-top:1px solid var(--line);position:relative}
.ft::before{content:"";position:absolute;left:0;right:0;top:-1px;height:3px;background:linear-gradient(90deg,var(--brand),#7fe0cf,var(--brand))}
.ft-in{max-width:var(--wrap);margin:0 auto;padding:28px 18px 4px;display:grid;gap:26px;grid-template-columns:1.6fr 1fr 1fr}
.ft-brand{display:flex;align-items:center;gap:11px;margin-bottom:11px}
.ft-brand img{width:46px;height:46px;border-radius:50%;object-fit:cover;box-shadow:0 3px 10px rgba(16,40,36,.14);background:#fff;padding:2px}
.ft-brand b{color:var(--ink);font-size:1.12rem;display:block;line-height:1.25}
.ft-brand small{display:block;font-size:.76rem;color:var(--muted);font-weight:500}
.ft p{margin:0 0 14px;font-size:.9rem;line-height:1.8;color:var(--muted)}
.ft h4{color:var(--ink);font-size:.95rem;margin:0 0 12px;font-weight:700;display:inline-flex;align-items:center;gap:9px}
.ft h4 i{width:30px;height:30px;border-radius:10px;background:var(--brand-l);color:var(--brand);
  display:inline-flex;align-items:center;justify-content:center;font-size:.82rem;flex:none}
.ft a{color:var(--ink-2);font-size:.9rem;transition:.16s}
.ft a:hover{color:var(--brand)}
.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.ft ul i{width:16px;color:var(--brand);margin-right:8px;font-size:.8rem}
.ft-soc{display:flex;gap:9px;margin-top:14px}
.ft-soc a{width:38px;height:38px;border-radius:50%;background:var(--soft);border:1px solid var(--line);
  display:grid;place-items:center;color:var(--ink-2);transition:.18s}
.ft-soc a:hover{background:var(--brand);border-color:var(--brand);color:#fff;transform:translateY(-2px)}
.ft-bot{border-top:1px solid var(--line);margin-top:24px;padding:14px 18px;text-align:center;
  font-size:.84rem;color:var(--muted);line-height:1.7}
.ft-slogan{display:block;margin-top:6px;font-size:.86rem;font-weight:700;
  background:linear-gradient(90deg,var(--brand),var(--brand-2));-webkit-background-clip:text;background-clip:text;color:transparent}

/* অ্যাপ ইনস্টল বাটন — ইনফরমেশন কলামে */
.appcard{display:none}
.appcard.show{display:block;margin-top:14px;animation:pgIn .3s ease both}
.ac-btn{display:inline-flex;align-items:center;gap:9px;flex:none;align-self:center;
  height:48px;padding:0 8px 0 11px;border:1px solid #2a3b38;border-radius:13px;cursor:pointer;
  background:linear-gradient(180deg,#232f2d,#121c1a);color:#fff;
  box-shadow:0 5px 14px rgba(9,25,22,.28);transition:transform .2s,box-shadow .2s;
  font-family:inherit;text-align:left;white-space:nowrap;overflow:hidden;position:relative;
  -webkit-text-size-adjust:100%;text-size-adjust:100%}
.ac-btn svg{width:30px;height:30px;flex:none}
.ac-btn .ac-tx{display:flex;flex-direction:column;justify-content:center;line-height:1.15;
  position:relative;z-index:1;margin-left:2px;white-space:nowrap}
.ac-btn .ac-tx small{font-size:10px;font-weight:500;opacity:.8;letter-spacing:.2px;line-height:13px;white-space:nowrap}
.ac-btn .ac-tx b{font-size:15px;font-weight:700;letter-spacing:.2px;line-height:19px;white-space:nowrap}
.ac-btn::after{content:"";position:absolute;top:0;bottom:0;width:38%;left:-50%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent);
  animation:acShine 4.5s ease-in-out infinite}
@keyframes acShine{0%,72%{left:-50%}92%,100%{left:120%}}
.ac-ico{position:relative;display:grid;place-items:center;flex:none;z-index:1}
.ac-dl{position:relative;z-index:1;flex:none;width:30px;height:30px;border-radius:50%;
  background:var(--brand);color:#fff;display:grid;place-items:center;font-size:13px;
  box-shadow:0 3px 10px rgba(15,118,110,.45)}
.ac-dl i{animation:acDl 2.4s ease-in-out infinite}
@keyframes acDl{0%,70%,100%{transform:translateY(0)}80%{transform:translateY(3px)}90%{transform:translateY(-1px)}}
@media (prefers-reduced-motion: reduce){ .ac-dl i,.ac-btn::after{animation:none} }
.ac-btn:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(9,25,22,.34)}
.ac-btn:active{transform:scale(.96)}

@media(max-width:820px){ .ft-in{grid-template-columns:1fr 1fr} .ft-in>div:first-child{grid-column:1/-1} }
@media(max-width:700px){
  .ft-in{padding:20px 14px 4px}
  .ft-bot{padding:12px 14px}
  .ft{margin-top:30px}
  .appcard{gap:10px}
}
CSS);
$appName = setting('app_name', 'Cakricircular');
?>
<footer class="ft">
  <div class="ft-in">
    <div>
      <div class="ft-brand">
        <img src="<?= e(site_logo()) ?>" alt="" width="46" height="46">
        <span>
          <b><?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></b>
          <small><?= e(setting('tagline', 'সঠিক তথ্য, আপনার সফলতা')) ?></small>
        </span>
      </div>
      <p><?= e(setting('footer_about', 'বাংলাদেশের সরকারি-বেসরকারি চাকরির সার্কুলার, ভর্তি বিজ্ঞপ্তি ও পরীক্ষার ফলাফল — প্রতিদিন হালনাগাদ, এক জায়গায়।')) ?></p>
      <h4><i class="fa fa-address-book"></i>যোগাযোগ করুন</h4>
      <ul>
        <li><i class="fa fa-envelope"></i><a href="mailto:<?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?>"><?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?></a></li>
        <li><i class="fa fa-location-dot"></i><?= e(setting('location', 'Bangladesh')) ?></li>
      </ul>
      <div class="ft-soc">
        <?php if ($u = setting('fb')): ?><a href="<?= e($u) ?>" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a><?php endif; ?>
        <?php if ($u = setting('twitter')): ?><a href="<?= e($u) ?>" target="_blank" rel="noopener" aria-label="X"><i class="fa-brands fa-x-twitter"></i></a><?php endif; ?>
        <?php if ($u = setting('telegram')): ?><a href="<?= e($u) ?>" target="_blank" rel="noopener" aria-label="Telegram"><i class="fa-brands fa-telegram"></i></a><?php endif; ?>
        <?php if ($u = setting('whatsapp')): ?><a href="<?= e($u) ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a><?php endif; ?>
      </div>
    </div>

    <div>
      <h4><i class="fa fa-link"></i>দ্রুত লিংক</h4>
      <ul>
        <li><i class="fa fa-house"></i><a href="<?= e(url()) ?>">হোম</a></li>
        <?php foreach (array_slice(categories(), 0, 6) as $c): ?>
          <li><i class="fa <?= e($c['icon'] ?: 'fa-folder') ?>"></i><a href="<?= e(cat_url($c['slug'])) ?>"><?= e($c['name']) ?></a></li>
        <?php endforeach; ?>
      </ul>
    </div>

    <div>
      <h4><i class="fa fa-circle-info"></i>ইনফরমেশন</h4>
      <ul>
        <li><i class="fa fa-circle-info"></i><a href="<?= e(url('about')) ?>">আমাদের সম্পর্কে</a></li>
        <li><i class="fa fa-shield-halved"></i><a href="<?= e(url('privacy')) ?>">গোপনীয়তা ও নিরাপত্তা</a></li>
        <li><i class="fa fa-flag"></i><a href="<?= e(url('report')) ?>">রিপোর্ট বা প্রমোশন</a></li>
        <li><i class="fa fa-bullhorn"></i><a href="<?= e(url('notices')) ?>">নোটিশ</a></li>
        <li><i class="fa fa-fire"></i><a href="<?= e(url('trending')) ?>">ট্রেন্ডিং</a></li>
      </ul>
      <div class="appcard" id="appCard" hidden>
        <button class="ac-btn" id="appInstallBtn" type="button" aria-label="<?= e($appName) ?> অ্যাপ ইনস্টল করুন">
          <span class="ac-ico">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon points="20,12 20,88 54,50" fill="#4285F4"/>
              <polygon points="20,12 62,35 54,50" fill="#34A853"/>
              <polygon points="62,35 88,50 62,65 54,50" fill="#FBBC04"/>
              <polygon points="20,88 54,50 62,65" fill="#EA4335"/>
            </svg>
          </span>
          <span class="ac-tx"><small>এখনই ইনস্টল করুন</small><b>App Install</b></span>
          <span class="ac-dl"><i class="fa fa-arrow-down"></i></span>
        </button>
      </div>
    </div>
  </div>

  <div class="ft-bot">
    <?= e(setting('copyright', '© ' . date('Y') . ' চাকরি সার্কুলার — সর্বস্বত্ব সংরক্ষিত।')) ?>
    <?php if ($sl = setting('footer_slogan', 'ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ')): ?>
      <span class="ft-slogan"><?= e($sl) ?></span>
    <?php endif; ?>
  </div>
</footer>
