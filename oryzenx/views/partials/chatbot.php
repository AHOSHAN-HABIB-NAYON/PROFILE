<?php $wa = preg_replace('/\D/', '', setting('contact_whatsapp')); ?>
<div class="fab-stack">
    <button class="fab fab-top" type="button" data-action="scroll-top" aria-label="<?= e(t('common.back_to_top')) ?>" hidden><i class="fa-solid fa-arrow-up"></i></button>
    <?php if (setting('ai_enabled') === '1'): ?>
    <div class="chat-greet" data-chat-greet hidden role="status">
        <button type="button" class="chat-greet-x" data-action="greet-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
        <strong>👋 <?= e(t('chat.greet_title')) ?></strong><span><?= e(t('chat.greet_text')) ?></span>
    </div>
    <button class="fab fab-chat" type="button" data-action="chat-toggle" aria-label="<?= e(t('chat.title')) ?>" aria-controls="chat-panel" aria-expanded="false">
        <i class="fa-solid fa-robot fab-ic-open"></i><i class="fa-solid fa-xmark fab-ic-close"></i><span class="fab-badge">AI</span>
    </button>
    <?php endif; ?>
</div>
<?php if (setting('ai_enabled') === '1'): ?>
<section class="chat-panel" id="chat-panel" hidden aria-label="<?= e(t('chat.title')) ?>">
    <header class="chat-head">
        <span class="chat-avatar"><i class="fa-solid fa-robot"></i><span class="online-dot"></span></span>
        <div class="chat-meta"><strong><?= e(setting('site_name')) ?> AI</strong><small><?= e(t('chat.online')) ?></small></div>
        <?php if ($wa): ?><a class="chat-hbtn chat-human" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener" data-no-spa aria-label="<?= e(t('chat.human')) ?>" title="<?= e(t('chat.human')) ?>"><i class="fa-solid fa-headset"></i></a><?php endif; ?>
        <button class="chat-hbtn" type="button" data-action="chat-clear" aria-label="<?= e(t('chat.clear')) ?>" title="<?= e(t('chat.clear')) ?>"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="chat-hbtn" type="button" data-action="chat-close" aria-label="<?= e(t('common.close')) ?>"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="chat-body" data-chat-body aria-live="polite">
        <div class="msg msg-bot"><div class="bubble"><?= e(t('chat.welcome')) ?></div></div>
    </div>
    <div class="chat-quick" data-chat-quick>
        <?php foreach (['chat.q_services', 'chat.q_price', 'chat.q_payment', 'chat.q_human'] as $q): ?>
            <button type="button" class="chip" data-action="chat-quick"><?= e(t($q)) ?></button>
        <?php endforeach; ?>
    </div>
    <form class="chat-form" data-chat-form autocomplete="off">
        <label class="sr-only" for="chat-input"><?= e(t('chat.placeholder')) ?></label>
        <input id="chat-input" name="message" maxlength="1000" placeholder="<?= e(t('chat.placeholder')) ?>" required>
        <button class="chat-send" type="submit" aria-label="<?= e(t('chat.send')) ?>"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
</section>
<?php endif; ?>
