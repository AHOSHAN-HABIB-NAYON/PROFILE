<?php
final class AdminMessageController
{
    public function index(): void
    {
        $status = (string)input('status');
        $where = '1=1'; $params = [];
        if (in_array($status, ['new', 'read', 'replied', 'closed'], true)) { $where .= ' AND status = ?'; $params[] = $status; }
        $p = DB::paginate('*', "FROM contact_messages WHERE $where ORDER BY (status = 'new') DESC, id DESC", $params, input_int('page', 1), 25);
        View::page('admin/messages', ['p' => $p, 'status' => $status], ['layout' => 'admin', 'title' => t('admin.messages'), 'nav' => 'messages', 'cache' => false]);
    }

    public function show(string $id): void
    {
        $m = DB::row('SELECT * FROM contact_messages WHERE id = ?', [(int)$id]);
        if (!$m) throw new HttpException(t('error.404'), 404);
        if ($m['status'] === 'new') { DB::q("UPDATE contact_messages SET status = 'read' WHERE id = ?", [$m['id']]); $m['status'] = 'read'; }
        View::page('admin/message', ['m' => $m], ['layout' => 'admin', 'title' => $m['subject'], 'nav' => 'messages', 'cache' => false]);
    }

    public function reply(string $id): void
    {
        $m = DB::row('SELECT * FROM contact_messages WHERE id = ?', [(int)$id]);
        if (!$m) throw new HttpException(t('error.404'), 404);
        if (input('action') === 'close') {
            DB::q("UPDATE contact_messages SET status = 'closed' WHERE id = ?", [$m['id']]);
            respond(true, t('common.saved'), '/admin/messages');
        }
        validate(['reply' => 'required|max:5000']);
        $reply = (string)input('reply');
        $sent = Mailer::send($m['email'], 'Re: ' . $m['subject'], '<p>' . nl2br(e($reply)) . '</p><hr style="border:0;border-top:1px solid #e5e9f2"><p style="color:#64748b;font-size:12px">' . nl2br(e(str_limit($m['message'], 600))) . '</p>', $err);
        if ($m['user_id']) Notifier::send([(int)$m['user_id']], t('notif.support_reply'), str_limit($reply, 200), ['icon' => 'fa-solid fa-headset', 'link' => '/notifications']);
        DB::q("UPDATE contact_messages SET status = 'replied', admin_reply = ?, replied_at = NOW() WHERE id = ?", [$reply, $m['id']]);
        Auth::activity('admin_message_reply', "#{$m['id']}");
        respond(true, $sent ? t('admin.reply_sent') : t('admin.reply_saved_no_mail'), '/admin/messages/' . $m['id']);
    }
}
