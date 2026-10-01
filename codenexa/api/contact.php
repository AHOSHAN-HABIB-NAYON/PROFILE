<?php
/**
 * AJAX contact form endpoint. Returns JSON.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

if (!is_installed()) {
    json_out(['ok' => false, 'message' => 'Not installed'], 503);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['ok' => false, 'message' => 'Method not allowed'], 405);
}
if (!csrf_check()) {
    json_out(['ok' => false, 'message' => t('form.fail')], 419);
}

// Honeypot: bots fill hidden fields. Pretend success.
if (!empty($_POST['website'])) {
    json_out(['ok' => true, 'message' => t('form.ok')]);
}

$last = (int) ($_SESSION['last_contact'] ?? 0);
if (time() - $last < 30) {
    json_out(['ok' => false, 'message' => t('form.wait')], 429);
}

$name    = trim((string) ($_POST['name'] ?? ''));
$email   = trim((string) ($_POST['email'] ?? ''));
$phone   = trim((string) ($_POST['phone'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));

if ($name === '' || mb_strlen($name) > 120
    || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190
    || $message === '' || mb_strlen($message) > 5000 || mb_strlen($phone) > 40) {
    json_out(['ok' => false, 'message' => t('form.err')], 422);
}

try {
    q('INSERT INTO messages (name, email, phone, message, is_read, ip, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)', [
        $name, $email, $phone, $message, substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45), date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    json_out(['ok' => false, 'message' => t('form.fail')], 500);
}

$_SESSION['last_contact'] = time();

// Best-effort email notification; silently ignored if mail() is unavailable.
$to = setting('email');
if ($to !== '' && function_exists('mail')) {
    $clean = static function (string $s): string { return str_replace(["\r", "\n"], ' ', $s); };
    @mail(
        $to,
        '=?UTF-8?B?' . base64_encode('New message from ' . $clean($name)) . '?=',
        "Name: $name\nEmail: $email\nPhone: $phone\n\n$message",
        "Content-Type: text/plain; charset=UTF-8\r\nReply-To: " . $clean($email)
    );
}

json_out(['ok' => true, 'message' => t('form.ok')]);
