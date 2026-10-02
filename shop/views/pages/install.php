<!doctype html>
<html lang="bn" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>ইনস্টলেশন উইজার্ড</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= asset('vendor/font-awesome/css/font-awesome.min.css') ?>">
<link rel="stylesheet" href="<?= asset('css/app.css') ?>">
<link rel="stylesheet" href="<?= asset('css/admin.css') ?>">
</head><body class="auth-body">
<main class="install-card card">
  <div class="install-head"><span class="brand-mark"><i class="fa fa-shopping-bag"></i></span><div><h1>ইনস্টলেশন উইজার্ড</h1><p class="muted small">কয়েকটি ধাপে আপনার শপ চালু করুন</p></div></div>
  <ol class="steps" data-steps><li class="active">সার্ভার</li><li>ডাটাবেস</li><li>অ্যাডমিন</li><li>শপ</li></ol>
  <form id="install-form" novalidate>
    <input type="hidden" name="_csrf" value="<?= e($csrf) ?>">
    <section class="step" data-step="0">
      <h2 class="card-title">১. সার্ভার রিকোয়ারমেন্ট</h2>
      <ul class="req-list">
        <?php $allOk = true; foreach ($reqs as [$label, $ok, $extra]): $allOk = $allOk && $ok; ?>
        <li class="<?= $ok ? 'ok' : 'bad' ?>"><i class="fa fa-<?= $ok ? 'check-circle' : 'times-circle' ?>"></i> <?= e($label) ?> <?php if ($extra): ?><small class="muted">(<?= e($extra) ?>)</small><?php endif; ?></li>
        <?php endforeach; ?>
      </ul>
      <?php if (!$allOk): ?><p class="alert alert-warn small">লাল চিহ্নিত রিকোয়ারমেন্টগুলো ঠিক করে পাতাটি রিফ্রেশ করুন। (Apache mod_rewrite ও SSL হোস্টিং থেকে চালু রাখুন)</p><?php endif; ?>
      <button type="button" class="btn btn-primary btn-block" data-next<?= $allOk ? '' : ' disabled' ?>>পরবর্তী ধাপ <i class="fa fa-arrow-right"></i></button>
    </section>
    <section class="step" data-step="1" hidden>
      <h2 class="card-title">২. ডাটাবেস</h2>
      <div class="grid-2">
        <div class="field"><label>ডাটাবেস হোস্ট</label><input name="db_host" value="localhost" required></div>
        <div class="field"><label>পোর্ট</label><input name="db_port" value="3306" inputmode="numeric"></div>
      </div>
      <div class="field"><label>ডাটাবেস নাম</label><input name="db_name" required autocomplete="off"></div>
      <div class="field"><label>ডাটাবেস ইউজার</label><input name="db_user" required autocomplete="off"></div>
      <div class="field"><label>ডাটাবেস পাসওয়ার্ড</label><input name="db_pass" type="password" autocomplete="new-password"></div>
      <div class="row-btns"><button type="button" class="btn btn-soft" data-prev>পেছনে</button><button type="button" class="btn btn-primary grow" data-next>পরবর্তী</button></div>
    </section>
    <section class="step" data-step="2" hidden>
      <h2 class="card-title">৩. অ্যাডমিন অ্যাকাউন্ট</h2>
      <div class="field"><label>অ্যাডমিন ইউজারনেম</label><input name="admin_user" required autocomplete="username" pattern="[A-Za-z0-9_.\-]{3,40}"></div>
      <div class="field"><label>অ্যাডমিন পাসওয়ার্ড</label><input name="admin_pass" type="password" required minlength="8" autocomplete="new-password"><p class="field-hint">কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা মিলিয়ে।</p></div>
      <div class="row-btns"><button type="button" class="btn btn-soft" data-prev>পেছনে</button><button type="button" class="btn btn-primary grow" data-next>পরবর্তী</button></div>
    </section>
    <section class="step" data-step="3" hidden>
      <h2 class="card-title">৪. শপের তথ্য</h2>
      <div class="field"><label>সাইটের নাম</label><input name="site_name" required></div>
      <div class="field"><label>সাইট URL</label><input name="app_url" value="<?= e(Request::origin()) ?>"></div>
      <div class="field"><label>WhatsApp নম্বর</label><input name="whatsapp" value="+8801757827996"></div>
      <div class="grid-2">
        <div class="field"><label>ঢাকার ভিতরে (৳)</label><input name="delivery_inside" value="70" inputmode="decimal"></div>
        <div class="field"><label>ঢাকার বাইরে (৳)</label><input name="delivery_outside" value="130" inputmode="decimal"></div>
      </div>
      <p class="field-error" data-install-error hidden></p>
      <div class="row-btns"><button type="button" class="btn btn-soft" data-prev>পেছনে</button><button type="submit" class="btn btn-primary grow"><i class="fa fa-download"></i> ইনস্টল করুন</button></div>
    </section>
  </form>
</main>
<script src="<?= asset('js/install.js') ?>" defer></script>
</body></html>
