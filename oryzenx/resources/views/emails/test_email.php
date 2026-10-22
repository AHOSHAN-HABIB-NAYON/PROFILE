<?php use OryzenX\Core\I18n; /** @var callable $e */
if ($part === 'subject') { echo I18n::t('email.test_subject'); return; }
if ($part === 'text') { echo I18n::t('email.test_body', ['time' => $time]); return; } ?>
<p style="margin:0;"><?= $e(I18n::t('email.test_body', ['time' => $time])) ?></p>
