<?php use OryzenX\Core\I18n; /** @var callable $e */ ?>
<!doctype html>
<html lang="<?= $e($locale) ?>">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title><?= $e($subject) ?></title></head>
<body style="margin:0;padding:0;background:#F3F5F9;font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans Bengali',Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;">
<tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#0B1F4D;">Oryzen<span style="color:#1A56DB;">X</span></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;"><?= $content ?></td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E5E7EB;font-size:12px;line-height:1.5;color:#6B7280;">
<?= $e(I18n::t('email.footer_auto', ['site' => $site_name])) ?><br><?= $e(I18n::t('email.footer_prefs')) ?>
<?php if (!empty($support_email)): ?><br><?= $e($support_email) ?><?php endif; ?>
</td></tr>
</table></td></tr></table>
</body></html>
