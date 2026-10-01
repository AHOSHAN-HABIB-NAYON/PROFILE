<?php
/** /api/report/create — user issue report with screenshots. */
declare(strict_types=1);

require_post();
$u = api_user();
if ($action !== 'create') {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
$cats = ['payment', 'account', 'service', 'binance', 'bug', 'fraud', 'other'];
$cat = (string) input('category', 'other');
$desc = input_str('description', 3000);
if (!in_array($cat, $cats, true)) {
    $cat = 'other';
}
if (mb_strlen($desc) < 10) {
    fail('সমস্যাটি অন্তত ১০ অক্ষরে বিস্তারিত লিখুন।');
}
if (!RateLimit::hit('report:' . $u['id'], 6, 3600)) {
    fail('অনেক রিপোর্ট পাঠানো হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
}
$files = array_slice(Upload::files('screenshots'), 0, 3);
$saved = [];
try {
    foreach ($files as $f) {
        $saved[] = Upload::image($f, 'reports');
    }
} catch (DomainException $e) {
    foreach ($saved as $s) {
        Upload::delete($s['path']);
    }
    fail($e->getMessage());
}
$ref = preg_replace('/[^A-Za-z0-9-]/', '', input_str('tx_ref', 60));
$rid = db()->tx(static function (DB $db) use ($u, $cat, $desc, $ref, $saved) {
    do {
        $uid = random_code(8, '0123456789');
    } while ($db->val('SELECT 1 FROM reports WHERE uid = ?', [$uid]));
    $id = $db->insert('reports', ['uid' => $uid, 'user_id' => $u['id'], 'category' => $cat, 'description' => $desc, 'tx_ref' => $ref ?: null]);
    foreach ($saved as $s) {
        $db->insert('report_files', ['report_id' => $id, 'path' => $s['path'], 'mime' => $s['mime'], 'size' => $s['size']]);
    }
    return $uid;
});
Notify::user((int) $u['id'], 'system', 'রিপোর্ট গ্রহণ করা হয়েছে #' . $rid, 'আপনার রিপোর্ট আমাদের টিম পর্যালোচনা করবে।', '/report', ['push' => false]);
$adminMail = (string) setting('security_notify_admin_email');
if ($adminMail !== '') {
    Mailer::sendTemplate($adminMail, 'admin_message', ['name' => 'Admin', 'title' => 'নতুন রিপোর্ট #' . $rid, 'body' => $u['name'] . ': ' . mb_substr($desc, 0, 400), 'url' => '/v2admin/reports']);
}
ok(['reload' => true], 'রিপোর্ট পাঠানো হয়েছে। রিপোর্ট নম্বর #' . $rid);
