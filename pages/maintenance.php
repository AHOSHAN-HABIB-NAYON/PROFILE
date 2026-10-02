<?php
/** Maintenance mode screen (HTTP 503, bare layout). */
defined('APP') || exit;

$ends = (string)setting('maintenance.ends_at');
$endsTs = $ends !== '' ? strtotime($ends) : false;
meta(['title' => t('maint.title'), 'robots' => 'noindex', 'status' => 503]);
header('Retry-After: ' . max(60, $endsTs ? $endsTs - time() : 3600));
$wa = preg_replace('~\D~', '', (string)setting('contact.whatsapp'));
?>
<style data-css="maintenance">
.maint{min-height:calc(100vh - 48px);min-height:calc(100dvh - 48px);display:grid;place-items:center;text-align:center}
.maint-card{max-width:440px;width:100%}
.gears{position:relative;width:120px;height:110px;margin:0 auto 18px}
.gears i{position:absolute;color:var(--primary)}
.gears .g1{font-size:4.2rem;left:8px;top:0;animation:spin 6s linear infinite}
.gears .g2{font-size:2.6rem;right:6px;bottom:4px;color:var(--secondary);animation:spin 4s linear infinite reverse}
.maint h1{font-size:1.4rem}
.cd{display:flex;gap:8px;justify-content:center;margin:18px 0}
.cd div{background:var(--card);border:1px solid var(--border);border-radius:14px;min-width:64px;padding:10px 6px}
.cd b{display:block;font-size:1.5rem;font-variant-numeric:tabular-nums}.cd span{font-size:.7rem;color:var(--muted)}
.maint-bar{height:6px;border-radius:6px;background:var(--soft);overflow:hidden;margin:16px 0}
.maint-bar i{display:block;height:100%;width:40%;border-radius:6px;background:linear-gradient(90deg,var(--primary),var(--accent));animation:indet 1.6s ease-in-out infinite}
@keyframes indet{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
</style>
<div class="page maint">
  <div class="maint-card">
    <div class="gears" aria-hidden="true"><i class="fa-solid fa-gear g1"></i><i class="fa-solid fa-gear g2"></i></div>
    <h1><?= e(t('maint.title')) ?></h1>
    <p class="muted"><?= e(setting_l('maintenance.message')) ?></p>
    <?php if ($endsTs && $endsTs > time()): ?>
      <div class="cd" data-countdown="<?= e(date('c', $endsTs)) ?>" aria-label="<?= e(t('maint.back_in')) ?>">
        <div><b data-cd>00</b><span><?= e(t('maint.days')) ?></span></div><div><b data-cd>00</b><span><?= e(t('maint.hours')) ?></span></div>
        <div><b data-cd>00</b><span><?= e(t('maint.minutes')) ?></span></div><div><b data-cd>00</b><span><?= e(t('maint.seconds')) ?></span></div>
      </div>
    <?php else: ?><div class="maint-bar"><i></i></div><?php endif ?>
    <?php if (setting_bool('maintenance.show_contact')): ?>
      <div class="row wrap" style="justify-content:center">
        <?php if ($wa): ?><a class="btn" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>WhatsApp</a><?php endif ?>
        <?php if (setting('contact.email')): ?><a class="btn btn-ghost" href="mailto:<?= e(setting('contact.email')) ?>"><i class="fa-regular fa-envelope"></i><?= e(t('form.email')) ?></a><?php endif ?>
      </div>
    <?php endif ?>
    <p class="tiny muted mt-3"><a href="<?= e(url('/login')) ?>" data-no-spa><?= e(t('maint.admin_login')) ?></a> · <a href="#" data-action="lang-toggle" data-lang="<?= lang() === 'bn' ? 'en' : 'bn' ?>"><?= lang() === 'bn' ? 'English' : 'বাংলা' ?></a></p>
  </div>
</div>
