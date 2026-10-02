<?php
/** Admin: AI assistant — settings, live test, usage and recent conversations. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
require_once ROOT . '/core/ai.php';
meta(['title' => 'AI Assistant']);

$def = settings_schema()['ai'];
$stats = row("SELECT COUNT(*) total, SUM(created_at > NOW() - INTERVAL 1 DAY) today, COUNT(DISTINCT visitor_hash) visitors, COALESCE(SUM(tokens),0) tokens
              FROM ai_conversations WHERE role = 'assistant' AND created_at > NOW() - INTERVAL 30 DAY");
$recent = rows("SELECT * FROM ai_conversations ORDER BY id DESC LIMIT 30");
?>
<div class="page">
  <div class="adm-title"><h1>AI Assistant</h1><span class="badge <?= ai_ready() ? 'success' : 'warning' ?>"><?= ai_ready() ? 'Ready' : 'Not configured' ?></span></div>
  <div class="stat-grid mb-2">
    <?php foreach ([['Replies (30d)', $stats['total'], 'fa-robot'], ['Replies today', $stats['today'], 'fa-calendar-day'], ['Visitors helped', $stats['visitors'], 'fa-users'], ['Tokens (30d)', $stats['tokens'], 'fa-coins']] as [$l, $v, $i]): ?>
      <div class="card stat-card"><span class="icon-box sm secondary"><i class="fa-solid <?= $i ?>"></i></span><div><div class="v"><?= number_format((int)$v) ?></div><div class="l"><?= $l ?></div></div></div>
    <?php endforeach ?>
  </div>
  <div class="grid-2">
    <form class="card card-pad-lg" method="post" action="<?= e(url('/api/admin?action=settings_save')) ?>" data-ajax novalidate>
      <input type="hidden" name="__tab" value="ai">
      <h2 style="font-size:1rem">Configuration</h2>
      <div class="form-grid" style="grid-template-columns:1fr"><?php foreach ($def['fields'] as $key => $f) echo admin_field($key, $f, setting($key)); ?></div>
      <div class="form-actions"><button class="btn" type="submit"><i class="fa-solid fa-floppy-disk"></i>Save</button></div>
    </form>
    <div class="stack">
      <section class="card card-pad-lg">
        <h2 style="font-size:1rem">Test the assistant</h2>
        <p class="muted small">Sends a real request with the saved settings and the live site knowledge (services, prices, payment methods, contact, FAQ, latest news).</p>
        <form method="post" action="<?= e(url('/api/admin?action=ai_test')) ?>" data-ajax data-init="ai-test" novalidate>
          <textarea class="textarea" name="message" rows="2" maxlength="500">What services do you offer and how can I pay?</textarea>
          <button class="btn mt-1" type="submit"><i class="fa-solid fa-vial"></i>Run test</button>
          <div class="chat-thread mt-2" data-ai-result hidden></div>
        </form>
      </section>
      <section class="card card-pad-lg">
        <h2 style="font-size:1rem">Recent conversations</h2>
        <div class="chat-thread"><?php foreach (array_reverse($recent) as $m): ?><div class="msg <?= $m['role'] === 'user' ? 'me' : 'bot' ?>"><?= e(mb_strimwidth($m['message'], 0, 400, '…')) ?><span class="meta"><?= e(time_ago($m['created_at'])) ?> · <?= e(substr($m['visitor_hash'], 0, 6)) ?></span></div><?php endforeach ?>
          <?php if (!$recent): ?><p class="muted small center">No conversations yet.</p><?php endif ?></div>
      </section>
    </div>
  </div>
</div>
