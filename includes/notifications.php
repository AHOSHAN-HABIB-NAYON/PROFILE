<?php
/**
 * Global overlays shared by every layout: toast stack, flash messages,
 * instant search sheet and the back-to-top button.
 */
defined('APP') || exit;
$flashes = flash('get') ?? [];
?>
<style>
.search-sheet{position:fixed;inset:0;z-index:960;display:none;background:rgba(10,16,32,.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.search-sheet.open{display:block;animation:fadeIn .18s ease}
.search-panel{background:var(--card);max-width:640px;margin:0 auto;border-radius:0 0 22px 22px;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 14px;box-shadow:var(--shadow-lg);animation:slideDown .25s var(--ease)}
@media (min-width:640px){.search-panel{margin-top:70px;border-radius:22px}}
.search-input{display:flex;align-items:center;gap:8px}
.search-input .input{border-radius:14px;height:48px;font-size:1rem}
.search-results{max-height:62vh;overflow-y:auto;margin-top:10px}
.sr-group{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;margin:12px 6px 6px}
.sr-item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;color:var(--text)}
.sr-item:hover,.sr-item.focus{background:var(--soft)}
@keyframes fadeIn{from{opacity:0}}@keyframes slideDown{from{transform:translateY(-14px);opacity:0}}
.to-top{position:fixed;right:18px;bottom:calc(var(--bottom-h) + var(--safe-b) + 84px);z-index:80;width:42px;height:42px;border-radius:14px;border:1px solid var(--border);background:var(--card);color:var(--text);
  box-shadow:var(--shadow);display:grid;place-items:center;cursor:pointer;opacity:0;transform:translateY(12px) scale(.9);pointer-events:none;transition:opacity .25s,transform .3s var(--ease)}
.to-top.show{opacity:1;transform:none;pointer-events:auto}
.to-top:active{transform:scale(.9)}
.to-top.launch i{animation:launch .6s var(--ease)}
@keyframes launch{40%{transform:translateY(-8px)}100%{transform:none}}
@media (min-width:1024px){.to-top{bottom:96px;right:28px}}
.offline-bar{position:fixed;left:50%;bottom:calc(var(--bottom-h) + var(--safe-b) + 12px);transform:translateX(-50%);z-index:950;background:#13203a;color:#fff;font-size:.82rem;padding:8px 14px;border-radius:999px;display:none;box-shadow:var(--shadow-lg)}
.offline-bar.show{display:flex;gap:8px;align-items:center}
</style>
<div class="toast-stack" id="toast-stack" role="status" aria-live="polite"></div>
<?php if ($flashes): ?><script type="application/json" id="flash-data"><?= json_encode($flashes, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script><?php endif ?>

<div class="search-sheet" id="search-sheet" role="dialog" aria-modal="true" aria-label="<?= e(t('search.title')) ?>">
  <div class="search-panel">
    <div class="search-input">
      <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" class="input" id="search-input" placeholder="<?= e(t('search.placeholder')) ?>" autocomplete="off" enterkeyhint="search" aria-label="<?= e(t('search.placeholder')) ?>">
      </div>
      <button class="btn btn-ghost btn-sm" data-action="search-close"><?= e(t('common.cancel')) ?></button>
    </div>
    <div class="search-results" id="search-results"><p class="muted small center mt-2"><?= e(t('search.hint')) ?></p></div>
  </div>
</div>

<button class="to-top" id="to-top" data-action="to-top" aria-label="<?= e(t('common.back_to_top')) ?>"><i class="fa-solid fa-arrow-up"></i></button>
<div class="offline-bar" id="offline-bar"><i class="fa-solid fa-wifi"></i><?= e(t('js.offline')) ?></div>
