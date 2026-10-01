<?php
/* ===== মোবাইল বটম মেনু (শুধু মোবাইলে) ===== */
css_once('bottomnav', <<<CSS
.bn{position:fixed;left:0;right:0;bottom:0;z-index:105;display:none;
  background:color-mix(in srgb,var(--card) 96%,transparent);backdrop-filter:blur(16px) saturate(1.6);
  border-top:1px solid var(--line);padding:5px 4px calc(5px + env(safe-area-inset-bottom));
  box-shadow:0 -8px 26px rgba(10,40,25,.08);border-radius:20px 20px 0 0}
.bn-in{display:flex;max-width:520px;margin:0 auto;position:relative}
.bn a,.bn button{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 0 2px;border:0;background:none;
  color:var(--muted);font:inherit;font-size:.66rem;font-weight:600;position:relative;transition:color .2s;letter-spacing:-.1px}
.bn .bn-ic{width:44px;height:28px;border-radius:999px;display:grid;place-items:center;font-size:1.02rem;
  transition:transform .3s cubic-bezier(.2,.9,.3,1.4),background .25s,color .25s}
.bn a.active{color:var(--brand)}
.bn a.active .bn-ic{background:var(--brand-l);color:var(--brand);transform:translateY(-1px)}
.bn a.active::before{content:"";position:absolute;top:-5px;left:50%;width:22px;height:3px;margin-left:-11px;border-radius:0 0 4px 4px;background:var(--brand)}
.bn a:active .bn-ic,.bn button:active .bn-ic{transform:scale(.86)}
.bn .badge{position:absolute;top:0;right:calc(50% - 20px);min-width:16px;height:16px;padding:0 4px;
  background:#ff3b30;color:#fff;border-radius:999px;font-size:.58rem;font-weight:700;
  display:none;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--card);z-index:2}
.bn .badge.on{display:flex;animation:pop .3s ease}
@media(max-width:700px){ .bn{display:block} }
CSS);
?>
<nav class="bn" id="bottomNav" aria-label="মোবাইল মেনু">
  <div class="bn-in">
    <a href="<?= e(url()) ?>" data-key="home"><span class="bn-ic"><i class="fa fa-house"></i></span>হোম</a>
    <a href="<?= e(url('categories')) ?>" data-key="categories"><span class="bn-ic"><i class="fa fa-table-cells-large"></i></span>ক্যাটাগরি</a>
    <a href="<?= e(url('search')) ?>" data-key="search"><span class="bn-ic"><i class="fa fa-magnifying-glass"></i></span>খুঁজুন</a>
    <a href="<?= e(url('notices')) ?>" data-key="notices"><span class="badge" id="noticeBadge" data-nbadge>০</span><span class="bn-ic"><i class="fa fa-bell"></i></span>নোটিশ</a>
    <button type="button" data-open-sb aria-label="আরও মেনু"><span class="bn-ic"><i class="fa fa-grip"></i></span>আরও</button>
  </div>
</nav>
