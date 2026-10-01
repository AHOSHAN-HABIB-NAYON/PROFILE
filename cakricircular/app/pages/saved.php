<?php
/* ================= সেভড জব — তালিকা ভিজিটরের নিজের ডিভাইসে থাকে (app.js) ================= */
require_once APP_ROOT . '/partials/post_card.php';
post_card_css();

css_once('saved', <<<CSS
.sv-empty{text-align:center;padding:42px 20px 36px;background:var(--card);border:1px solid var(--line-2);border-radius:22px;box-shadow:var(--sh)}
.sv-empty .ic{width:84px;height:84px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;font-size:2rem;
  color:var(--brand);background:var(--brand-l);position:relative}
.sv-empty .ic::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px dashed color-mix(in srgb,var(--brand) 30%,transparent)}
.sv-empty h2{font-size:1.1rem;margin:0 0 6px}
.sv-empty p{margin:0 auto 18px;color:var(--muted);font-size:.9rem;max-width:340px}
.unsave-btn{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--danger);
  display:grid;place-items:center;font-size:.8rem;transition:.18s}
.unsave-btn:hover{background:var(--danger);border-color:var(--danger);color:#fff}
CSS);

$P = [
  'title'  => 'সেভড জব | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'   => 'আপনার সেভ করা চাকরির বিজ্ঞপ্তিগুলো এক জায়গায়।',
  'canonical' => url('saved'),
  'robots' => 'noindex, follow',
  'nav'    => 'saved',
];
?>
<div class="hero">
  <div class="hero-in">
    <span class="hero-ic"><i class="fa fa-bookmark"></i></span>
    <div>
      <h1>সেভড জব</h1>
      <p>পরে দেখার জন্য রাখা বিজ্ঞপ্তিগুলো</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-bookmark"></i> সেভ করা <b id="savedCnt">০</b>টি</span>
    <span><i class="fa fa-mobile-screen"></i> শুধু এই ডিভাইসে সংরক্ষিত</span>
  </div>
</div>

<div class="sv-empty" id="savedEmpty">
  <div class="ic"><i class="fa fa-bookmark"></i></div>
  <h2>এখনো কিছু সেভ করা হয়নি</h2>
  <p>যে কোনো বিজ্ঞপ্তির ভেতরে <b>সেভ</b> বাটনে চাপ দিন — সেটি এখানে জমা থাকবে।</p>
  <a class="btn" href="<?= e(url()) ?>"><i class="fa fa-briefcase"></i> চাকরি দেখুন</a>
</div>

<div class="plist" id="savedList"></div>
