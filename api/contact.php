<?php
/** Contact form: honeypot + time trap + rate limit + optional reCAPTCHA. */
defined('APP') || exit;

if (!is_post()) fail(t('err.bad_request'), 405);
if (!setting_bool('contact.form_enabled')) fail(t('err.forbidden'), 403);
rate_limit('contact:' . client_ip(), 5, 3600);

// bots fill hidden fields and submit instantly
if (input('website') !== '') ok(t('contact.sent'));
[$ts, $sig] = array_pad(explode('.', input('_ts'), 2), 2, '');
if (!ctype_digit($ts) || !hash_equals(substr(token_hash('contact' . $ts), 0, 16), $sig) || time() - (int)$ts < 3) fail(t('contact.too_fast'), 422);

$name = mb_substr(input('name'), 0, 120);
$email = mb_strtolower(input('email'));
$subject = mb_substr(input('subject'), 0, 190);
$message = mb_substr(input('message'), 0, 5000);
$errors = [];
if (mb_strlen($name) < 2) $errors['name'] = t('err.name');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = t('err.email');
if (mb_strlen($subject) < 2) $errors['subject'] = t('err.required');
if (mb_strlen($message) < 10) $errors['message'] = t('contact.message_short');
if (preg_match_all('~https?://~i', $message) > 3) $errors['message'] = t('contact.too_many_links');
if ($errors) fail(t('err.check_form'), 422, $errors);
recaptcha_check('contact');

$attachment = null;
if (!empty($_FILES['attachment']['name'])) {
    require_once ROOT . '/core/upload.php';
    try {
        $f = store_upload($_FILES['attachment'], 'private_doc', ['max_mb' => min(10, (float)setting('media.max_upload_mb', 10))]);
        $attachment = $f['path'];
    } catch (RuntimeException $e) {
        fail($e->getMessage(), 422, ['attachment' => $e->getMessage()]);
    }
}
$id = insert('contact_messages', ['user_id' => user()['id'] ?? null, 'name' => $name, 'email' => $email, 'subject' => $subject, 'message' => $message, 'attachment' => $attachment]);
notify_staff('support', ['type' => 'admin', 'icon' => 'fa-envelope', 'link' => '/admin/support?tab=contact',
    'title_en' => 'New contact message: ' . mb_substr($subject, 0, 80), 'title_bn' => 'নতুন যোগাযোগ বার্তা: ' . mb_substr($subject, 0, 80),
    'body_en' => $name . ' <' . $email . '>', 'body_bn' => $name . ' <' . $email . '>'],
    'admin_alert', ['subject' => 'Contact: ' . $subject, 'heading' => 'New contact message', 'body' => "From: $name <$email>\n\n$message", 'link' => abs_url('/admin/support?tab=contact')]);
ok(t('contact.sent'));
