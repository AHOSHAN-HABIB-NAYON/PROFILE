<?php
/* ================= নোটিশ বোর্ড ================= */
$limit = notice_limit();                       // এডমিন সেটিং (ডিফল্ট ৫০)
prune_notices();                               // অতিরিক্ত পুরনো নোটিশ অটো মেয়াদ শেষ
$rows  = all("SELECT * FROM notices WHERE is_active = 1 ORDER BY created_at DESC, id DESC LIMIT $limit");
$newN  = 0;
foreach ($rows as $n) if ((time() - strtotime($n['created_at'])) < 86400) $newN++;

css_once('notices', <<<CSS
.nt-list{display:grid;gap:8px}
.nt{display:flex;align-items:center;gap:11px;padding:10px 12px;background:var(--card);border:1px solid var(--line-2);
  border-radius:15px;box-shadow:0 1px 2px rgba(16,40,36,.04),0 8px 22px rgba(16,40,36,.045);
  transition:border-color .18s,transform .18s;position:relative;overflow:hidden}
.nt:hover{border-color:var(--line);transform:translateY(-1px)}
.nt::before{content:"";position:absolute;top:0;bottom:0;right:0;width:3px;background:var(--brand);opacity:.18}
.nt.new::before{background:var(--danger);opacity:.55}
.nt .nic{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;font-size:.88rem;
  background:var(--brand-l);color:var(--brand-d)}
.nt.new .nic{background:#fdecea;color:var(--danger)}
.nt-body{flex:1;min-width:0}
.nt .nic{align-self:center}
.nt-top{display:flex;align-items:center;gap:9px}
.nt b{display:block;font-size:.91rem;font-weight:700;line-height:1.45;flex:1;min-width:0}
.nt-day{flex:none;font-size:.68rem;font-weight:700;padding:2px 10px;border-radius:999px;background:var(--chip);color:var(--ink-2)}
.nt.new .nt-day{background:#fdecea;color:var(--danger)}
.nt p{margin:3px 0 0;font-size:.85rem;color:var(--ink-2);line-height:1.6}
.nt time{display:block;margin-top:3px;font-size:.72rem;color:var(--muted)}
.nt a.go{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:.8rem;font-weight:600;color:var(--brand-d);
  background:var(--brand-l);padding:5px 13px;border-radius:999px;transition:.16s}
.nt a.go:hover{background:var(--brand);color:#fff}
.nt-note{text-align:center;color:var(--muted);font-size:.82rem;margin:18px 0 6px;
  display:flex;align-items:center;gap:9px;justify-content:center}
.nt-note i{color:var(--muted)}
@media(max-width:700px){ .nt{padding:13px;gap:11px;border-radius:15px} .nt .nic{width:36px;height:36px} .nt b{font-size:.92rem} }
CSS);

js_once('notices_seen', "function ccSeen(){if(document.querySelector('.nt-list')&&window.ccMarkNoticesSeen)window.ccMarkNoticesSeen();}document.addEventListener('spa:ready',ccSeen);ccSeen();");

$P = [
  'title' => 'নোটিশ বোর্ড | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'  => 'সর্বশেষ ঘোষণা ও জরুরি নোটিশ — চাকরি, ভর্তি ও পরীক্ষা সংক্রান্ত।',
  'canonical' => url('notices'),
  'nav' => 'notices',
];

function notice_day($dt): string
{
    $d = (int)floor((strtotime(date('Y-m-d')) - strtotime(date('Y-m-d', strtotime($dt)))) / 86400);
    if ($d <= 0) return 'আজ';
    if ($d === 1) return 'গতকাল';
    return bn($d) . ' দিন আগে';
}
?>
<div class="hero">
  <div class="hero-in">
    <span class="hero-ic"><i class="fa fa-bullhorn"></i></span>
    <div>
      <h1>নোটিশ বোর্ড</h1>
      <p>সর্বশেষ ঘোষণা ও জরুরি তথ্য</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-inbox"></i> মোট <?= bn(count($rows)) ?> টি</span>
    <?php if ($newN): ?><span><i class="fa fa-bell"></i> নতুন <?= bn($newN) ?> টি</span><?php endif; ?>
  </div>
</div>

<?php if (!$rows): ?>
  <div class="card empty"><i class="fa fa-bell-slash"></i>এখন কোনো নোটিশ নেই।</div>
<?php else: ?>
  <div class="nt-list">
    <?php foreach ($rows as $n): $new = (time() - strtotime($n['created_at'])) < 86400; ?>
      <div class="nt <?= $new ? 'new' : '' ?>">
        <span class="nic"><i class="fa <?= $new ? 'fa-bell' : 'fa-circle-info' ?>"></i></span>
        <div class="nt-body">
          <div class="nt-top">
            <b><?= e($n['title']) ?></b>
            <span class="nt-day"><?= e(notice_day($n['created_at'])) ?></span>
          </div>
          <?php if (!empty($n['body'])): ?><p><?= nl2br(e($n['body'])) ?></p><?php endif; ?>
          <?php if (!empty($n['link'])): ?>
            <a class="go" href="<?= e($n['link']) ?>">বিস্তারিত দেখুন <i class="fa fa-angle-left"></i></a>
          <?php endif; ?>
          <time><i class="fa fa-clock" style="margin-left:0;margin-right:5px"></i><?= e(bn_datetime($n['created_at'])) ?></time>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
