<?php
/* ================= ৪০৪ ================= */
require_once APP_ROOT . '/partials/post_card.php';

$recent = all("SELECT p.*, c.name AS cat_name FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
               WHERE p.status = 1 AND p.deleted_at IS NULL ORDER BY p.published_at DESC LIMIT 4");

css_once('e404', <<<CSS
.e4{text-align:center;padding:46px 18px 34px;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r);box-shadow:var(--sh)}
.e4 .num{font-size:4.4rem;font-weight:700;line-height:1;letter-spacing:-2px;
  background:linear-gradient(135deg,var(--brand),var(--brand-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.e4 .eic{width:74px;height:74px;margin:0 auto 6px;border-radius:50%;display:grid;place-items:center;
  font-size:1.8rem;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 12px 28px rgba(15,118,110,.26)}
.e4 h1{font-size:1.2rem;margin:12px 0 6px;font-weight:700}
.e4 p{color:var(--muted);margin:0 auto 20px;max-width:420px;font-size:.94rem;line-height:1.8}
.e4-act{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}
CSS);

$P = [
  'title'  => 'পেজটি পাওয়া যায়নি | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'   => 'আপনি যে পেজটি খুঁজছেন সেটি নেই বা সরিয়ে ফেলা হয়েছে।',
  'status' => 404,
  'nav'    => '',
];
?>
<div class="e4">
  <div class="eic"><i class="fa fa-compass"></i></div>
  <div class="num">৪০৪</div>
  <h1>পেজটি পাওয়া যায়নি</h1>
  <p>লিংকটি ভুল হতে পারে, অথবা পোস্টটি সরিয়ে ফেলা হয়েছে। নিচ থেকে হোমে ফিরুন বা খুঁজে দেখুন।</p>
  <div class="e4-act">
    <a class="btn" href="<?= e(url()) ?>"><i class="fa fa-house"></i> হোমে ফিরুন</a>
    <a class="btn btn-ghost" href="<?= e(url('search')) ?>"><i class="fa fa-magnifying-glass"></i> খুঁজুন</a>
  </div>
</div>

<?php if ($recent): ?>
  <div class="sec-title">
    <div class="sec-l">
      <span class="sec-ic"><i class="fa fa-bolt"></i></span>
      <h2>সর্বশেষ প্রকাশিত<small>এগুলো দেখে নিতে পারেন</small></h2>
    </div>
  </div>
  <div class="plist"><?php foreach ($recent as $r) post_card($r); ?></div>
<?php endif; ?>
