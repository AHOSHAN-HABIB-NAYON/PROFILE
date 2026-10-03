<?php
final class ContactController
{
    public function index(): void
    {
        View::page('pages/contact', ['user' => auth(), 'subject' => (string)input('subject')], [
            'title' => t('contact.title'), 'nav' => 'contact', 'css' => ['contact'], 'description' => t('contact.sub'), 'cache' => false,
        ]);
    }

    public function submit(): void
    {
        validate(['name' => 'required|max:120', 'email' => 'required|email|max:190', 'subject' => 'required|max:200', 'message' => 'required|min:10|max:5000']);
        if (input('website') !== '') respond(true, t('contact.sent')); // honeypot
        if (!RateLimit::hit('contact|' . client_ip(), 5, 3600)) fail(t('error.429'));
        Recaptcha::verify();
        $file = null;
        if (Upload::present('attachment')) {
            try { $file = Upload::document('attachment', 'contact', true, 5); }
            catch (UploadError $e) { fail($e->getMessage(), ['attachment' => $e->getMessage()]); }
        }
        $id = DB::insert('contact_messages', [
            'user_id' => Auth::id(), 'name' => input('name'), 'email' => mb_strtolower((string)input('email')), 'subject' => input('subject'),
            'message' => input('message'), 'attachment' => $file, 'ip' => client_ip(),
        ]);
        $admins = DB::col("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
        if ($admins) Notifier::send($admins, t('notif.new_message'), mb_substr(input('name') . ': ' . input('subject'), 0, 200),
            ['icon' => 'fa-solid fa-envelope', 'link' => '/admin/messages/' . $id, 'push' => true]);
        respond(true, t('contact.sent'), null, ['reset' => true]);
    }
}
