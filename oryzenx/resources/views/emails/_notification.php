<?php
// Shared template for account event notifications. $type is set by the including template.
use OryzenX\Core\I18n;
/** @var callable $e */
$vars = get_defined_vars();
$repl = array_filter($vars, fn ($v) => is_scalar($v));
$t = $type === 'realized_profit' || $type === 'realized_loss' ? $event_type : $type;
$subject = I18n::t('notify.' . $t . '_title', $repl);
$body = I18n::t('notify.' . $t . '_body', $repl);
$note = $note ?? null;
if ($part === 'subject') { echo $subject; return; }
if ($part === 'text') {
    echo I18n::t('email.greeting', ['name' => $name]) . "\n\n" . $body . "\n\n" . ($note ? $note . "\n\n" : '') . I18n::t('email.open_app') . ': ' . $app_url . "app/\n\n" . I18n::t('email.signoff');
    return;
}
?>
<p style="margin:0 0 12px;"><?= $e(I18n::t('email.greeting', ['name' => $name])) ?></p>
<p style="margin:0 0 12px;font-size:17px;font-weight:600;"><?= $e($subject) ?></p>
<p style="margin:0 0 12px;"><?= $e($body) ?></p>
<?php if ($note): ?><p style="margin:0 0 12px;padding:10px 12px;background:#F3F5F9;border-radius:8px;font-size:13px;color:#374151;"><?= $e($note) ?></p><?php endif; ?>
<?php $href = $app_url . 'app/'; $label = I18n::t('email.open_app'); include __DIR__ . '/_button.php'; ?>
<p style="margin:0;color:#6B7280;"><?= $e(I18n::t('email.signoff')) ?></p>
