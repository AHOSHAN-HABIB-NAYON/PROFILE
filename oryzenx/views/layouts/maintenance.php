<?php /** @var string $until */
$pal = Theme::palette();
$wa = preg_replace('/\D/', '', setting('contact_whatsapp'));
$logo = setting('logo');
?><!doctype html>
<html lang="<?= e(lang()) ?>" data-layout="maintenance">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e(t('maint.title')) ?> · <?= e(setting('site_name')) ?></title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="<?= e($pal['primary']) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=Inter:wght@400;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" referrerpolicy="no-referrer">
<link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/components.css')) ?>">
<style>
:root{--primary:<?= e($pal['primary']) ?>;--primary-dark:<?= e($pal['dark']) ?>;--primary-rgb:<?= e($pal['rgb']) ?>;--accent:<?= e($pal['accent']) ?>}
@media (prefers-color-scheme:dark){:root{--background:#0b1220;--surface:#121b2d;--surface-soft:#18233a;--text:#e7ecf5;--text-muted:#94a3b8;--border:#233149;color-scheme:dark}}
body{min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(80% 60% at 50% 0%,rgba(var(--primary-rgb),.14),transparent),var(--background)}
.m{width:100%;max-width:400px;text-align:center}
.m .card{padding:1.4rem 1.1rem}
.gear{width:62px;height:62px;margin:0 auto .9rem;border-radius:18px;display:grid;place-items:center;color:#fff;font-size:1.6rem;background:linear-gradient(135deg,var(--primary),var(--accent));box-shadow:0 10px 26px rgba(var(--primary-rgb),.35)}
.gear i{animation:spin 6s linear infinite}
.cd{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin:1rem 0}
.cd div{background:var(--surface-soft);border:1px solid var(--border);border-radius:12px;padding:.5rem 0}
.cd b{display:block;font-size:1.3rem;color:var(--primary);font-variant-numeric:tabular-nums}
.cd small{font-size:.68rem;color:var(--text-muted)}
.brand{display:inline-flex;align-items:center;gap:.5rem;font-weight:700;margin-bottom:1rem}
.brand img{width:28px;height:28px;border-radius:7px}
.bar{height:4px;border-radius:4px;background:var(--surface-soft);overflow:hidden;margin-top:.5rem}
.bar i{display:block;height:100%;width:40%;background:linear-gradient(90deg,var(--primary),var(--accent));animation:slide 1.6s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
</style>
</head>
<body>
<main class="m">
    <div class="brand"><?php if ($logo): ?><img src="<?= e(upload_url($logo)) ?>" alt=""><?php endif; ?><?= e(setting('site_name')) ?></div>
    <div class="card">
        <div class="gear"><i class="fa-solid fa-gear"></i></div>
        <h1 style="font-size:1.25rem"><?= e(t('maint.title')) ?></h1>
        <p class="muted small"><?= e(sl('maintenance_message')) ?></p>
        <div class="cd" data-component="countdown" data-until="<?= e($until) ?>">
            <div><b data-d>00</b><small><?= e(t('js.days')) ?></small></div>
            <div><b data-h>00</b><small><?= e(t('js.hours')) ?></small></div>
            <div><b data-m>00</b><small><?= e(t('js.minutes')) ?></small></div>
            <div><b data-s>00</b><small><?= e(t('js.seconds')) ?></small></div>
        </div>
        <p class="xs muted mb-0"><?= e(t('maint.eta')) ?>: <?= e(fmt_date($until, true)) ?></p>
        <div class="bar"><i></i></div>
        <?php if (setting('maintenance_contact') === '1'): ?>
        <div class="row-gap mt-2" style="justify-content:center">
            <?php if ($wa): ?><a class="btn btn-sm btn-primary" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a><?php endif; ?>
            <?php if (setting('contact_email')): ?><a class="btn btn-sm btn-outline" href="mailto:<?= e(setting('contact_email')) ?>"><i class="fa-solid fa-envelope"></i> <?= e(t('contact.email')) ?></a><?php endif; ?>
        </div>
        <?php endif; ?>
    </div>
    <p class="xs muted mt-2"><a href="<?= e(url('/login')) ?>"><?= e(t('maint.admin_login')) ?></a></p>
</main>
<script>
(function(){var el=document.querySelector('[data-component="countdown"]'),end=Date.parse(el.dataset.until);
function p(n){return String(n).padStart(2,'0')}
function t(){var s=Math.max(0,Math.floor((end-Date.now())/1000));el.querySelector('[data-d]').textContent=p(Math.floor(s/86400));el.querySelector('[data-h]').textContent=p(Math.floor(s%86400/3600));el.querySelector('[data-m]').textContent=p(Math.floor(s%3600/60));el.querySelector('[data-s]').textContent=p(s%60);if(s<=0){clearInterval(i);setTimeout(function(){location.reload()},5000)}}
var i=setInterval(t,1000);t();})();
</script>
</body>
</html>
