<?php
/* ===== একটি পোস্ট আইটেম (লিস্টে এক লাইনে একটি) — ব্যবহার: post_card($row); ===== */

function post_card_css(): void
{
    css_once('post_card', <<<CSS
.plist{display:grid;gap:10px}

.pitem{position:relative;cursor:pointer;display:flex;gap:12px;padding:11px;background:var(--card);border:1px solid var(--line-2);
  border-radius:20px;box-shadow:var(--sh);transition:border-color .18s,transform .18s,box-shadow .18s}
.pitem:hover{border-color:color-mix(in srgb,var(--brand) 35%,var(--line));box-shadow:0 12px 30px rgba(10,40,25,.1)}
.pitem:active{transform:scale(.995)}

/* ===== প্রিমিয়াম পোস্ট: সোনালি চলন্ত বর্ডার ===== */
.pitem.prem{border-color:transparent;box-shadow:0 2px 5px rgba(170,125,20,.10),0 8px 22px rgba(170,125,20,.14)}
.pitem.prem::before{content:"";position:absolute;inset:0;border-radius:20px;padding:2px;pointer-events:none;z-index:2;
  background:linear-gradient(115deg,#f0d189,#c8921a,#fff6dd,#e3ad34,#a8720a,#ffeec2,#c8921a);
  background-size:320% 100%;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude;animation:goldrun 3.6s linear infinite}
@keyframes goldrun{to{background-position:320% 0}}
@supports not (mask-composite: exclude){ .pitem.prem{border:2px solid #d9a52c} .pitem.prem::before{display:none} }

/* বাঁ পাশে লোগো/ছবি */
.pthumb{position:relative;flex:none;display:block;width:84px;line-height:0;align-self:flex-start}
.pitem-thumb{display:block;width:84px;height:84px;flex:none;border-radius:18px;overflow:hidden;background:var(--soft);
  border:1px solid var(--line-2)}
.pitem-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .35s}
.pitem:hover .pitem-thumb img{transform:scale(1.05)}
.prem-tag{position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);z-index:3;white-space:nowrap;
  display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;overflow:hidden;
  background:linear-gradient(120deg,#c98410,#e6b445 45%,#a86a08);color:#fff;
  font-size:.58rem;font-weight:700;line-height:1.7;box-shadow:0 2px 6px rgba(180,110,10,.4)}
.prem-tag .cr{font-size:.62rem;line-height:1;position:relative;z-index:2}
.prem-tag::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);
  animation:premShine 2.8s ease-in-out infinite}
@keyframes premShine{0%,62%{left:-60%}88%,100%{left:130%}}
@media (prefers-reduced-motion: reduce){ .pitem.prem::before,.prem-tag::after{animation:none} }

.pitem-body{flex:1;min-width:0;display:flex;flex-direction:column}

/* উপরের সারি: প্রতিষ্ঠান …… ক্যাটাগরি */
.ptop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;min-height:20px}
.porg{display:inline-flex;align-items:center;gap:5px;min-width:0;font-size:.72rem;font-weight:600;color:var(--muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.porg i{font-size:.66rem;color:var(--brand)}
.pcat{flex:none;display:inline-flex;align-items:center;padding:1px 10px;border-radius:999px;font-size:.68rem;font-weight:700;
  background:var(--tl,#e7f6ee);color:var(--t2,#075c33);white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;line-height:1.8}
html[data-theme="dark"] .pcat{color:var(--t1,#5fd696)}

/* শিরোনাম — সর্বোচ্চ ২ লাইন */
.pitem-title{font-size:.94rem;font-weight:700;line-height:1.45;margin:0;color:var(--ink);letter-spacing:-.15px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pitem:hover .pitem-title{color:var(--brand)}

/* লোকেশন · সময় */
.pmeta{display:flex;align-items:center;flex-wrap:wrap;gap:3px 9px;font-size:.76rem;color:var(--muted);margin-top:4px}
.pmeta i{margin-right:5px;font-size:.72rem}
.pmeta .loc i{color:#e0493a}
.pmeta .tm i{color:var(--brand)}
.pmeta .dv{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.5;display:inline-block}

/* নিচের সারি: ডেডলাইন …… শেয়ার */
.prow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:7px}
.pdead{display:inline-flex;align-items:center;gap:6px;padding:3px 11px 3px 4px;border-radius:999px;
  font-size:.72rem;font-weight:700;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.pdead .dic{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;font-size:.56rem;color:#fff;flex:none}
.pdead.open{background:#e6f6ec;color:#0c6b3a}
.pdead.open .dic{background:#16a34a}
.pdead.urgent{background:#fef1e1;color:#a5580a}
.pdead.urgent .dic{background:#f08c12}
.pdead.over{background:#fdeceb;color:#c8352a}
.pdead.over .dic{background:#e64434}
html[data-theme="dark"] .pdead.open{background:rgba(22,163,74,.14);color:#6ee7a0}
html[data-theme="dark"] .pdead.urgent{background:rgba(240,140,18,.14);color:#fbbf6a}
html[data-theme="dark"] .pdead.over{background:rgba(230,68,52,.14);color:#fca5a0}
.pdead.none{background:var(--chip);color:var(--muted);padding-left:11px}

/* শেয়ার বাটন */
.share-btn{position:relative;flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--line);color:var(--brand);
  background:var(--card);display:grid;place-items:center;font-size:.8rem;transition:transform .2s,background .2s,color .2s}
.share-btn:hover{background:var(--brand);border-color:var(--brand);color:#fff;transform:translateY(-2px)}
.share-btn:active{transform:scale(.9)}

@media(max-width:700px){
  .pitem{padding:10px;gap:10px;border-radius:18px}
  .pitem-thumb{width:72px;height:72px;border-radius:16px}
  .pthumb{width:72px}
  .pitem-title{font-size:.87rem;line-height:1.42}
  .pmeta{font-size:.7rem;margin-top:3px}
  .pcat{font-size:.63rem;padding:0 9px;max-width:110px}
  .porg{font-size:.67rem}
  .pdead{font-size:.65rem;padding:2px 9px 2px 3px;gap:4px}
  .pdead .dic{width:16px;height:16px;font-size:.5rem}
  .prow{padding-top:6px}
  .share-btn{width:29px;height:29px;font-size:.72rem}
  .prem-tag{font-size:.54rem;padding:1px 8px}
}
@media(max-width:380px){
  .pitem-thumb{width:62px;height:62px}
  .pthumb{width:62px}
  .pitem-title{font-size:.83rem}
}
CSS);
}

/* ক্যাটাগরির রঙ — একই ক্যাটাগরি সবসময় একই রঙে */
function cat_tone(?string $key): int
{
    $key = (string)$key;
    if ($key === '') return 1;
    foreach (categories() as $i => $c) {
        if ($c['slug'] === $key || $c['name'] === $key) return ($i % 6) + 1;
    }
    return (crc32($key) % 6) + 1;
}

function post_card(array $p): void
{
    post_card_css();
    $d   = deadline_info($p['deadline'] ?? null);
    $url = post_url($p);
    $loc = trim((string)($p['district'] ?? '')) ?: trim((string)($p['division'] ?? ''));
    $company = trim((string)($p['company'] ?? ''));

    $dIcon = 'fa-calendar-day';
    $dText = $d['text'];
    if ($d['state'] === 'over') { $dText = 'সময় শেষ'; $dIcon = 'fa-xmark'; }
    elseif (strpos($d['text'], 'আজ') !== false) { $dText = 'আজই শেষ দিন'; $dIcon = 'fa-hourglass-end'; }
    elseif ($d['state'] === 'urgent') {
        $days  = str_replace(['আবেদনের বাকি ', ' দিন'], ['', ''], $d['text']);
        $dText = 'আর ' . $days . ' দিন বাকি';
        $dIcon = 'fa-hourglass-half';
    } elseif ($d['state'] === 'open') {
        $dText = 'শেষ: ' . bn_date($p['deadline']);
        $dIcon = 'fa-calendar-check';
    }
    $prem = is_premium($p);
    $tone = cat_tone($p['cat_slug'] ?? ($p['cat_name'] ?? ''));
    ?>
    <article class="pitem<?= $prem ? ' prem' : '' ?>" data-href="<?= e($url) ?>">
      <span class="pthumb">
        <a class="pitem-thumb" href="<?= e($url) ?>" aria-hidden="true" tabindex="-1">
          <img src="<?= e(img_url($p['thumb'] ?? null)) ?>" alt="" loading="lazy" decoding="async" width="84" height="84">
        </a>
        <?php if ($prem): ?>
          <span class="prem-tag"><span class="cr">👑</span>প্রিমিয়াম</span>
        <?php endif; ?>
      </span>
      <div class="pitem-body">
        <div class="ptop">
          <span class="porg"><?php if ($company): ?><i class="fa fa-building"></i><?= e($company) ?><?php endif; ?></span>
          <?php if (!empty($p['cat_name'])): ?><span class="pcat tone-<?= $tone ?>"><?= e($p['cat_name']) ?></span><?php endif; ?>
        </div>
        <a href="<?= e($url) ?>"><h3 class="pitem-title"><?= e($p['title']) ?></h3></a>

        <div class="pmeta">
          <?php if ($loc): ?>
            <span class="loc"><i class="fa fa-location-dot"></i><?= e($loc) ?></span>
            <span class="dv"></span>
          <?php endif; ?>
          <span class="tm"><i class="fa fa-clock"></i><?= e(time_ago($p['published_at'])) ?></span>
        </div>

        <div class="prow">
          <?php if ($d['state'] !== 'none'): ?>
            <span class="pdead <?= e($d['state']) ?>"><span class="dic"><i class="fa <?= e($dIcon) ?>"></i></span><?= e($dText) ?></span>
          <?php else: ?>
            <span class="pdead none"><i class="fa fa-newspaper" style="margin-right:6px"></i>বিস্তারিত দেখুন</span>
          <?php endif; ?>
          <?= share_button($p['title'], $url, $p['cat_name'] ?? '') ?>
        </div>
      </div>
    </article>
    <?php
}
