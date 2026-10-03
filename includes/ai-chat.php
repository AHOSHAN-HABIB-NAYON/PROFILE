<?php
/** Floating AI assistant + live customer support chat widget. */
defined('APP') || exit;
$aiOn = setting_bool('ai.enabled');
$chatOn = setting_bool('live_chat.enabled');
if (!$aiOn && !$chatOn) return;
$u = user();
$siteName = (string)setting('site_name');
?>
<style>
.fab-ai{position:fixed;right:16px;bottom:calc(var(--bottom-h) + var(--safe-b) + 14px);z-index:85;width:60px;height:60px;border-radius:20px;border:0;cursor:pointer;color:#fff;
  background:linear-gradient(145deg,var(--primary),var(--primary-dark));box-shadow:0 14px 30px -10px color-mix(in srgb,var(--primary) 80%,transparent),inset 0 1px 0 rgba(255,255,255,.25);display:grid;place-items:center;transition:transform .2s var(--ease)}
.fab-ai:hover{transform:translateY(-2px)}.fab-ai:active{transform:scale(.93)}
.fab-ai .robot{font-size:1.55rem;animation:robotFloat 3.2s ease-in-out infinite}
.fab-ai .ai-tag{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#1f1300;font-size:.66rem;font-weight:800;display:grid;place-items:center;border:2.5px solid var(--card);box-shadow:0 4px 10px -4px rgba(0,0,0,.4)}
.fab-ai .ring{position:absolute;inset:-5px;border-radius:24px;border:2px solid var(--primary);opacity:0;animation:ring 3s ease-out infinite}
.fab-ai .chat-unread{position:absolute;bottom:-6px;left:-6px;min-width:20px;height:20px;border-radius:10px;background:var(--danger);font-size:.68rem;font-weight:800;display:grid;place-items:center;border:2px solid var(--card)}
@keyframes robotFloat{50%{transform:translateY(-3px)}}
@keyframes ring{0%{opacity:.55;transform:scale(.95)}80%,100%{opacity:0;transform:scale(1.22)}}
@media (min-width:1024px){.fab-ai{bottom:24px;right:28px}}
.ai-hint{position:fixed;right:88px;bottom:calc(var(--bottom-h) + var(--safe-b) + 24px);z-index:85;max-width:min(250px,62vw);background:var(--card);border:1px solid var(--line);border-radius:18px 18px 6px 18px;
  padding:11px 13px;font-size:.86rem;font-weight:600;box-shadow:var(--shadow-lg);animation:toastIn .35s var(--ease);display:flex;gap:9px;align-items:flex-start;cursor:pointer}
@media (min-width:1024px){.ai-hint{bottom:34px;right:100px}}

.chat-panel{position:fixed;z-index:970;inset:auto 0 0 0;height:min(88vh,700px);height:min(88dvh,700px);background:var(--bg);border-radius:28px 28px 0 0;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;overflow:hidden;
  transform:translateY(105%);transition:transform .34s var(--ease)}
.chat-panel.open{transform:none}
@media (min-width:640px){.chat-panel{left:auto;right:24px;bottom:24px;width:410px;height:min(680px,calc(100vh - 48px));border-radius:28px;border:1px solid var(--line);transform:translateY(20px) scale(.97);opacity:0;pointer-events:none;transition:transform .28s var(--ease),opacity .2s}
  .chat-panel.open{transform:none;opacity:1;pointer-events:auto}}
.cp-head{position:relative;padding:16px 16px 14px;color:#fff;background:radial-gradient(120% 160% at 100% 0%,color-mix(in srgb,var(--primary) 80%,#000),transparent 60%),linear-gradient(140deg,var(--navy),var(--primary));overflow:hidden}
.cp-head::after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;border:26px solid rgba(255,255,255,.06);right:-60px;top:-80px}
.cp-top{display:flex;align-items:center;gap:12px;position:relative;z-index:1}
.cp-av{width:46px;height:46px;border-radius:15px;background:#fff;color:var(--primary);display:grid;place-items:center;font-size:1.35rem;flex:0 0 46px;box-shadow:0 8px 18px -10px rgba(0,0,0,.5);position:relative}
.cp-av::after{content:"";position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:50%;background:#22c55e;border:2.5px solid #fff}
.cp-title{font-weight:800;font-size:1.04rem;line-height:1.2}
.cp-sub{font-size:.78rem;opacity:.85;font-weight:600;display:flex;align-items:center;gap:6px}
.cp-close{margin-left:auto;width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;cursor:pointer}
.cp-tabs{display:flex;gap:4px;margin-top:14px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);padding:4px;border-radius:15px;position:relative;z-index:1}
.cp-tabs button{flex:1;height:36px;border:0;border-radius:11px;background:transparent;color:#fff;font-weight:700;font-size:.86rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;opacity:.85}
.cp-tabs button.active{background:#fff;color:var(--primary);opacity:1;box-shadow:0 4px 12px -6px rgba(0,0,0,.4)}
.chat-pane{display:flex;flex-direction:column;flex:1;min-height:0}
.chat-body{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.msg-row{display:flex;gap:8px;align-items:flex-end;max-width:92%;animation:msgIn .25s var(--ease)}
.msg-row.me{align-self:flex-end;flex-direction:row-reverse}
.msg-av{width:28px;height:28px;border-radius:9px;background:linear-gradient(145deg,var(--primary),var(--primary-dark));color:#fff;display:grid;place-items:center;font-size:.78rem;flex:0 0 28px}
.msg{padding:10px 14px;border-radius:18px;font-size:.92rem;line-height:1.6;word-wrap:break-word;min-width:0}
.msg-row.me .msg{background:var(--primary);color:#fff;border-bottom-right-radius:6px;box-shadow:var(--shadow-btn)}
.msg-row.bot .msg{background:var(--card);border:1px solid var(--line);border-bottom-left-radius:6px;box-shadow:var(--shadow-sm)}
.msg a{color:inherit;text-decoration:underline;font-weight:700}
.msg-row.bot .msg a{color:var(--primary)}
.msg .meta{display:block;font-size:.66rem;opacity:.7;margin-top:3px;font-weight:600}
.msg.typing{display:flex;gap:4px;padding:13px 15px}.msg.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:typing 1.2s infinite}
.msg.typing i:nth-child(2){animation-delay:.15s}.msg.typing i:nth-child(3){animation-delay:.3s}
@keyframes typing{30%{transform:translateY(-4px);opacity:.5}}
@keyframes msgIn{from{opacity:0;transform:translateY(6px)}}
.ai-cards{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.ai-card{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:var(--soft);border:1px solid var(--line);color:var(--text)!important;text-decoration:none!important}
.ai-card:hover{border-color:var(--primary)}
.ai-card .icon-box{width:36px;height:36px;flex-basis:36px;border-radius:11px;font-size:.9rem;background:var(--card)}
.ai-card b{display:block;font-size:.86rem;line-height:1.3}.ai-card small{display:block;font-size:.74rem;color:var(--muted);font-weight:500}
.ai-card .pr{margin-left:auto;font-weight:800;color:var(--primary);font-size:.8rem;white-space:nowrap;text-align:right}
.ai-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 4px 36px}
.ai-chips button{height:34px;padding:0 13px;border-radius:999px;border:1.5px solid color-mix(in srgb,var(--primary) 30%,var(--border));background:var(--card);color:var(--primary);font-weight:700;font-size:.8rem;cursor:pointer}
.ai-chips button:hover{background:var(--primary);color:#fff}
.chat-foot{padding:10px 12px calc(12px + var(--safe-b));background:var(--card);border-top:1px solid var(--line)}
.chat-form{display:flex;gap:8px;align-items:flex-end;background:var(--soft);border:1.5px solid var(--border);border-radius:20px;padding:5px 5px 5px 14px;transition:border-color .15s}
.chat-form:focus-within{border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-soft)}
.chat-form textarea{flex:1;min-height:40px;max-height:120px;resize:none;border:0;background:transparent;padding:9px 0;outline:none;font-size:.93rem;line-height:1.45}
.chat-form .send{width:42px;height:42px;border-radius:15px;border:0;background:var(--primary);color:#fff;display:grid;place-items:center;cursor:pointer;flex:0 0 42px;box-shadow:var(--shadow-btn)}
.chat-form .send.loading{opacity:.6}
.chat-status{font-size:.76rem;color:var(--muted);display:flex;align-items:center;gap:6px;padding:10px 16px 0;font-weight:600}
.chat-status .dot.off{background:var(--muted)}
.chat-guest{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.chat-guest .input{min-height:42px;border-radius:13px;font-size:.88rem}
.chat-powered{text-align:center;font-size:.68rem;color:var(--muted);margin-top:6px;font-weight:600}
</style>
<button class="fab-ai" id="fab-ai" data-action="chat-open" aria-label="<?= e(t('chat.open')) ?>" aria-controls="chat-panel">
  <span class="ring"></span>
  <i class="fa-solid fa-robot robot"></i>
  <span class="ai-tag">AI</span>
  <span class="chat-unread" data-chat-unread hidden>0</span>
</button>
<div class="ai-hint" id="ai-hint" data-action="chat-open" hidden><i class="fa-solid fa-robot" style="color:var(--primary);margin-top:3px"></i><span></span></div>

<section class="chat-panel" id="chat-panel" role="dialog" aria-modal="false" aria-label="<?= e(t('chat.title')) ?>" hidden>
  <header class="cp-head">
    <div class="cp-top">
      <span class="cp-av"><i class="fa-solid fa-robot"></i></span>
      <div class="grow" style="min-width:0">
        <div class="cp-title truncate"><?= e(t('chat.assistant_name', ['site' => $siteName])) ?></div>
        <div class="cp-sub"><span class="dot"></span><?= e(t('chat.online')) ?></div>
      </div>
      <button class="cp-close" data-action="chat-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <?php if ($aiOn && $chatOn): ?>
    <div class="cp-tabs chat-head" role="tablist">
      <button class="tab active" data-action="chat-tab" data-tab="ai" role="tab"><i class="fa-solid fa-robot"></i><?= e(t('chat.ai')) ?></button>
      <button class="tab" data-action="chat-tab" data-tab="support" role="tab"><i class="fa-solid fa-headset"></i><?= e(t('chat.support')) ?></button>
    </div>
    <?php else: ?>
    <div class="chat-head" hidden><button class="tab active" data-tab="<?= $aiOn ? 'ai' : 'support' ?>"></button></div>
    <?php endif ?>
  </header>

  <?php if ($aiOn): ?>
  <div class="chat-pane" data-pane="ai">
    <div class="chat-body" id="ai-body"></div>
    <div class="chat-foot">
      <form class="chat-form" id="ai-form" autocomplete="off">
        <textarea name="message" rows="1" maxlength="1000" placeholder="<?= e(t('chat.ask_placeholder')) ?>" aria-label="<?= e(t('chat.ask_placeholder')) ?>" required></textarea>
        <button class="send" type="submit" aria-label="<?= e(t('chat.send')) ?>"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
      <div class="chat-powered"><i class="fa-solid fa-bolt"></i> <?= e(t('chat.instant')) ?></div>
    </div>
  </div>
  <?php endif ?>

  <?php if ($chatOn): ?>
  <div class="chat-pane" data-pane="support" style="display:<?= $aiOn ? 'none' : 'flex' ?>">
    <div class="chat-status" id="support-status"><span class="dot off"></span><span></span></div>
    <div class="chat-body" id="support-body"></div>
    <div class="chat-foot">
      <?php if (!$u): ?>
      <div id="support-guest" class="chat-guest">
        <input class="input" name="guest_name" placeholder="<?= e(t('form.name')) ?>" maxlength="120" aria-label="<?= e(t('form.name')) ?>">
        <input class="input" name="guest_email" type="email" placeholder="<?= e(t('form.email')) ?>" maxlength="191" aria-label="<?= e(t('form.email')) ?>">
      </div>
      <?php endif ?>
      <form class="chat-form" id="support-form" autocomplete="off">
        <textarea name="message" rows="1" maxlength="2000" placeholder="<?= e(t('chat.support_placeholder')) ?>" aria-label="<?= e(t('chat.support_placeholder')) ?>" required></textarea>
        <button class="send" type="submit" aria-label="<?= e(t('chat.send')) ?>"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </div>
  </div>
  <?php endif ?>
</section>
