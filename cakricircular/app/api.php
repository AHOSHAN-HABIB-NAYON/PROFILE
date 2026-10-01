<?php
/* ================= API ================= */
header('X-Robots-Tag: noindex');

$action = $API_ACTION ?? '';
$body   = [];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true) ?: $_POST;
}

switch ($action) {

    /* ---- পেজ ভিজিট ট্র্যাকিং ---- */
    case 'track':
        $path = mb_substr((string)($body['path'] ?? '/'), 0, 190, 'UTF-8');
        track_visit($path);
        json_out(['ok' => true]);

    /* ---- না-পড়া নোটিশ সংখ্যা ---- */
    case 'notices':
        $since = (int)($_GET['since'] ?? 0);
        $unread = (int)col("SELECT COUNT(*) FROM notices WHERE is_active = 1 AND UNIX_TIMESTAMP(created_at) > ?", [$since]);
        $latest = (int)col("SELECT COALESCE(UNIX_TIMESTAMP(MAX(created_at)), 0) FROM notices WHERE is_active = 1");
        json_out(['ok' => true, 'unread' => $unread, 'latest' => $latest]);

    /* ---- রিপোর্ট জমা ---- */
    case 'report':
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') json_out(['ok' => false, 'msg' => 'ভুল রিকোয়েস্ট।'], 405);
        /* সেশন একদম হারিয়ে গেলে (কুকি ব্লক/সার্ভারে সেশন মুছে যাওয়া) আটকে দিই না —
           রেট লিমিট তো আছেই। শুধু টোকেন মিলছে না এমন হলে বলি রিফ্রেশ করতে। */
        if (!csrf_check() && !empty($_SESSION['csrf'])) {
            json_out(['ok' => false, 'msg' => 'সেশন মেয়াদ শেষ। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'], 419);
        }

        $email   = trim((string)($body['email'] ?? ''));
        $title   = trim((string)($body['title'] ?? ''));
        $details = trim((string)($body['details'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['ok' => false, 'msg' => 'সঠিক ইমেইল দিন।']);
        if (mb_strlen($title, 'UTF-8') < 3)   json_out(['ok' => false, 'msg' => 'বিষয় লিখুন।']);
        if (mb_strlen($details, 'UTF-8') < 10) json_out(['ok' => false, 'msg' => 'বিস্তারিত অন্তত ১০ অক্ষরের লিখুন।']);

        /* রেট লিমিট: ১ ঘণ্টায় ৫টির বেশি নয় (একই আইপি) */
        $ip = client_ip();
        try {
            $n = (int)col("SELECT COUNT(*) FROM reports WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)", [$ip]);
        } catch (Throwable $e) { $n = 0; }
        if ($n >= 5) json_out(['ok' => false, 'msg' => 'অনেকবার পাঠানো হয়েছে। এক ঘণ্টা পরে আবার চেষ্টা করুন।']);

        $args = [mb_substr($email, 0, 150, 'UTF-8'), mb_substr($title, 0, 190, 'UTF-8'),
                 mb_substr($details, 0, 2000, 'UTF-8'), $ip];
        $sql  = "INSERT INTO reports (email, title, details, ip, status, created_at) VALUES (?,?,?,?,0,NOW())";
        try {
            q($sql, $args);
        } catch (Throwable $e) {
            /* টেবিল না থাকলে বানিয়ে একবার আবার চেষ্টা করি */
            try {
                q("CREATE TABLE IF NOT EXISTS reports (
                     id INT AUTO_INCREMENT PRIMARY KEY,
                     email VARCHAR(150) NULL,
                     title VARCHAR(190) NULL,
                     details TEXT NULL,
                     ip VARCHAR(45) NULL,
                     status TINYINT NOT NULL DEFAULT 0,
                     created_at DATETIME NULL,
                     INDEX idx_status (status, created_at)
                   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
                q($sql, $args);
            } catch (Throwable $e2) {
                json_out(['ok' => false, 'msg' => 'সংরক্ষণ করা যায়নি: ' . (DEBUG_MODE ? $e2->getMessage() : 'ডেটাবেজে সমস্যা হয়েছে।')], 500);
            }
        }

        json_out(['ok' => true, 'msg' => 'ধন্যবাদ! আপনার রিপোর্ট আমাদের কাছে পৌঁছেছে।']);

    default:
        json_out(['ok' => false, 'msg' => 'not found'], 404);
}
