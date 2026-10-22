<?php use OryzenX\Core\I18n; /** @var callable $e */
if ($part === 'subject') { echo I18n::t('email.verify_subject'); return; }
if ($part === 'text') {
    echo I18n::t('email.greeting', ['name' => $name]) . "\n\n" . I18n::t('email.verify_intro') . "\n\n    " . $code . "\n\n" . I18n::t('email.verify_or_link') . "\n" . $link . "\n\n" . I18n::t('email.verify_expiry', ['hours' => $hours]) . "\n\n" . I18n::t('email.signoff');
    return;
} ?>
<p style="margin:0 0 12px;"><?= $e(I18n::t('email.greeting', ['name' => $name])) ?></p>
<p style="margin:0 0 12px;"><?= $e(I18n::t('email.verify_intro')) ?></p>
<p style="margin:16px 0;font-size:30px;font-weight:700;letter-spacing:0.3em;font-family:'SFMono-Regular',Consolas,monospace;color:#0B1F4D;"><?= $e($code) ?></p>
<p style="margin:0 0 4px;"><?= $e(I18n::t('email.verify_or_link')) ?></p>
<?php $href = $link; $label = I18n::t('email.verify_button'); include __DIR__ . '/_button.php'; ?>
<p style="margin:0 0 12px;font-size:13px;color:#6B7280;"><?= $e(I18n::t('email.verify_expiry', ['hours' => $hours])) ?></p>
<p style="margin:0;color:#6B7280;"><?= $e(I18n::t('email.signoff')) ?></p>
