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
.app-footer{border-top:1px solid var(--border);background:var(--card);padding:32px 16px calc(var(--bottom-h) + var(--safe-b) + 24px);font-size:.88rem}
.ft-inner{max-width:1120px;margin:0 auto;display:grid;gap:26px;grid-template-columns:1fr 1fr}
.ft-brand{grid-column:1/-1}
.ft-col h4{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 10px}
.ft-col a{display:block;color:var(--text);padding:4px 0;opacity:.85}.ft-col a:hover{color:var(--primary);opacity:1}
.ft-social{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.ft-social a{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--soft);color:var(--text);transition:all .2s var(--ease)}
.ft-social a:hover{background:var(--primary);color:#fff;transform:translateY(-2px)}
.ft-bottom{max-width:1120px;margin:24px auto 0;padding-top:18px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;color:var(--muted);font-size:.8rem}
.ft-disclaimer{max-width:1120px;margin:14px auto 0;font-size:.74rem;color:var(--muted);line-height:1.6}
@media (min-width:720px){.ft-inner{grid-template-columns:2fr 1fr 1fr 1fr}.ft-brand{grid-column:auto}}
@media (min-width:1024px){.app-footer{margin-left:var(--sidebar-w);padding-bottom:32px}}
</style>
<footer class="app-footer" role="contentinfo">
  <div class="ft-inner">
    <div class="ft-brand">
      <a href="<?= e(url('/')) ?>" class="brand" style="margin-bottom:10px">
        <span class="brand-logo"><?php if ($logo): ?><img src="<?= e(media_url($logo)) ?>" alt="" width="34" height="34" loading="lazy"><?php else: ?><i class="fa-solid fa-code"></i><?php endif ?></span>
        <span><?= e(setting('site_name')) ?></span>
      </a>
      <p class="muted" style="max-width:420px"><?= e(setting_l('footer_text')) ?></p>
      <?php if ($socials): ?>
      <div class="ft-social">
        <?php foreach ($socials as $s): ?><a href="<?= e($s['url']) ?>" target="_blank" rel="noopener" aria-label="<?= e($s['label']) ?>"><i class="<?= e(fa($s['icon'], 'fa-solid fa-link')) ?>"></i></a><?php endforeach ?>
      </div>
      <?php endif ?>
      <div class="row wrap mt-2">
        <?php if (setting_bool('pwa.enabled')): ?><button class="btn btn-sm btn-soft" data-action="install-app" data-install-link hidden><i class="fa-solid fa-download"></i><?= e(t('pwa.install')) ?></button><?php endif ?>
        <span class="seg"><?php foreach (LANGS as $code => $name): ?><button data-action="lang-set" data-lang="<?= $code ?>" class="<?= lang() === $code ? 'active' : '' ?>"><?= e($name) ?></button><?php endforeach ?></span>
        <?php if (setting_bool('theme.dark_enabled')): ?><button class="icon-btn" data-action="theme-toggle" aria-label="<?= e(t('nav.theme')) ?>"><i class="fa-solid fa-moon theme-icon"></i></button><?php endif ?>
      </div>
    </div>
    <div class="ft-col">
      <h4><?= e(t('footer.explore')) ?></h4>
      <a href="<?= e(url('/')) ?>"><?= e(t('nav.home')) ?></a>
      <a href="<?= e(url('/services')) ?>"><?= e(t('nav.services')) ?></a>
      <a href="<?= e(url('/news')) ?>"><?= e(t('nav.news')) ?></a>
      <a href="<?= e(url('/team')) ?>"><?= e(t('nav.team')) ?></a>
      <a href="<?= e(url('/contact')) ?>"><?= e(t('nav.contact')) ?></a>
    </div>
    <div class="ft-col">
      <h4><?= e(t('nav.services')) ?></h4>
      <?php foreach ($footServices as $s): ?><a href="<?= e(url('/services/' . $s['slug'])) ?>"><?= e(loc($s, 'title')) ?></a><?php endforeach ?>
      <a href="<?= e(url('/services')) ?>"><?= e(t('common.view_all')) ?> →</a>
    </div>
    <div class="ft-col">
      <h4><?= e(t('footer.support')) ?></h4>
      <a href="<?= e(url('/contact')) ?>"><?= e(t('contact.title')) ?></a>
      <?php if (setting_bool('live_chat.enabled')): ?><a href="#" data-action="chat-open" data-tab="support"><?= e(t('chat.live_support')) ?></a><?php endif ?>
      <?php if (setting('contact.whatsapp')): ?><a href="https://wa.me/<?= e(preg_replace('~\D~', '', (string)setting('contact.whatsapp'))) ?>" target="_blank" rel="noopener">WhatsApp</a><?php endif ?>
      <?php if (setting('contact.email')): ?><a href="mailto:<?= e(setting('contact.email')) ?>"><?= e(setting('contact.email')) ?></a><?php endif ?>
      <a href="<?= e(url('/payment')) ?>"><?= e(t('nav.orders')) ?></a>
    </div>
  </div>
  <div class="ft-bottom">
    <span>© <?= num((int)date('Y')) ?> <?= e(setting('site_name')) ?>. <?= e(setting_l('copyright')) ?></span>
    <span><?= e(setting_l('contact.address')) ?></span>
  </div>
  <?php if (setting_l('disclaimer')): ?><p class="ft-disclaimer"><?= e(setting_l('disclaimer')) ?></p><?php endif ?>
</footer>
<?php endif ?>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
<?php if (!empty($isAdmin)): ?><script src="<?= e(asset('js/admin.js')) ?>" defer></script><?php endif ?>
</body>
</html>
