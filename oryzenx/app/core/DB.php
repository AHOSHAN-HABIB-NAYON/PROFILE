<?php
/** Thin PDO wrapper. Every query uses prepared statements. */
final class DB
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $c = $GLOBALS['config']['db'] ?? [];
        self::$pdo = self::connect($c['host'] ?? 'localhost', (int)($c['port'] ?? 3306), $c['name'] ?? '', $c['user'] ?? '', $c['pass'] ?? '');
        return self::$pdo;
    }

    public static function connect(string $host, int $port, string $name, string $user, string $pass): PDO
    {
        $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '" . date('P') . "'",
        ]);
        return $pdo;
    }

    public static function q(string $sql, array $params = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        foreach ($params as $k => $v) {
            $key = is_int($k) ? $k + 1 : (str_starts_with($k, ':') ? $k : ":$k");
            $type = is_int($v) ? PDO::PARAM_INT : (is_null($v) ? PDO::PARAM_NULL : (is_bool($v) ? PDO::PARAM_BOOL : PDO::PARAM_STR));
            $st->bindValue($key, $v, $type);
        }
        $st->execute();
        return $st;
    }

    public static function row(string $sql, array $p = []): ?array { $r = self::q($sql, $p)->fetch(); return $r ?: null; }
    public static function all(string $sql, array $p = []): array { return self::q($sql, $p)->fetchAll(); }
    public static function val(string $sql, array $p = []): mixed { $v = self::q($sql, $p)->fetchColumn(); return $v === false ? null : $v; }
    public static function col(string $sql, array $p = []): array { return self::q($sql, $p)->fetchAll(PDO::FETCH_COLUMN); }

    private static function ident(string $name): string
    {
        if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $name)) throw new InvalidArgumentException('Bad identifier');
        return "`$name`";
    }

    public static function insert(string $table, array $data): int
    {
        $cols = implode(',', array_map([self::class, 'ident'], array_keys($data)));
        $ph = implode(',', array_fill(0, count($data), '?'));
        self::q('INSERT INTO ' . self::ident($table) . " ($cols) VALUES ($ph)", array_values($data));
        return (int)self::pdo()->lastInsertId();
    }

    public static function update(string $table, array $data, string $where, array $params = []): int
    {
        $set = implode(',', array_map(fn($c) => self::ident($c) . '=?', array_keys($data)));
        return self::q('UPDATE ' . self::ident($table) . " SET $set WHERE $where", [...array_values($data), ...$params])->rowCount();
    }

    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try { $r = $fn(); $pdo->commit(); return $r; }
        catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }

    /** Builds a LIMIT/OFFSET page plus total count. */
    public static function paginate(string $select, string $from, array $params, int $page, int $per = 20): array
    {
        $page = max(1, $page);
        $total = (int)self::val("SELECT COUNT(*) $from", $params);
        $rows = self::all("SELECT $select $from LIMIT " . (int)$per . ' OFFSET ' . (int)(($page - 1) * $per), $params);
        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $per))];
    }
}
