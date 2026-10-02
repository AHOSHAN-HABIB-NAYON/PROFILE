<?php
/**
 * Database access (PDO + prepared statements only).
 * Credentials come from config/env.php, which the installer writes.
 */
defined('APP') || exit;

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = db_connect(ENV['db_host'] ?? 'localhost', ENV['db_name'] ?? '', ENV['db_user'] ?? '', ENV['db_pass'] ?? '', (int)(ENV['db_port'] ?? 3306));
    return $pdo;
}

function db_connect(string $host, string $name, string $user, string $pass, int $port = 3306): PDO
{
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    // Keep MySQL NOW() in the same timezone as PHP, full Unicode everywhere.
    $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '" . (new DateTime())->format('P') . "'");
    return $pdo;
}

/** Run a prepared statement. */
function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function val(string $sql, array $params = []): mixed
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

/** Quote an identifier coming from application code (never from user input). */
function ident(string $name): string
{
    if (!preg_match('~^[a-z_][a-z0-9_]*$~i', $name)) throw new InvalidArgumentException('Bad identifier');
    return '`' . $name . '`';
}

function insert(string $table, array $data): int
{
    $cols = implode(',', array_map('ident', array_keys($data)));
    $ph = implode(',', array_fill(0, count($data), '?'));
    q("INSERT INTO " . ident($table) . " ($cols) VALUES ($ph)", array_values($data));
    return (int)db()->lastInsertId();
}

function update(string $table, array $data, string $where, array $params = []): int
{
    $set = implode(',', array_map(fn($c) => ident($c) . '=?', array_keys($data)));
    return q("UPDATE " . ident($table) . " SET $set WHERE $where", [...array_values($data), ...$params])->rowCount();
}

/** Run $fn inside a transaction. */
function transaction(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $r = $fn();
        $pdo->commit();
        return $r;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/** Build "LIMIT x OFFSET y" pagination meta. */
function paginate(int $total, int $perPage, int $page): array
{
    $pages = max(1, (int)ceil($total / $perPage));
    $page = min(max(1, $page), $pages);
    return ['total' => $total, 'per' => $perPage, 'page' => $page, 'pages' => $pages, 'offset' => ($page - 1) * $perPage];
}
