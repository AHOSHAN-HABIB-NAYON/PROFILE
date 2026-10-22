<?php use OryzenX\Core\I18n; /** @var callable $e */
if ($part === 'subject') { echo I18n::t('email.support_subject', ['ticket' => $ticket]) . ' — ' . mb_substr($subject_line, 0, 80); return; }
if ($part === 'text') { echo "Ticket #$ticket\nFrom: $from_name <$from_email>\nSubject: $subject_line\n\n$message"; return; } ?>
<p style="margin:0 0 8px;"><strong>Ticket #<?= $e($ticket) ?></strong></p>
<p style="margin:0 0 8px;">From: <?= $e($from_name) ?> &lt;<?= $e($from_email) ?>&gt;</p>
<p style="margin:0 0 8px;">Subject: <?= $e($subject_line) ?></p>
<p style="margin:0;white-space:pre-wrap;"><?= $e($message) ?></p>
