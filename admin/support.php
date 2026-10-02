<?php
/** Admin: live support conversations + contact form messages. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Support']);

$tab = input('tab') === 'contact' ? 'contact' : 'chat';
$cid = input_int('c');
$newContacts = (int)val("SELECT COUNT(*) FROM contact_messages WHERE status = 'new'");
$unreadChats = (int)val("SELECT COALESCE(SUM(unread_admin),0) FROM support_conversations");
?>
<div class="page" data-init="<?= $tab === 'chat' && $cid ? 'support-thread' : '' ?>">
  <div class="adm-title"><h1>Support</h1></div>
  <nav class="tabs">
    <a class="tab <?= $tab === 'chat' ? 'active' : '' ?>" href="<?= e(url('/admin/support')) ?>"><i class="fa-solid fa-comments"></i>Live chat<?= $unreadChats ? ' <span class="badge danger">' . $unreadChats . '</span>' : '' ?></a>
    <a class="tab <?= $tab === 'contact' ? 'active' : '' ?>" href="<?= e(url('/admin/support?tab=contact')) ?>"><i class="fa-solid fa-envelope"></i>Contact messages<?= $newContacts ? ' <span class="badge danger">' . $newContacts . '</span>' : '' ?></a>
  </nav>
<?php if ($tab === 'chat' && $cid):
    $c = row('SELECT c.*, u.name, u.email FROM support_conversations c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?', [$cid]);
    if (!$c) abort(404);
    q('UPDATE support_conversations SET unread_admin = 0 WHERE id = ?', [$cid]);
    $msgs = rows('SELECT m.*, a.name AS admin FROM support_messages m LEFT JOIN users a ON a.id = m.admin_id WHERE m.conversation_id = ? ORDER BY m.id', [$cid]);
    $last = $msgs ? (int)end($msgs)['id'] : 0; ?>
  <a class="btn btn-sm btn-ghost mb-2" href="<?= e(url('/admin/support')) ?>"><i class="fa-solid fa-arrow-left"></i>All conversations</a>
  <section class="card card-pad-lg">
    <div class="row-between wrap mb-1">
      <div><strong><?= e($c['name'] ?: $c['guest_name']) ?></strong> <span class="badge muted"><?= $c['user_id'] ? 'Member' : 'Guest' ?></span><br><span class="tiny muted"><?= e($c['email'] ?: $c['guest_email']) ?> · started <?= e(time_ago($c['created_at'])) ?><?= $c['first_reply_seconds'] !== null ? ' · first reply in ' . e(gmdate($c['first_reply_seconds'] >= 3600 ? 'G\h i\m' : 'i\m s\s', (int)$c['first_reply_seconds'])) : '' ?></span></div>
      <div class="row"><?php if ($c['user_id']): ?><a class="btn btn-sm btn-ghost" href="<?= e(url('/admin/users?id=' . $c['user_id'])) ?>">Profile</a><?php endif ?>
        <button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/admin?action=support_status')) ?>" data-params='<?= e(json_encode(['id' => $cid, 'status' => $c['status'] === 'open' ? 'closed' : 'open'])) ?>'><?= $c['status'] === 'open' ? 'Close' : 'Reopen' ?></button></div>
    </div>
    <div class="chat-thread" data-thread data-cid="<?= $cid ?>" data-last="<?= $last ?>">
      <?php foreach ($msgs as $m): ?><div class="msg <?= $m['sender'] === 'admin' ? 'me' : 'bot' ?>"><?= e($m['message']) ?><span class="meta"><?= e($m['sender'] === 'admin' ? ($m['admin'] ?: 'Staff') : 'Customer') ?> · <?= e(date('M j, H:i', strtotime($m['created_at']))) ?></span></div><?php endforeach ?>
    </div>
    <form class="chat-form mt-2" method="post" action="<?= e(url('/api/admin?action=support_reply')) ?>" data-ajax data-reset data-support-reply style="display:flex;gap:8px">
      <input type="hidden" name="id" value="<?= $cid ?>">
      <textarea class="textarea grow" name="message" rows="2" maxlength="2000" required placeholder="Type a reply…" style="min-height:48px"></textarea>
      <button class="btn" type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  </section>
<?php elseif ($tab === 'chat'):
    $convs = rows("SELECT c.*, u.name, u.email, (SELECT message FROM support_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last_msg
                   FROM support_conversations c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.status = 'open' DESC, c.unread_admin > 0 DESC, c.last_message_at DESC LIMIT 60"); ?>
  <?php if (!$convs): ?><div class="card empty"><div class="icon-box"><i class="fa-regular fa-comments"></i></div>No conversations yet.</div><?php endif ?>
  <div class="list"><?php foreach ($convs as $c): ?>
    <a class="list-row" href="<?= e(url('/admin/support?c=' . $c['id'])) ?>">
      <span class="avatar sm"><?= e(mb_strtoupper(mb_substr($c['name'] ?: $c['guest_name'] ?: '?', 0, 1))) ?></span>
      <span class="grow" style="min-width:0"><strong style="font-size:.9rem"><?= e($c['name'] ?: $c['guest_name']) ?></strong> <?php if ($c['status'] === 'closed'): ?><span class="badge muted">closed</span><?php endif ?><br><span class="tiny muted truncate" style="display:block"><?= e($c['last_msg']) ?></span></span>
      <span class="tiny muted"><?= e(time_ago($c['last_message_at'])) ?></span>
      <?php if ($c['unread_admin']): ?><span class="badge danger"><?= (int)$c['unread_admin'] ?></span><?php endif ?>
    </a>
  <?php endforeach ?></div>
<?php else:
    $pg = paginate((int)val('SELECT COUNT(*) FROM contact_messages'), 20, max(1, input_int('page', 1)));
    $msgs = rows("SELECT * FROM contact_messages ORDER BY status = 'new' DESC, id DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}"); ?>
  <?php if (!$msgs): ?><div class="card empty"><div class="icon-box"><i class="fa-regular fa-envelope-open"></i></div>No contact messages.</div><?php endif ?>
  <div class="stack"><?php foreach ($msgs as $m): ?>
    <article class="card card-pad-lg">
      <div class="row-between wrap"><div><strong><?= e($m['subject']) ?></strong> <span class="badge <?= $m['status'] === 'new' ? 'danger' : 'muted' ?>"><?= e($m['status']) ?></span><br><span class="tiny muted"><?= e($m['name']) ?> · <a href="mailto:<?= e($m['email']) ?>"><?= e($m['email']) ?></a> · <?= e(date('M j, Y H:i', strtotime($m['created_at']))) ?></span></div></div>
      <p class="mt-1" style="white-space:pre-line"><?= e($m['message']) ?></p>
      <div class="row wrap">
        <?php if ($m['attachment']): ?><a class="btn btn-sm btn-ghost" href="<?= e(url('/file/contact/' . $m['id'])) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-solid fa-paperclip"></i>Attachment</a><?php endif ?>
        <button class="btn btn-sm btn-soft" data-action="post" data-url="<?= e(url('/api/admin?action=contact_reply')) ?>" data-params='<?= e(json_encode(['id' => (int)$m['id']])) ?>' data-confirm="Reply by email to <?= e($m['email']) ?>:" data-input="Your reply" data-input-name="message"><i class="fa-solid fa-reply"></i>Reply</button>
        <?php if ($m['status'] === 'new'): ?><button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/admin?action=contact_status')) ?>" data-params='<?= e(json_encode(['id' => (int)$m['id'], 'status' => 'read'])) ?>'>Mark read</button><?php endif ?>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" data-action="post" data-url="<?= e(url('/api/admin?action=contact_delete')) ?>" data-params='<?= e(json_encode(['id' => (int)$m['id']])) ?>' data-confirm="Delete this message?" data-danger="1"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    </article>
  <?php endforeach ?></div>
  <?php admin_pager($pg, '/admin/support?tab=contact') ?>
<?php endif ?>
</div>
