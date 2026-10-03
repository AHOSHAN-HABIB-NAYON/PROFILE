<?php if (setting('ai_enabled') === '1'): ?>
<div class="fab-stack">
    <button class="fab fab-top" type="button" data-action="scroll-top" aria-label="<?= e(t('common.back_to_top')) ?>" hidden><i class="fa-solid fa-arrow-up"></i></button>
    <div class="chat-greet" data-chat-greet hidden role="status">
        <button type="button" class="chat-greet-x" data-action="greet-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
        <strong>👋 <?= e(t('chat.greet_title')) ?></strong><span><?= e(t('chat.greet_text')) ?></span>
    </div>
    <button class="fab fab-chat" type="button" data-action="chat-toggle" aria-label="<?= e(t('chat.title')) ?>" aria-controls="chat-panel" aria-expanded="false">
        <i class="fa-solid fa-robot"></i><span class="fab-badge">AI</span>
    </button>
</div>
<section class="chat-panel" id="chat-panel" hidden aria-label="<?= e(t('chat.title')) ?>">
    <header class="chat-head">
        <span class="chat-avatar"><i class="fa-solid fa-robot"></i></span>
        <div class="chat-meta"><strong><?= e(setting('site_name')) ?> AI</strong><small><span class="online-dot"></span><?= e(t('chat.online')) ?></small></div>
        <button class="icon-btn icon-btn-sm" type="button" data-action="chat-clear" aria-label="<?= e(t('chat.clear')) ?>" title="<?= e(t('chat.clear')) ?>"><i class="fa-solid fa-broom"></i></button>
        <button class="icon-btn icon-btn-sm" type="button" data-action="chat-min" aria-label="<?= e(t('chat.minimize')) ?>" title="<?= e(t('chat.minimize')) ?>"><i class="fa-solid fa-minus"></i></button>
        <button class="icon-btn icon-btn-sm" type="button" data-action="chat-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="chat-body" data-chat-body aria-live="polite">
        <div class="msg msg-bot"><div class="bubble"><?= e(t('chat.welcome')) ?></div></div>
    </div>
    <div class="chat-quick" data-chat-quick>
        <?php foreach (['chat.q_services', 'chat.q_price', 'chat.q_payment', 'chat.q_contact'] as $q): ?>
            <button type="button" class="chip" data-action="chat-quick"><?= e(t($q)) ?></button>
        <?php endforeach; ?>
    </div>
    <form class="chat-form" data-chat-form autocomplete="off">
        <label class="sr-only" for="chat-input"><?= e(t('chat.placeholder')) ?></label>
        <input id="chat-input" name="message" maxlength="1000" placeholder="<?= e(t('chat.placeholder')) ?>" required>
        <button class="icon-btn icon-btn-primary" type="submit" aria-label="<?= e(t('chat.send')) ?>"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
</section>
<?php else: ?>
<div class="fab-stack"><button class="fab fab-top" type="button" data-action="scroll-top" aria-label="<?= e(t('common.back_to_top')) ?>" hidden><i class="fa-solid fa-arrow-up"></i></button></div>
<?php endif; ?>
