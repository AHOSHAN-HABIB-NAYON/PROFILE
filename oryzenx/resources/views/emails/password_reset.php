<?php use OryzenX\Core\I18n; /** @var callable $e */
if ($part === 'subject') { echo I18n::t('email.reset_subject'); return; }
if ($part === 'text') {
    echo I18n::t('email.greeting', ['name' => $name]) . "\n\n" . I18n::t('email.reset_intro', ['ip' => $ip]) . "\n\n" . $link . "\n\n" . I18n::t('email.reset_expiry', ['minutes' => $minutes]) . "\n\n" . I18n::t('email.signoff');
    return;
} ?>
<p style="margin:0 0 12px;"><?= $e(I18n::t('email.greeting', ['name' => $name])) ?></p>
<p style="margin:0 0 12px;"><?= $e(I18n::t('email.reset_intro', ['ip' => $ip])) ?></p>
<?php $href = $link; $label = I18n::t('email.reset_button'); include __DIR__ . '/_button.php'; ?>
<p style="margin:0 0 12px;font-size:13px;color:#6B7280;"><?= $e(I18n::t('email.reset_expiry', ['minutes' => $minutes])) ?></p>
<p style="margin:0;color:#6B7280;"><?= $e(I18n::t('email.signoff')) ?></p>
