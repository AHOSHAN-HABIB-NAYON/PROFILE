<?php /* এডমিন লগইন */ ?>
<!doctype html>
<html lang="bn"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>এডমিন লগইন</title>
<link rel="icon" href="<?= e(site_favicon()) ?>">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;color:#0f1f17;
  background:radial-gradient(900px 420px at 50% -8%,#dff3e7 0%,#f1f6f3 55%,#eef3f0 100%);
  font-family:"Hind Siliguri",system-ui,sans-serif}
.box{width:100%;max-width:400px;background:#fff;border-radius:26px;padding:30px 26px 22px;border:1px solid #e3ebe6;
  box-shadow:0 26px 60px rgba(6,60,34,.14);animation:up .32s cubic-bezier(.2,.9,.3,1.1) both}
@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.lg{text-align:center;margin-bottom:22px}
.lg .ring{width:86px;height:86px;margin:0 auto 12px;border-radius:50%;padding:4px;
  background:linear-gradient(135deg,#0a7d45,#7ee2a8);box-shadow:0 12px 28px rgba(10,125,69,.28)}
.lg img{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#fff;border:3px solid #fff}
.lg b{font-size:1.5rem;display:block;color:#0a6b3c;line-height:1.3}
.lg small{color:#66786f;font-size:.86rem;letter-spacing:.3px}
h2{font-size:1.06rem;margin:0 0 2px}
.sub{color:#66786f;font-size:.84rem;margin:0 0 16px}
label{display:block;font-size:.84rem;font-weight:600;margin-bottom:6px}
.f{position:relative;margin-bottom:14px}
.f i{position:absolute;top:50%;transform:translateY(-50%);left:15px;color:#8fa399;font-size:.9rem}
input{width:100%;height:50px;border:1.5px solid #e3ebe6;border-radius:14px;padding:0 14px 0 42px;font:inherit;background:#f6f9f7}
input:focus{outline:none;border-color:#0a7d45;background:#fff;box-shadow:0 0 0 4px rgba(10,125,69,.12)}
button{width:100%;height:50px;border:0;border-radius:14px;background:linear-gradient(135deg,#0a7d45,#14a35c);color:#fff;font:inherit;font-weight:700;
  font-size:1rem;cursor:pointer;transition:.18s;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 10px 22px rgba(10,125,69,.28);margin-top:6px}
button:hover{filter:brightness(1.06)}
button:active{transform:scale(.98)}
.err{background:#fdeceb;color:#c8352a;padding:11px 14px;border-radius:12px;font-size:.87rem;margin-bottom:14px;display:flex;gap:8px;align-items:center}
.back{display:block;text-align:center;margin-top:16px;font-size:.84rem;color:#66786f;text-decoration:none}
.back:hover{color:#0a7d45}
.copy{text-align:center;color:#8fa399;font-size:.76rem;margin-top:18px}
</style></head><body>
<div class="box">
  <div class="lg">
    <div class="ring"><img src="<?= e(site_logo()) ?>" alt=""></div>
    <b><?= e(setting('site_name', 'চাকরি সার্কুলার')) ?></b>
    <small>Admin Panel</small>
  </div>
  <h2>অ্যাডমিন লগইন</h2>
  <p class="sub">সাইট পরিচালনার জন্য লগইন করুন</p>
  <?php if (!empty($LOGIN_ERR)): ?><div class="err"><i class="fa fa-circle-exclamation"></i><?= e($LOGIN_ERR) ?></div><?php endif; ?>
  <form method="post" autocomplete="off">
    <?= csrf_field() ?>
    <label for="u">ইউজারনেম</label>
    <div class="f"><input id="u" name="username" required autofocus autocomplete="username" placeholder="ইউজারনেম লিখুন"><i class="fa fa-user"></i></div>
    <label for="p">পাসওয়ার্ড</label>
    <div class="f"><input id="p" type="password" name="password" required autocomplete="current-password" placeholder="পাসওয়ার্ড লিখুন"><i class="fa fa-lock"></i></div>
    <button type="submit"><i class="fa fa-right-to-bracket"></i> লগইন</button>
  </form>
  <a class="back" href="<?= e(url()) ?>">← ওয়েবসাইটে ফিরে যান</a>
  <div class="copy">© <?= date('Y') ?> <?= e(setting('site_name', 'চাকরি সার্কুলার')) ?> — সর্বস্বত্ব সংরক্ষিত</div>
</div>
</body></html>
