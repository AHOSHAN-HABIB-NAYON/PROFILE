<?php
/** Site footer + closing tags and the (single, deferred) app script. */
defined('APP') || exit;
$bare = $bare ?? false;
if (!$bare):
    $socials = rows('SELECT * FROM social_links WHERE enabled = 1 AND url <> "" ORDER BY sort');
    $footServices = rows('SELECT slug, title_en, title_bn FROM services WHERE status = 1 AND is_featured = 1 ORDER BY sort, id LIMIT 6');
    $logo = setting('logo');
?>
<style>
.app-footer{padding:30px 18px calc(var(--bottom-h) + var(--safe-b) + 28px);font-size:.92rem}
.ft-wrap{max-width:1120px;margin:0 auto;border-top:1px solid var(--border);padding-top:28px}
.ft-inner{display:grid;gap:28px;grid-template-columns:1fr 1fr}
.ft-brand{grid-column:1/-1}
.ft-brand .brand{font-size:1.35rem;margin-bottom:12px}
.ft-brand .brand-logo{width:42px;height:42px;flex-basis:42px;border-radius:13px}
.ft-brand p{color:var(--muted);font-size:1rem;max-width:440px;margin:0 0 16px}
.ft-col h4{font-size:.86rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:var(--text);margin:0 0 12px}
.ft-col a{display:flex;align-items:center;gap:8px;color:var(--muted);padding:5px 0;font-weight:500}.ft-col a:hover{color:var(--primary)}
.ft-col a i{color:var(--primary);width:16px}
.ft-social{display:flex;gap:10px;flex-wrap:wrap}
.ft-social a{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--card);border:1px solid var(--border);color:var(--text);font-size:1.05rem;box-shadow:var(--shadow-sm);transition:all .2s var(--ease)}
.ft-social a:hover{background:var(--primary);border-color:var(--primary);color:#fff;transform:translateY(-2px)}
.ft-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px}
.ft-bottom{margin-top:26px;padding-top:18px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;color:var(--muted);font-size:.84rem;font-weight:500}
.ft-disclaimer{margin:14px 0 0;font-size:.76rem;color:var(--muted);line-height:1.65}
@media (min-width:760px){.ft-inner{grid-template-columns:1.6fr 1fr 1fr 1fr}.ft-brand{grid-column:auto}}
@media (min-width:1024px){.app-footer{margin-left:var(--sidebar-w);padding:34px 34px 34px}}
</style>
<?php
    $wa = preg_replace('~\D~', '', (string)setting('contact.whatsapp'));
    $mail = (string)setting('contact.email');
?>
<footer class="app-footer" role="contentinfo">
 <div class="ft-wrap">
  <div class="ft-inner">
    <div class="ft-brand">
      <a href="<?= e(url('/')) ?>" class="brand">
        <span class="brand-logo"><?php if ($logo): ?><img src="<?= e(media_url($logo)) ?>" alt="" width="42" height="42" loading="lazy"><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
        <span><?= e(setting('site_name')) ?></span>
      </a>
      <p><?= e(setting_l('site_tagline') ?: setting_l('footer_text')) ?></p>
      <div class="ft-social">
        <?php if ($wa): ?><a href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a><?php endif ?>
        <?php if ($mail): ?><a href="mailto:<?= e($mail) ?>" aria-label="Email"><i class="fa-regular fa-envelope"></i></a><?php endif ?>
        <?php foreach ($socials as $s): if ($s['platform'] === 'whatsapp' && $wa) continue; ?><a href="<?= e($s['url']) ?>" target="_blank" rel="noopener" aria-label="<?= e($s['label']) ?>"><i class="<?= e(fa($s['icon'], 'fa-solid fa-link')) ?>"></i></a><?php endforeach ?>
      </div>
      <div class="ft-tools">
        <?php if (setting_bool('pwa.enabled')): ?><button class="btn btn-sm btn-soft" data-action="install-app" data-install-link hidden><i class="fa-solid fa-download"></i><?= e(t('pwa.install')) ?></button><?php endif ?>
        <span class="seg"><?php foreach (LANGS as $code => $name): ?><button data-action="lang-set" data-lang="<?= $code ?>" class="<?= lang() === $code ? 'active' : '' ?>"><?= e($name) ?></button><?php endforeach ?></span>
        <?php if (setting_bool('theme.dark_enabled')): ?><button class="sq-btn" data-action="theme-toggle" aria-label="<?= e(t('nav.theme')) ?>"><i class="fa-regular fa-moon theme-icon"></i></button><?php endif ?>
      </div>
    </div>
    <div class="ft-col">
      <h4><?= e(t('footer.explore')) ?></h4>
      <a href="<?= e(url('/services')) ?>"><?= e(t('nav.services')) ?></a>
      <a href="<?= e(url('/news')) ?>"><?= e(t('nav.news')) ?></a>
      <a href="<?= e(url('/team')) ?>"><?= e(t('nav.team')) ?></a>
      <a href="<?= e(url('/payment')) ?>"><?= e(t('nav.orders')) ?></a>
      <a href="<?= e(url('/contact')) ?>"><?= e(t('nav.contact')) ?></a>
    </div>
    <div class="ft-col">
      <h4><?= e(t('nav.services')) ?></h4>
      <?php foreach ($footServices as $s): ?><a href="<?= e(url('/services/' . $s['slug'])) ?>"><?= e(loc($s, 'title')) ?></a><?php endforeach ?>
    </div>
    <div class="ft-col">
      <h4><?= e(t('footer.support')) ?></h4>
      <?php if ($wa): ?><a href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i><?= e(setting('contact.whatsapp')) ?></a><?php endif ?>
      <?php if ($mail): ?><a href="mailto:<?= e($mail) ?>"><i class="fa-regular fa-envelope"></i><?= e($mail) ?></a><?php endif ?>
      <?php if (setting_bool('live_chat.enabled')): ?><a href="#" data-action="chat-open" data-tab="support"><i class="fa-solid fa-headset"></i><?= e(t('chat.live_support')) ?></a><?php endif ?>
      <a href="<?= e(url('/contact')) ?>"><i class="fa-regular fa-circle-question"></i><?= e(t('contact.faq')) ?></a>
    </div>
  </div>
  <div class="ft-bottom">
    <span>© <?= num((int)date('Y')) ?> <?= e(setting('site_name')) ?>. <?= e(setting_l('copyright')) ?></span>
    <span><?= e(setting_l('contact.address')) ?></span>
  </div>
  <?php if (setting_l('disclaimer')): ?><p class="ft-disclaimer"><?= e(setting_l('disclaimer')) ?></p><?php endif ?>
 </div>
</footer>
<?php endif ?>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
<?php if (!empty($isAdmin)): ?><script src="<?= e(asset('js/admin.js')) ?>" defer></script><?php endif ?>
</body>
</html>
