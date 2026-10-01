<?php
/** Landing page for visitors (real, crawlable HTML text). */
$site = (string) setting('site_name', 'Probaho');
$methods = db()->all('SELECT * FROM payment_methods WHERE is_active = 1 AND show_on_landing = 1 ORDER BY sort_order, id');
$faqs = db()->all('SELECT question, answer FROM faqs WHERE is_active = 1 ORDER BY sort_order, id');
$products = db()->all("SELECT slug, title_bn, summary, cover_image, category, release_date FROM products WHERE status = 'published' ORDER BY is_featured DESC, published_at DESC LIMIT 3");
$tgOn = setting('support.telegram_enabled') == 1 && setting('support.telegram_url') !== '';
$waOn = setting('support.whatsapp_enabled') == 1 && setting('support.whatsapp_url') !== '';

View::$meta['title'] = $site;
View::$meta['description'] = (string) setting('site_description');
View::$meta['schema'] = [
    '@context' => 'https://schema.org',
    '@graph' => [
        ['@type' => 'Organization', 'name' => $site, 'url' => abs_url('/'), 'logo' => abs_url(brand_logo()), 'email' => setting('contact_email'), 'telephone' => setting('contact_phone')],
        ['@type' => 'WebSite', 'name' => $site, 'url' => abs_url('/'), 'inLanguage' => 'bn-BD'],
        ['@type' => 'FAQPage', 'mainEntity' => array_map(static fn ($f) => ['@type' => 'Question', 'name' => $f['question'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f['answer']]], $faqs)],
    ],
];

$features = [
    ['zap', 'দ্রুত পেমেন্ট', 'Fast Payment — সেকেন্ডের মধ্যে ট্রান্সফার ও পেমেন্ট।'],
    ['wallet', 'নিরাপদ ওয়ালেট', 'Secure Wallet — লক-সুরক্ষিত লেজার, কখনো ডাবল খরচ নয়।'],
    ['binance', 'Binance Pay', 'ক্রিপ্টো (USDT) দিয়ে নিরাপদে ওয়ালেটে টাকা যোগ করুন।'],
    ['qr', 'QR পেমেন্ট', 'QR স্ক্যান করে তাৎক্ষণিক টাকা পাঠান।'],
    ['history', 'লেনদেন হিস্ট্রি', 'Transaction History — ফিল্টার ও বিস্তারিত রসিদসহ।'],
    ['bell', 'পুশ নোটিফিকেশন', 'Push Notification — প্রতিটি লেনদেনের সাথে সাথে আপডেট।'],
    ['mail', 'ইমেইল নোটিফিকেশন', 'Email Notification — গুরুত্বপূর্ণ সতর্কতা ইমেইলে।'],
    ['fingerprint', 'Passkey নিরাপত্তা', 'ফিঙ্গারপ্রিন্ট/ফেস দিয়ে পাসওয়ার্ড ছাড়া লগইন।'],
    ['globe', 'Google লগইন', 'Continue with Google — এক ক্লিকে অ্যাকাউন্ট।'],
    ['smartphone', 'PWA অ্যাপ', 'হোম স্ক্রিনে ইনস্টল করে অ্যাপের মতো ব্যবহার।'],
    ['bot', 'AI সহকারী', 'AI Assistant — ২৪/৭ বাংলা ও ইংরেজিতে উত্তর।'],
    ['headset', 'হিউম্যান সাপোর্ট', 'Telegram ও WhatsApp-এ সরাসরি সাপোর্ট টিম।'],
];
?>
<section class="hero">
  <div class="container hero-grid">
    <div>
      <span class="hero-badge"><b>নতুন</b> Passkey ও Binance Pay সাপোর্ট</span>
      <h1><?php
        $title = (string) setting('hero_title', 'সহজ, দ্রুত ও নিরাপদ ডিজিটাল পেমেন্ট');
        $parts = preg_split('/\s+/u', $title);
        $last = array_splice($parts, -2);
        echo e(implode(' ', $parts)) . ' <span class="grad">' . e(implode(' ', $last)) . '</span>';
      ?></h1>
      <p class="lead"><?= e(setting('hero_subtitle')) ?></p>
      <p class="lead-en"><?= e(setting('hero_subtitle_en')) ?></p>
      <div class="hero-cta">
        <?php if (setting_on('auth_registration')): ?><a href="<?= e(url('/register')) ?>" class="btn btn-primary btn-lg" data-link><?= icon('user') ?> অ্যাকাউন্ট তৈরি করুন</a><?php endif; ?>
        <a href="<?= e(url('/login')) ?>" class="btn btn-ghost btn-lg" data-link><?= icon('lock') ?> লগইন করুন</a>
        <?php if (setting_on('pwa_enabled')): ?><button type="button" class="btn btn-ghost btn-lg" data-action="install-app"><?= icon('download') ?> অ্যাপ ইনস্টল করুন</button><?php endif; ?>
      </div>
      <div class="hero-trust">
        <span><?= icon('shield') ?> ব্যাংক-গ্রেড এনক্রিপশন</span>
        <span><?= icon('fingerprint') ?> Passkey সুরক্ষা</span>
        <span><?= icon('headset') ?> ২৪/৭ সহায়তা</span>
      </div>
    </div>
    <div aria-hidden="true">
      <div class="phone-mock">
        <div class="phone-notch"></div>
        <div class="phone-screen">
          <div class="balance-card mock-balance">
            <p class="label">মোট ব্যালেন্স</p>
            <div class="balance-amount"><span>$2,450.00</span><small><?= e(currency()) ?></small></div>
            <div class="balance-actions"><a><?= icon('arrow-down') ?>জমা</a><a><?= icon('send') ?>পাঠান</a><a><?= icon('qr') ?>QR</a></div>
          </div>
          <div class="mock-row"><div><?= icon('binance') ?></div><div><?= icon('zap') ?></div><div><?= icon('receipt') ?></div><div><?= icon('grid') ?></div></div>
          <div class="mock-tx"><i></i><span></span></div>
          <div class="mock-tx"><i></i><span></span></div>
          <div class="mock-tx"><i></i><span></span></div>
        </div>
        <div class="float-chip c1"><?= icon('check-circle') ?> পেমেন্ট সফল</div>
        <div class="float-chip c2"><?= icon('binance') ?> Binance Pay</div>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt" id="about">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">আমাদের সম্পর্কে</span>
      <h2><?= e($site) ?> কী?</h2>
      <p><?= e(setting('about_text')) ?></p>
    </div>
    <div class="about-grid">
      <div class="about-item"><span class="ic-box"><?= icon('layers') ?></span><div><h3>আপনি যা করতে পারবেন</h3><p>ওয়ালেটে টাকা জমা, উত্তোলন, ট্রান্সফার, QR পেমেন্ট, Binance Pay এবং সরকারি ও মোবাইল সংক্রান্ত নানা সার্ভিস।</p></div></div>
      <div class="about-item"><span class="ic-box"><?= icon('activity') ?></span><div><h3>যেভাবে কাজ করে</h3><p>অ্যাকাউন্ট খুলুন, ওয়ালেটে টাকা যোগ করুন, তারপর যেকোনো সার্ভিস বা পেমেন্ট এক ট্যাপে সম্পন্ন করুন।</p></div></div>
      <div class="about-item"><span class="ic-box"><?= icon('shield') ?></span><div><h3>নিরাপত্তা</h3><p>Passkey, 2FA, CAPTCHA, সেশন সুরক্ষা ও প্রতিটি লগইনে সতর্কতা — আপনার টাকা সবসময় সুরক্ষিত।</p></div></div>
      <div class="about-item"><span class="ic-box"><?= icon('card') ?></span><div><h3>পেমেন্ট ফিচার</h3><p>তাৎক্ষণিক ট্রান্সফার, স্বচ্ছ ফি, বিস্তারিত রসিদ এবং Binance Pay দিয়ে ক্রিপ্টো পেমেন্ট।</p></div></div>
      <div class="about-item"><span class="ic-box"><?= icon('headset') ?></span><div><h3>সাপোর্ট সিস্টেম</h3><p>AI সহকারী ২৪/৭ উত্তর দেয়, আর প্রয়োজনে Telegram/WhatsApp-এ মানুষের সাথে কথা বলুন।</p></div></div>
      <div class="about-item"><span class="ic-box"><?= icon('smartphone') ?></span><div><h3>অ্যাপের অভিজ্ঞতা</h3><p>ইনস্টলযোগ্য PWA — দ্রুত, হালকা এবং লো-এন্ড Android-এও স্মুথ।</p></div></div>
    </div>
  </div>
</section>

<section class="section" id="features">
  <div class="container">
    <div class="section-head"><span class="eyebrow">ফিচারসমূহ</span><h2>এক অ্যাপে সব কিছু</h2><p>দৈনন্দিন ডিজিটাল লেনদেনের জন্য প্রয়োজনীয় সব ফিচার — সুন্দর, দ্রুত ও নিরাপদ।</p></div>
    <div class="feature-grid">
      <?php foreach ($features as [$ic, $title, $desc]): ?>
        <article class="card feature"><span class="ic-box"><?= icon($ic) ?></span><h3><?= e($title) ?></h3><p><?= e($desc) ?></p></article>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="section section-alt" id="how">
  <div class="container">
    <div class="section-head"><span class="eyebrow">কীভাবে কাজ করে</span><h2>মাত্র ৪টি ধাপে শুরু করুন</h2></div>
    <div class="steps">
      <div class="step"><span class="step-num">১</span><div><h3>অ্যাকাউন্ট তৈরি করুন</h3><p>ইমেইল/মোবাইল বা Google দিয়ে ১ মিনিটে।</p></div></div>
      <div class="step"><span class="step-num">২</span><div><h3>ভেরিফাই করুন</h3><p>ইমেইল নিশ্চিত করুন ও Passkey যোগ করুন।</p></div></div>
      <div class="step"><span class="step-num">৩</span><div><h3>ওয়ালেট/পেমেন্ট ব্যবহার করুন</h3><p>Binance Pay বা অন্য মেথডে টাকা যোগ করুন।</p></div></div>
      <div class="step"><span class="step-num">৪</span><div><h3>লেনদেন সম্পন্ন করুন</h3><p>পাঠান, পেমেন্ট করুন, সার্ভিস নিন — সাথে সাথে রসিদ।</p></div></div>
    </div>
  </div>
</section>

<?php if ($methods): ?>
<section class="section" id="payment-methods">
  <div class="container">
    <div class="section-head"><span class="eyebrow">পেমেন্ট মেথড</span><h2>উপলব্ধ পেমেন্ট মেথড</h2><p>আপনার সুবিধামতো মেথড বেছে নিন। Binance Pay শুধুমাত্র পেমেন্টের জন্য ব্যবহৃত হয়।</p></div>
    <div class="pm-grid">
      <?php foreach ($methods as $m): ?>
        <article class="card pm-card">
          <span class="pm-ic" style="background:<?= e($m['color'] ?: '#5b4bff') ?>"><?= media_icon($m['icon']) ?></span>
          <h3><?= e($m['name']) ?></h3>
          <p><?= e($m['description']) ?></p>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<section class="section section-alt" id="security">
  <div class="container split">
    <div>
      <span class="badge badge-brand"><?= icon('shield') ?> নিরাপত্তা</span>
      <h2 style="margin-top:12px">আপনার নিরাপত্তা আমাদের প্রথম অগ্রাধিকার</h2>
      <p class="muted">প্রতিটি স্তরে আধুনিক নিরাপত্তা ব্যবস্থা — যাতে আপনি নিশ্চিন্তে লেনদেন করতে পারেন।</p>
    </div>
    <ul class="check-list">
      <li><?= icon('check-circle') ?><div><b>Passkey</b><small>ফিঙ্গারপ্রিন্ট, ফেস আনলক, ডিভাইস PIN বা Windows Hello — বায়োমেট্রিক তথ্য কখনো সার্ভারে যায় না।</small></div></li>
      <li><?= icon('check-circle') ?><div><b>নিরাপদ লগইন ও 2FA</b><small>লগইন চেষ্টা সীমিত, প্রয়োজনে Authenticator অ্যাপ দিয়ে দ্বি-স্তর যাচাই।</small></div></li>
      <li><?= icon('check-circle') ?><div><b>CAPTCHA ও সেশন সুরক্ষা</b><small>বট প্রতিরোধ, স্বয়ংক্রিয় সেশন টাইমআউট ও যেকোনো ডিভাইস থেকে লগআউট।</small></div></li>
      <li><?= icon('check-circle') ?><div><b>নিরাপদ পেমেন্ট</b><small>লক-সুরক্ষিত লেজার, সার্ভার-সাইড যাচাই — API সিক্রেট কখনো ব্রাউজারে যায় না।</small></div></li>
      <li><?= icon('check-circle') ?><div><b>ইমেইল ও পুশ সতর্কতা</b><small>নতুন লগইন, Passkey যোগ ও প্রতিটি পেমেন্টে সাথে সাথে নোটিফিকেশন।</small></div></li>
    </ul>
  </div>
</section>

<?php if (setting_on('pwa_enabled')): ?>
<section class="section" id="app">
  <div class="container">
    <div class="cta-band split">
      <div>
        <h2>অ্যাপের মতো ব্যবহার করুন</h2>
        <p>কোনো অ্যাপ স্টোর ছাড়াই <?= e($site) ?> আপনার ফোনের হোম স্ক্রিনে ইনস্টল করুন। দ্রুত খোলে, কম ডেটা খরচ করে এবং পুশ নোটিফিকেশন পায়।</p>
      </div>
      <div class="row wrap">
        <button type="button" class="btn btn-light btn-lg" data-action="install-app"><?= icon('download') ?> অ্যাপ ইনস্টল করুন</button>
      </div>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if (AI::enabled()): ?>
<section class="section section-alt" id="ai">
  <div class="container split">
    <div>
      <span class="badge badge-brand"><?= icon('sparkles') ?> AI Assistant</span>
      <h2 style="margin-top:12px">AI Assistant — আপনার প্রশ্নের উত্তর দিন</h2>
      <p class="muted">আমাদের AI সহকারী এই প্ল্যাটফর্মের সার্ভিস, পেমেন্ট, Binance Pay, অ্যাকাউন্ট ও সাপোর্ট সম্পর্কে অনুমোদিত তথ্য থেকে বাংলা ও ইংরেজিতে তাৎক্ষণিক উত্তর দেয়।</p>
      <button type="button" class="btn btn-primary" data-action="chat-open" data-tab="ai"><?= icon('bot') ?> AI সহকারীকে জিজ্ঞেস করুন</button>
    </div>
    <div class="card chat-demo" aria-hidden="true">
      <div class="bubble me">Binance Pay দিয়ে কীভাবে পেমেন্ট করব?</div>
      <div class="bubble bot">ওয়ালেট → জমা → Binance Pay নির্বাচন করুন, পরিমাণ লিখে পেমেন্ট শুরু করুন এবং Binance অ্যাপে QR স্ক্যান করুন। সফল হলে ব্যালেন্স স্বয়ংক্রিয়ভাবে যোগ হবে ✓</div>
      <div class="bubble me">আপনাদের Telegram কোথায়?</div>
      <div class="bubble bot"><?= $tgOn ? 'আমাদের Telegram: ' . e(setting('support.telegram_url')) : 'সাপোর্ট পেজ থেকে আমাদের সাথে যোগাযোগ করুন।' ?></div>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($tgOn || $waOn): ?>
<section class="section" id="support">
  <div class="container">
    <div class="section-head"><span class="eyebrow">হিউম্যান সাপোর্ট</span><h2><?= e(setting('support.title')) ?></h2><p><?= e(setting('support.working_hours')) ?> · <?= e(setting('support.response_message')) ?></p></div>
    <div class="contact-grid" style="max-width:760px;margin:0 auto">
      <?php if ($tgOn): ?><a class="contact-card tg" href="<?= e(setting('support.telegram_url')) ?>" target="_blank" rel="noopener"><span class="contact-ic"><?= icon('telegram') ?></span><span><b>Telegram-এ যোগাযোগ করুন</b><small><?= e(setting('support.telegram_name')) ?> · @<?= e(ltrim((string) setting('support.telegram_username'), '@')) ?></small></span><?= icon('external') ?></a><?php endif; ?>
      <?php if ($waOn): ?><a class="contact-card wa" href="<?= e(setting('support.whatsapp_url')) ?>" target="_blank" rel="noopener"><span class="contact-ic"><?= icon('whatsapp') ?></span><span><b>WhatsApp-এ যোগাযোগ করুন</b><small><?= e(setting('support.whatsapp_name')) ?> · <?= e(setting('support.whatsapp_number')) ?></small></span><?= icon('external') ?></a><?php endif; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($products): ?>
<section class="section section-alt">
  <div class="container">
    <div class="section-head"><span class="eyebrow">নতুন রিলিজ</span><h2>প্রোডাক্ট ও আপডেট</h2></div>
    <div class="product-grid three">
      <?php foreach ($products as $p): ?>
        <a href="<?= e(url('/products/' . $p['slug'])) ?>" class="card product-card" data-link>
          <div class="product-cover"><?= $p['cover_image'] ? '<img src="' . e(upload_url($p['cover_image'])) . '" alt="" loading="lazy" decoding="async">' : icon('package') ?></div>
          <div class="product-body">
            <div class="product-meta"><?php if ($p['category']): ?><span class="badge badge-brand"><?= e($p['category']) ?></span><?php endif; ?><span><?= e(bn_date($p['release_date'], false)) ?></span></div>
            <h3><?= e($p['title_bn']) ?></h3><p><?= e($p['summary']) ?></p>
          </div>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($faqs): ?>
<section class="section" id="faq">
  <div class="container">
    <div class="section-head"><span class="eyebrow">FAQ</span><h2>সাধারণ জিজ্ঞাসা</h2></div>
    <div class="faq-list">
      <?php foreach ($faqs as $i => $f): ?>
        <details class="faq" <?= $i === 0 ? 'open' : '' ?>><summary><?= e($f['question']) ?><?= icon('chevron-down') ?></summary><div class="faq-a"><?= nl2p($f['answer']) ?></div></details>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<section class="section">
  <div class="container">
    <div class="cta-band center">
      <h2>আজই শুরু করুন — সম্পূর্ণ ফ্রি</h2>
      <p>মাত্র এক মিনিটে অ্যাকাউন্ট খুলে নিরাপদ ডিজিটাল পেমেন্টের অভিজ্ঞতা নিন।</p>
      <div class="row wrap" style="justify-content:center">
        <?php if (setting_on('auth_registration')): ?><a href="<?= e(url('/register')) ?>" class="btn btn-light btn-lg" data-link>অ্যাকাউন্ট তৈরি করুন</a><?php endif; ?>
        <a href="<?= e(url('/login')) ?>" class="btn btn-ghost btn-lg" data-link>লগইন করুন</a>
      </div>
    </div>
  </div>
</section>
