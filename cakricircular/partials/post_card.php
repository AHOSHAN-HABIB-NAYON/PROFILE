<?php
/* ===== একটি পোস্ট আইটেম (লিস্টে এক লাইনে একটি) — ব্যবহার: post_card($row); ===== */

function post_card_css(): void
{
    css_once('post_card', <<<CSS
.plist{display:grid;gap:10px;grid-template-columns:minmax(0,1fr)}

/* ===== প্রিমিয়াম পোস্ট: সোনালি চলন্ত বর্ডার ===== */
.pitem.prem{border-color:transparent;box-shadow:0 2px 5px rgba(170,125,20,.10),0 8px 22px rgba(170,125,20,.14)}
.pitem.prem::before{content:"";position:absolute;inset:0;border-radius:18px;padding:2px;pointer-events:none;z-index:2;
  background:linear-gradient(115deg,#f0d189,#c8921a,#fff6dd,#e3ad34,#a8720a,#ffeec2,#c8921a);
  background-size:320% 100%;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude;animation:goldrun 3.6s linear infinite}
@keyframes goldrun{to{background-position:320% 0}}
@supports not (mask-composite: exclude){ .pitem.prem{border:2px solid #d9a52c} .pitem.prem::before{display:none} }

/* ছবির নিচের ফাঁকা জায়গায় ভাসমান ব্যাজ — কার্ডের উচ্চতা বাড়ে না */
.pthumb{position:static;flex:none;display:block;width:88px;line-height:0}
.prem-tag{position:absolute;left:54px;bottom:10px;transform:translateX(-50%);z-index:3;white-space:nowrap;
  display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;overflow:hidden;
  background:linear-gradient(120deg,#c98410,#e6b445 45%,#a86a08);color:#fff;
  font-size:.58rem;font-weight:700;line-height:1.7;box-shadow:0 2px 6px rgba(180,110,10,.4)}
.prem-tag .cr{font-size:.62rem;line-height:1;position:relative;z-index:2}
.prem-tag::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);
  animation:premShine 2.8s ease-in-out infinite}
@keyframes premShine{0%,62%{left:-60%}88%,100%{left:130%}}
@media (prefers-reduced-motion: reduce){ .pitem.prem::before,.prem-tag::after{animation:none} }
.pitem{position:relative;cursor:pointer;display:flex;gap:12px;padding:11px;background:var(--card);border:1px solid var(--line-2);min-width:0;
  border-radius:18px;box-shadow:0 1px 2px rgba(16,40,36,.04),0 6px 18px rgba(16,40,36,.05);
  transition:border-color .18s,transform .18s,box-shadow .18s}
.pitem:hover{border-color:color-mix(in srgb,var(--brand) 30%,var(--line));box-shadow:0 12px 28px rgba(16,40,36,.1);transform:translateY(-1px)}
.pitem:active{transform:scale(.995)}

/* বাঁ পাশে লোগো/ছবি */
.pitem-thumb{display:block;width:88px;height:88px;flex:none;border-radius:14px;overflow:hidden;background:var(--soft);border:1px solid var(--line-2)}
.pitem-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .35s}
.pitem:hover .pitem-thumb img{transform:scale(1.04)}

.pitem-body{flex:1;min-width:0}

/* বাকি সময়ের ব্যাজ — ডানে ভাসে, তাই শিরোনামের ২য় লাইন পুরো চওড়া পায় */
.pdead{float:right;margin:0 0 3px 10px;display:inline-flex;align-items:center;gap:6px;
  padding:4px 11px 4px 4px;border-radius:999px;font-size:.73rem;font-weight:700;white-space:nowrap}
.pdead .dic{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;font-size:.58rem;color:#fff;flex:none}
.pdead.open{background:#e7f6ee;color:#0e6b40}
html[data-theme="dark"] .pdead.open{background:rgba(22,163,74,.15);color:#6ee7a0}
html[data-theme="dark"] .pdead.urgent{background:rgba(232,160,32,.15);color:#fbbf6a}
html[data-theme="dark"] .pdead.over{background:rgba(230,68,52,.15);color:#fca5a0}
.pdead.open .dic{background:#16a34a}
.pdead.urgent{background:#fdf2e2;color:#96580a}
.pdead.urgent .dic{background:#e8a020}
.pdead.over{background:#fdeceb;color:#c8352a}
.pdead.over .dic{background:#e64434}

/* শিরোনাম — ছোট, সর্বোচ্চ ২ লাইন */
.pitem-title{font-size:.9rem;font-weight:700;line-height:1.45;margin:0;color:var(--ink);letter-spacing:-.15px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pitem:hover .pitem-title{color:var(--brand)}

/* লোকেশন | সময় */
.pmeta{display:flex;align-items:center;flex-wrap:wrap;gap:3px 8px;font-size:.78rem;color:var(--muted);
  margin-top:5px;clear:both}
.pmeta i{margin-left:0;margin-right:5px;font-size:.76rem}
.pmeta .loc i{color:#e0493a}
.pmeta .tm i{color:var(--brand)}
.pmeta .dv{width:1px;height:12px;background:var(--line);display:inline-block}

/* ক্যাটাগরি + প্রতিষ্ঠান …… ডানে শেয়ার */
.prow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:7px;min-width:0}
.ptags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}
.ptag{display:inline-flex;align-items:center;padding:4px 12px;border-radius:999px;font-size:.74rem;font-weight:600;
  background:var(--brand-l);color:var(--brand-d);white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ptag.soft{background:var(--chip);color:var(--ink-2)}
.ptag i{margin-right:5px;font-size:.66rem;opacity:.8}

/* শেয়ার — সবুজ বৃত্তে সাদা আইকন */
.share-btn{position:relative;flex:none;width:34px;height:34px;border-radius:50%;border:0;color:#fff;
  background:linear-gradient(135deg,var(--brand),#22b49c);display:grid;place-items:center;font-size:.84rem;
  box-shadow:0 3px 10px rgba(15,118,110,.28);transition:transform .2s,box-shadow .2s}
.share-btn i{animation:shPulse 2.6s ease-in-out infinite}
.share-btn::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--brand);
  opacity:0;animation:shRing 2.6s ease-out infinite}
@keyframes shPulse{0%,72%,100%{transform:scale(1)}80%{transform:scale(1.16)}88%{transform:scale(.96)}}
@keyframes shRing{0%,60%{transform:scale(1);opacity:.4}100%{transform:scale(1.45);opacity:0}}
.share-btn:hover{transform:translateY(-2px);box-shadow:0 7px 18px rgba(15,118,110,.38)}
.share-btn:active{transform:scale(.9)}
@media (prefers-reduced-motion: reduce){ .share-btn i,.share-btn::after{animation:none} }

@media(max-width:700px){
  .pitem{padding:9px;gap:9px;border-radius:15px}
  .pitem-thumb{width:74px;height:74px;border-radius:12px}
  .pthumb{width:74px}
  .pitem-title{font-size:.84rem;line-height:1.4;max-height:2.8em}
  .pmeta{font-size:.71rem;margin-top:3px}
  .ptag{font-size:.67rem;padding:2px 10px;max-width:130px}
  .pdead{font-size:.65rem;padding:2px 8px 2px 2px;gap:4px;margin-left:7px}
  .pdead .dic{width:16px;height:16px;font-size:.5rem}
  .prow{margin-top:5px}
  .share-btn{width:30px;height:30px;font-size:.75rem}
  .prem-tag{font-size:.54rem;padding:1px 8px;left:46px;bottom:9px}
}
@media(max-width:380px){
  .pitem-thumb{width:66px;height:66px}
  .pthumb{width:66px}
  .prem-tag{left:42px}
  .pitem-title{font-size:.81rem}
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

    $dIcon = 'fa-clock';
    $dText = $d['text'];
    if ($d['state'] === 'over') { $dText = 'সময় শেষ'; $dIcon = 'fa-circle-xmark'; }
    elseif (strpos($d['text'], 'আজ') !== false) { $dText = 'আজ শেষ দিন'; $dIcon = 'fa-clock'; }
    elseif ($d['state'] !== 'none') {
        $days  = str_replace(['আবেদনের বাকি ', ' দিন'], ['', ''], $d['text']);
        $dText = 'আর ' . $days . ' দিন বাকি';
        $dIcon = 'fa-calendar-day';
    }
    ?>
    <?php $prem = is_premium($p); ?>
    <article class="pitem<?= $prem ? ' prem' : '' ?>" data-href="<?= e($url) ?>">
      <span class="pthumb">
        <a class="pitem-thumb" href="<?= e($url) ?>" aria-hidden="true" tabindex="-1">
          <img src="<?= e(img_url($p['thumb'] ?? null)) ?>" alt="" loading="lazy" decoding="async" width="88" height="88">
        </a>
        <?php if ($prem): ?>
          <span class="prem-tag"><span class="cr">👑</span>প্রিমিয়াম</span>
        <?php endif; ?>
      </span>
      <div class="pitem-body">
        <?php if ($d['state'] !== 'none'): ?>
          <span class="pdead <?= e($d['state']) ?>"><span class="dic"><i class="fa <?= e($dIcon) ?>"></i></span><?= e($dText) ?></span>
        <?php endif; ?>
        <a href="<?= e($url) ?>"><h3 class="pitem-title"><?= e($p['title']) ?></h3></a>

        <div class="pmeta">
          <?php if ($loc): ?>
            <span class="loc"><i class="fa fa-location-dot"></i><?= e($loc) ?></span>
            <span class="dv"></span>
          <?php endif; ?>
          <span class="tm"><i class="fa fa-clock"></i><?= e(time_ago($p['published_at'])) ?></span>
        </div>

        <div class="prow">
          <div class="ptags">
            <?php if (!empty($p['cat_name'])): ?><span class="ptag"><?= e($p['cat_name']) ?></span><?php endif; ?>
            <?php if ($company): ?><span class="ptag soft"><i class="fa fa-building"></i><?= e($company) ?></span><?php endif; ?>
          </div>
          <?= share_button($p['title'], $url, $p['cat_name'] ?? '') ?>
        </div>
      </div>
    </article>
    <?php
}
