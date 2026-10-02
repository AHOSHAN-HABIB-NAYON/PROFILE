<?php
/** Floating AI assistant + live customer support chat widget. */
defined('APP') || exit;
$aiOn = setting_bool('ai.enabled');
$chatOn = setting_bool('live_chat.enabled');
if (!$aiOn && !$chatOn) return;
$u = user();
?>
<style>
.fab-ai{position:fixed;right:16px;bottom:calc(var(--bottom-h) + var(--safe-b) + 16px);z-index:85;width:58px;height:58px;border-radius:20px;border:0;cursor:pointer;color:#fff;
  background:linear-gradient(135deg,var(--primary),var(--secondary));box-shadow:0 10px 26px -8px color-mix(in srgb,var(--primary) 70%,transparent);display:grid;place-items:center;transition:transform .2s var(--ease)}
.fab-ai:hover{transform:translateY(-2px)}.fab-ai:active{transform:scale(.93)}
.fab-ai .robot{font-size:1.45rem;animation:robotFloat 3.2s ease-in-out infinite}
.fab-ai .robot-eye{position:absolute;top:22px;width:4px;height:4px;border-radius:50%;background:#fff;animation:blink 4s infinite}
.fab-ai .ai-tag{position:absolute;top:-6px;right:-6px;background:#fff;color:var(--primary);font-size:.62rem;font-weight:800;padding:2px 6px;border-radius:8px;box-shadow:var(--shadow);letter-spacing:.04em}
.fab-ai .ring{position:absolute;inset:-4px;border-radius:24px;border:2px solid var(--primary);opacity:0;animation:ring 2.8s ease-out infinite}
.fab-ai .chat-unread{position:absolute;bottom:-4px;left:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--danger);font-size:.68rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--card)}
@keyframes robotFloat{50%{transform:translateY(-3px)}}
@keyframes blink{0%,94%,100%{opacity:1}97%{opacity:0}}
@keyframes ring{0%{opacity:.6;transform:scale(.95)}80%,100%{opacity:0;transform:scale(1.25)}}
.ai-hint{position:fixed;right:84px;bottom:calc(var(--bottom-h) + var(--safe-b) + 26px);z-index:85;max-width:min(240px,62vw);background:var(--card);border:1px solid var(--border);border-radius:16px 16px 4px 16px;
  padding:10px 12px;font-size:.84rem;box-shadow:var(--shadow-lg);animation:toastIn .35s var(--ease);display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.ai-hint[hidden]{display:none}
.chat-panel{position:fixed;z-index:970;right:0;left:0;bottom:0;height:min(84vh,640px);background:var(--card);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;
  transform:translateY(105%);transition:transform .32s var(--ease);border:1px solid var(--border)}
.chat-panel.open{transform:none}
@media (min-width:640px){.chat-panel{left:auto;right:24px;bottom:24px;width:390px;border-radius:24px;transform:translateY(20px) scale(.97);opacity:0;pointer-events:none;transition:transform .28s var(--ease),opacity .2s}
  .chat-panel.open{transform:none;opacity:1;pointer-events:auto}}
.chat-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px;border-bottom:1px solid var(--border)}
.chat-head .tabs{margin:0;flex:1;padding:3px}
.chat-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.msg{max-width:84%;padding:9px 13px;border-radius:16px;font-size:.9rem;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;animation:msgIn .25s var(--ease)}
.msg.me{align-self:flex-end;background:var(--primary);color:#fff;border-bottom-right-radius:5px}
.msg.bot{align-self:flex-start;background:var(--soft);border-bottom-left-radius:5px}
.msg a{color:inherit;text-decoration:underline}
.msg .meta{display:block;font-size:.66rem;opacity:.7;margin-top:3px}
.msg.typing{display:flex;gap:4px;padding:12px 14px}.msg.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:typing 1.2s infinite}
.msg.typing i:nth-child(2){animation-delay:.15s}.msg.typing i:nth-child(3){animation-delay:.3s}
@keyframes typing{30%{transform:translateY(-4px);opacity:.5}}
@keyframes msgIn{from{opacity:0;transform:translateY(6px)}}
.chat-foot{padding:10px 12px calc(10px + var(--safe-b));border-top:1px solid var(--border)}
.chat-form{display:flex;gap:8px;align-items:flex-end}
.chat-form textarea{flex:1;min-height:44px;max-height:120px;resize:none;border-radius:14px;padding:11px 14px}
.chat-status{font-size:.74rem;color:var(--muted);display:flex;align-items:center;gap:6px;padding:0 14px 8px}
.chat-status .dot.off{background:var(--muted)}
.chat-suggest{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.chat-suggest button{font-size:.78rem;height:30px;padding:0 10px}
</style>
<button class="fab-ai" id="fab-ai" data-action="chat-open" aria-label="<?= e(t('chat.open')) ?>" aria-controls="chat-panel">
  <span class="ring"></span>
  <i class="fa-solid fa-robot robot"></i>
  <span class="ai-tag">AI</span>
  <span class="chat-unread" data-chat-unread hidden>0</span>
</button>
<div class="ai-hint" id="ai-hint" data-action="chat-open" hidden><i class="fa-solid fa-robot" style="color:var(--primary);margin-top:3px"></i><span></span></div>

<section class="chat-panel" id="chat-panel" role="dialog" aria-modal="false" aria-label="<?= e(t('chat.title')) ?>" hidden>
  <div class="chat-head">
    <div class="tabs" role="tablist">
      <?php if ($aiOn): ?><button class="tab active" data-action="chat-tab" data-tab="ai" role="tab"><i class="fa-solid fa-robot"></i> <?= e(t('chat.ai')) ?></button><?php endif ?>
      <?php if ($chatOn): ?><button class="tab <?= $aiOn ? '' : 'active' ?>" data-action="chat-tab" data-tab="support" role="tab"><i class="fa-solid fa-headset"></i> <?= e(t('chat.support')) ?></button><?php endif ?>
    </div>
    <button class="icon-btn" data-action="chat-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
  </div>

  <?php if ($aiOn): ?>
  <div class="chat-pane" data-pane="ai" style="display:flex;flex-direction:column;flex:1;min-height:0">
    <div class="chat-body" id="ai-body">
      <div class="msg bot"><?= e(t('chat.ai_welcome')) ?>
        <div class="chat-suggest">
          <button class="chip" data-action="ai-suggest"><?= e(t('chat.q_services')) ?></button>
          <button class="chip" data-action="ai-suggest"><?= e(t('chat.q_price')) ?></button>
          <button class="chip" data-action="ai-suggest"><?= e(t('chat.q_payment')) ?></button>
        </div>
      </div>
    </div>
    <div class="chat-foot">
      <form class="chat-form" id="ai-form" autocomplete="off">
        <textarea class="textarea" name="message" rows="1" maxlength="1000" placeholder="<?= e(t('chat.ask_placeholder')) ?>" aria-label="<?= e(t('chat.ask_placeholder')) ?>" required></textarea>
        <button class="btn" type="submit" aria-label="<?= e(t('chat.send')) ?>"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </div>
  </div>
  <?php endif ?>

  <?php if ($chatOn): ?>
  <div class="chat-pane" data-pane="support" style="display:<?= $aiOn ? 'none' : 'flex' ?>;flex-direction:column;flex:1;min-height:0">
    <div class="chat-status" id="support-status" style="padding-top:8px"><span class="dot off"></span><span></span></div>
    <div class="chat-body" id="support-body"></div>
    <div class="chat-foot">
      <?php if (!$u): ?>
      <div id="support-guest" class="stack" style="margin-bottom:8px">
        <div class="row"><input class="input" name="guest_name" placeholder="<?= e(t('form.name')) ?>" maxlength="120" aria-label="<?= e(t('form.name')) ?>">
        <input class="input" name="guest_email" type="email" placeholder="<?= e(t('form.email')) ?>" maxlength="191" aria-label="<?= e(t('form.email')) ?>"></div>
      </div>
      <?php endif ?>
      <form class="chat-form" id="support-form" autocomplete="off">
        <textarea class="textarea" name="message" rows="1" maxlength="2000" placeholder="<?= e(t('chat.support_placeholder')) ?>" aria-label="<?= e(t('chat.support_placeholder')) ?>" required></textarea>
        <button class="btn" type="submit" aria-label="<?= e(t('chat.send')) ?>"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </div>
  </div>
  <?php endif ?>
</section>
