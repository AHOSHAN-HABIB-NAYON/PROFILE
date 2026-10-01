<?php
/* ================= আমাদের সম্পর্কে / গোপনীয়তা — কার্ড ডিজাইন ================= */
$key = ($params['key'] ?? 'about') === 'privacy' ? 'privacy' : 'about';

$siteName = setting('site_name', 'চাকরি সার্কুলার');
$email    = setting('contact_email', 'cakricircular.support@gmail.com');

$meta = [
  'about'   => ['t' => 'আমাদের সম্পর্কে', 'i' => 'fa-circle-info'],
  'privacy' => ['t' => 'গোপনীয়তা ও নিরাপত্তা', 'i' => 'fa-shield-halved'],
][$key];

css_once('info', <<<CSS
.inf-wrap{max-width:760px;margin:6px auto}
.inf-head{display:flex;align-items:center;gap:14px;margin:0 0 18px}
.inf-head i{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;font-size:1.15rem;color:#fff;
  background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 6px 16px rgba(10,125,69,.26);flex:none}
.inf-head h1{font-size:1.2rem;font-weight:700;margin:0;line-height:1.35}

.inf-card{background:var(--card);border:1px solid var(--line-2);border-radius:20px;padding:22px;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 10px 26px rgba(16,40,36,.05);margin-bottom:16px}
.inf-card h3{display:flex;align-items:center;gap:13px;font-size:1.02rem;font-weight:700;margin:0 0 13px;color:var(--ink)}
.inf-card h3 i{width:42px;height:42px;border-radius:13px;background:var(--brand-l);color:var(--brand-d);
  display:grid;place-items:center;font-size:1rem;flex:none}
.inf-card p{margin:0 0 4px;line-height:1.9;color:var(--ink-2);font-size:.94rem}
.inf-card ul{margin:0;padding-left:20px}
.inf-card li{margin-bottom:9px;line-height:1.8;color:var(--ink-2);font-size:.94rem}
.inf-card li:last-child{margin-bottom:0}

.inf-note{display:flex;gap:13px;align-items:flex-start;border-radius:18px;padding:17px 19px;margin-bottom:16px}
.inf-note i{font-size:1.15rem;flex:none;margin-top:2px}
.inf-note p{margin:0;line-height:1.85;color:var(--ink-2);font-size:.92rem}
.inf-note b{color:var(--brand-d)}
.inf-note.warn{background:#fff7ed;border:1px solid #fde3c8}
.inf-note.warn i{color:#e2792a}
.inf-note.danger{background:#fef2f2;border:1px solid #fecdd3}
.inf-note.danger i{color:#dc2626}
.inf-note.danger p{color:var(--ink-2)}

.em-box{margin-top:15px;background:var(--brand-l);border-radius:16px;padding:16px 18px}
.em-box .em-addr{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--ink);font-size:.98rem;word-break:break-all}
.em-box .em-addr i{color:var(--brand-d);flex:none}
.em-box small{display:block;margin-top:6px;color:var(--muted);font-size:.8rem}
.em-btn{margin-top:14px;display:inline-flex;align-items:center;gap:9px;background:linear-gradient(135deg,var(--brand),var(--brand-2));
  color:#fff;font-weight:700;font-size:.88rem;padding:11px 20px;border-radius:999px;border:0;
  box-shadow:0 8px 18px rgba(10,125,69,.24);transition:.2s}
.em-btn:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(10,125,69,.3)}
.em-btn:active{transform:scale(.96)}

.inf-updated{text-align:center;color:var(--muted);font-size:.82rem;margin-top:6px}

@media(max-width:700px){
  .inf-card,.inf-note{padding:16px}
  .inf-head h1{font-size:1.06rem}
  .inf-head i{width:42px;height:42px}
}
CSS);

ob_start();
if ($key === 'about'): ?>

  <div class="inf-card">
    <h3><i class="fa fa-circle-info"></i>আমরা কারা</h3>
    <p><?= e($siteName) ?> বাংলাদেশের সরকারি ও বেসরকারি প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি, ভর্তি তথ্য, পরীক্ষার ফলাফল ও গুরুত্বপূর্ণ নোটিশ একসাথে সহজভাবে উপস্থাপন করে। প্রতিটি তথ্য মূল সার্কুলার বা প্রতিষ্ঠানের ওয়েবসাইট থেকে যাচাই করে প্রকাশ করা হয়, যাতে আপনি নির্ভরযোগ্য তথ্য দ্রুত পেতে পারেন।</p>
  </div>

  <div class="inf-card">
    <h3><i class="fa fa-list-check"></i>আমরা যা করি</h3>
    <ul>
      <li>প্রতিদিন নতুন নিয়োগ ও ভর্তি বিজ্ঞপ্তি প্রকাশ করি</li>
      <li>আবেদনের শেষ তারিখ ও হাতে থাকা সময় স্পষ্টভাবে দেখাই</li>
      <li>মূল বিজ্ঞপ্তির পিডিএফ ও আবেদনের সরাসরি লিংক সংযুক্ত করি</li>
      <li>পরীক্ষার ফলাফল ও গুরুত্বপূর্ণ নোটিশ সময়মতো জানাই</li>
    </ul>
  </div>

  <div class="inf-card">
    <h3><i class="fa fa-headset"></i>যোগাযোগ করুন</h3>
    <p>কোনো বিজ্ঞপ্তিতে ভুল তথ্য চোখে পড়লে, পরামর্শ থাকলে বা সহযোগিতার প্রস্তাব থাকলে সরাসরি ইমেইলে যোগাযোগ করুন — আমরা মনোযোগ দিয়ে পড়ি ও উত্তর দেওয়ার চেষ্টা করি।</p>
    <div class="em-box">
      <div class="em-addr"><i class="fa fa-envelope"></i><?= e($email) ?></div>
      <small>সাধারণত ২৪–৪৮ ঘণ্টার মধ্যে উত্তর দেওয়া হয়</small>
      <a class="em-btn" href="mailto:<?= e($email) ?>"><i class="fa fa-paper-plane"></i> মেইল করুন</a>
    </div>
  </div>

  <p class="inf-updated">সর্বশেষ হালনাগাদ: <?= e(date('d F, Y')) ?></p>

<?php else: ?>

  <div class="inf-note warn">
    <i class="fa fa-triangle-exclamation"></i>
    <p><?= e($siteName) ?> কোনো সরকারি প্রতিষ্ঠান নয় — এটি একটি স্বাধীন, বেসরকারি প্ল্যাটফর্ম যা বিভিন্ন সরকারি-বেসরকারি প্রতিষ্ঠানের নিয়োগ সার্কুলার একত্র করে সহজভাবে উপস্থাপন করে। বিস্তারিত জানতে নিচের তথ্যগুলো পড়ুন।</p>
  </div>

  <div class="inf-card">
    <h3><i class="fa fa-link"></i>বাইরের লিংক</h3>
    <p>আবেদনের লিংকগুলো সংশ্লিষ্ট প্রতিষ্ঠানের নিজস্ব ওয়েবসাইট বা পোর্টালে নিয়ে যায়। সেসব ওয়েবসাইটের তথ্য, নিরাপত্তা বা গোপনীয়তা নীতির জন্য আমরা দায়ী নই।</p>
  </div>

  <div class="inf-note danger">
    <i class="fa fa-triangle-exclamation"></i>
    <p><b>নিয়োগ প্রতারণা থেকে সতর্ক থাকুন —</b> সরকারি বা বেসরকারি কোনো চাকরির আবেদন, পরীক্ষা বা নিয়োগ প্রক্রিয়ার কোনো ধাপেই টাকা-পয়সা বা উপহার চাওয়া হয় না। আবেদন গ্রহণ বা নিয়োগ নিশ্চিত করার নামে কেউ অর্থ দাবি করলে বুঝবেন এটি প্রতারণা — কোনোভাবেই টাকা দেবেন না। এমন কারো সাথে ব্যক্তিগতভাবে লেনদেন করলে তার সম্পূর্ণ দায়ভার সংশ্লিষ্ট ব্যক্তির নিজের; এ ধরনের কোনো ক্ষতির জন্য <?= e($siteName) ?> দায়ী থাকবে না।</p>
  </div>

  <div class="inf-card">
    <h3><i class="fa fa-copyright"></i>কপিরাইট ও ব্যবহারের শর্ত</h3>
    <p>এই ওয়েবসাইটের সকল কনটেন্ট, ডিজাইন, লোগো, লেখা ও কাঠামোর সর্বস্বত্ব <?= e($siteName) ?>-এর সংরক্ষিত। পূর্বানুমতি ছাড়া এই সাইটের কোনো অংশ কপি, পুনঃপ্রকাশ, পুনঃবিতরণ বা বাণিজ্যিকভাবে ব্যবহার করা সম্পূর্ণ নিষিদ্ধ। মূল পোস্টের লিংকসহ শেয়ার করতে আমরা সবসময় স্বাগত জানাই।</p>
  </div>

  <div class="inf-card">
    <h3><i class="fa fa-headset"></i>কোনো সমস্যা বা প্রশ্ন থাকলে</h3>
    <p>এই নীতিমালা সম্পর্কে কোনো প্রশ্ন থাকলে, কোনো তথ্য ভুল মনে হলে বা অন্য কোনো সমস্যা থাকলে সরাসরি ইমেইলে যোগাযোগ করুন —</p>
    <div class="em-box">
      <div class="em-addr"><i class="fa fa-envelope"></i><?= e($email) ?></div>
      <small>সাধারণত ২৪–৪৮ ঘণ্টার মধ্যে উত্তর দেওয়া হয়</small>
      <a class="em-btn" href="mailto:<?= e($email) ?>"><i class="fa fa-paper-plane"></i> মেইল করুন</a>
    </div>
  </div>

  <p class="inf-updated">সর্বশেষ হালনাগাদ: <?= e(date('d F, Y')) ?></p>

<?php endif;
$bodyHtml = ob_get_clean();

$P = [
  'title' => $meta['t'] . ' | ' . $siteName,
  'desc'  => $key === 'about'
      ? $siteName . ' সম্পর্কে জানুন — আমরা কারা, কী করি এবং কীভাবে যোগাযোগ করবেন।'
      : $siteName . '-এর গোপনীয়তা নীতি, বাইরের লিংক ও নিয়োগ প্রতারণা থেকে সতর্ক থাকার তথ্য।',
  'canonical' => url($key),
  'nav' => '',
];
?>
<div class="inf-wrap">
  <div class="inf-head">
    <i class="fa <?= e($meta['i']) ?>"></i>
    <h1><?= e($meta['t']) ?></h1>
  </div>
  <?= $bodyHtml ?>
</div>
