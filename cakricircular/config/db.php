<?php
/* ডেটাবেজ সংযোগ – বাংলা ইউনিকোড পুরোপুরি সাপোর্টেড (utf8mb4) */

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+06:00'",
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        /* API/SPA রিকোয়েস্ট হলে JSON — নাহলে ব্রাউজার "পাঠানো যায়নি" ছাড়া কিছু বোঝে না */
        $isApi = strpos((string)($_SERVER['REQUEST_URI'] ?? ''), '/api/') !== false
              || ($_SERVER['HTTP_X_SPA'] ?? '') === '1';
        if ($isApi) {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'msg' => 'ডেটাবেজে সংযোগ করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।'],
                             JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (DEBUG_MODE) { echo 'DB Error: ' . $e->getMessage(); }
        else {
            header('Content-Type: text/html; charset=utf-8');
            echo '<!doctype html><meta charset="utf-8"><div style="font:16px system-ui;padding:40px;text-align:center">'
               . 'সাময়িক সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করুন।</div>';
        }
        exit;
    }
    return $pdo;
}

/* ছোট হেল্পার – প্রিপেয়ার্ড স্টেটমেন্ট (SQL Injection নিরাপদ) */
function q(string $sql, array $p = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}
function one(string $sql, array $p = []) { $r = q($sql, $p)->fetch(); return $r === false ? null : $r; }
function all(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function col(string $sql, array $p = []) { $v = q($sql, $p)->fetchColumn(); return $v === false ? null : $v; }
