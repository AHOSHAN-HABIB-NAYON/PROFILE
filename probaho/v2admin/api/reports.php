<?php
/** /v2admin/api/reports/update */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
admin_api('support');
if ($action !== 'update') {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
$r = db()->row('SELECT * FROM reports WHERE id = ?', [input_int('id')]);
if (!$r) {
    fail('রিপোর্ট পাওয়া যায়নি।', 404);
}
$labels = ['pending' => 'অপেক্ষমাণ', 'reviewing' => 'পর্যালোচনায়', 'resolved' => 'সমাধান হয়েছে', 'rejected' => 'প্রত্যাখ্যাত'];
$status = (string) input('status', 'pending');
if (!isset($labels[$status])) {
    fail('স্ট্যাটাস সঠিক নয়।');
}
$reply = input_str('reply', 3000);
db()->update('reports', ['status' => $status, 'admin_reply' => $reply ?: null, 'replied_at' => $reply !== '' ? now() : $r['replied_at']], 'id = ?', [$r['id']]);
if (input_bool('notify')) {
    Notify::user((int) $r['user_id'], 'admin', 'রিপোর্ট #' . $r['uid'] . ': ' . $labels[$status], $reply !== '' ? mb_strimwidth($reply, 0, 180, '…') : 'আপনার রিপোর্টের স্ট্যাটাস আপডেট হয়েছে।', '/report', [
        'email' => ['report_update', ['uid' => $r['uid'], 'status' => $labels[$status], 'reply' => $reply]],
    ]);
}
AdminAuth::log('report.update', $r['uid'], ['status' => $status]);
ok(['reload' => true], 'রিপোর্ট আপডেট হয়েছে');
