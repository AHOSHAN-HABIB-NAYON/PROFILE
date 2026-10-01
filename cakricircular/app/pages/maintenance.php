<?php
/* ================= রক্ষণাবেক্ষণ পেজ (প্রিমিয়াম, অ্যানিমেটেড) ================= */
$mTitle = setting('maintenance_title', 'সার্ভার আপডেট চলছে');
$mText  = setting('maintenance_text', 'আমরা সাইটটিকে আরও দ্রুত ও সুন্দর করছি। কিছুক্ষণ পরে আবার আসুন — ধন্যবাদ।');
?>
<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0f766e">
<title><?= e($mTitle) ?> — <?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></title>
<link rel="icon" href="<?= e(site_favicon()) ?>">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
  background:radial-gradient(1200px 600px at 50% -10%, #e6f4f1 0%, #f4f8f7 55%, #eef4f3 100%);
  font-family:"Hind Siliguri",system-ui,sans-serif;color:#13211f;line-height:1.75}
.mx{width:100%;max-width:440px;text-align:center;animation:up .5s cubic-bezier(.2,.9,.3,1.1) both}
@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.ring{position:relative;width:132px;height:132px;margin:0 auto 26px}
.ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
.ring .bgc{fill:none;stroke:#dbe9e6;stroke-width:7}
.ring .fgc{fill:none;stroke:url(#gr);stroke-width:7;stroke-linecap:round;
  stroke-dasharray:364;stroke-dashoffset:364;animation:fill 2.6s ease-in-out infinite}
@keyframes fill{0%{stroke-dashoffset:364}55%{stroke-dashoffset:96}100%{stroke-dashoffset:364}}
.ring .ic{position:absolute;inset:0;display:grid;place-items:center;font-size:2.6rem;color:#0f766e;
  animation:spinPulse 2.6s ease-in-out infinite}
@keyframes spinPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.ring .ic i{animation:rot 3.4s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
.dotwave{display:flex;gap:7px;justify-content:center;margin:20px 0 0}
.dotwave i{width:8px;height:8px;border-radius:50%;background:#0f766e;opacity:.3;animation:wv 1.2s ease-in-out infinite}
.dotwave i:nth-child(2){animation-delay:.15s}.dotwave i:nth-child(3){animation-delay:.3s}
@keyframes wv{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-6px)}}
h1{font-size:1.5rem;margin:0 0 10px;font-weight:700;letter-spacing:-.4px}
p{color:#5b6d69;margin:0 auto;max-width:360px;font-size:.98rem}
.brand{display:inline-flex;align-items:center;gap:9px;margin-bottom:26px;padding:8px 16px 8px 8px;
  background:#fff;border:1px solid #e4eae8;border-radius:999px;box-shadow:0 6px 20px rgba(16,40,36,.06)}
.brand img{width:32px;height:32px;border-radius:9px;object-fit:cover}
.brand b{font-size:.98rem}
.bar{height:6px;background:#e2edea;border-radius:999px;overflow:hidden;margin:24px auto 0;max-width:280px}
.bar i{display:block;height:100%;width:40%;border-radius:999px;
  background:linear-gradient(90deg,#0f766e,#16a08a);animation:sl 1.8s ease-in-out infinite}
@keyframes sl{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}
.foot{margin-top:30px;font-size:.84rem;color:#7d8f8b}
.foot a{color:#0f766e;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<div class="mx">
  <div class="brand">
    <img src="<?= e(site_logo()) ?>" alt="">
    <b><?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></b>
  </div>

  <div class="ring">
    <svg viewBox="0 0 132 132">
      <defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#3fd389"/>
      </linearGradient></defs>
      <circle class="bgc" cx="66" cy="66" r="58"/>
      <circle class="fgc" cx="66" cy="66" r="58"/>
    </svg>
    <div class="ic"><i class="fa fa-gear"></i></div>
  </div>

  <h1><?= e($mTitle) ?></h1>
  <p><?= e($mText) ?></p>

  <div class="bar"><i></i></div>
  <div class="dotwave"><i></i><i></i><i></i></div>

  <div class="foot">
    সমস্যা হলে জানান —
    <a href="mailto:<?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?>"><?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?></a>
  </div>
</div>
<script>setTimeout(function(){location.reload();}, 60000);</script>
</body>
</html>
