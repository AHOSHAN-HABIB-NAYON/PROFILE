<?php
declare(strict_types=1);

namespace OryzenX\Core;

use PDO;
use PDOStatement;

/** Thin PDO wrapper: prepared statements only, utf8mb4, nested-safe transactions. */
final class Database
{
    private static ?Database $instance = null;
    private PDO $pdo;
    private int $txDepth = 0;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public static function connect(array $cfg): self
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $cfg['host'] ?? '127.0.0.1',
            (int) ($cfg['port'] ?? 3306),
            $cfg['name'] ?? ''
        );
        if (!empty($cfg['socket'])) {
            $dsn = sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', $cfg['socket'], $cfg['name'] ?? '');
        }
        $pdo = new PDO($dsn, $cfg['user'] ?? '', $cfg['pass'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => true,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION'",
        ]);
        return new self($pdo);
    }

    public static function instance(): self
    {
        if (self::$instance === null) {
            self::$instance = self::connect((array) Config::get('db', []));
        }
        return self::$instance;
    }

    public static function setInstance(?self $db): void
    {
        self::$instance = $db;
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    /**
     * Native prepares (EMULATE_PREPARES=false) cannot reuse a named placeholder, so repeated
     * ":name" occurrences are renamed to ":name__2", ":name__3"... and their values duplicated.
     */
    private static function expandPlaceholders(string $sql, array $params): array
    {
        $seen = [];
        $out = preg_replace_callback(
            '/\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*"|(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/',
            function ($m) use (&$seen, &$params) {
                if (!isset($m[1])) {
                    return $m[0]; // quoted string literal
                }
                $name = $m[1];
                $seen[$name] = ($seen[$name] ?? 0) + 1;
                if ($seen[$name] === 1) {
                    return $m[0];
                }
                $new = $name . '__' . $seen[$name];
                $key = array_key_exists($name, $params) ? $name : ':' . $name;
                if (array_key_exists($key, $params)) {
                    $params[$new] = $params[$key];
                }
                return ':' . $new;
            },
            $sql
        );
        return [$out ?? $sql, $params];
    }

    public function run(string $sql, array $params = []): PDOStatement
    {
        if ($params && !array_is_list($params)) {
            [$sql, $params] = self::expandPlaceholders($sql, $params);
        }
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $key = is_int($k) ? $k + 1 : (str_starts_with($k, ':') ? $k : ':' . $k);
            $type = match (true) {
                is_int($v) => PDO::PARAM_INT,
                is_bool($v) => PDO::PARAM_BOOL,
                $v === null => PDO::PARAM_NULL,
                default => PDO::PARAM_STR,
            };
            $stmt->bindValue($key, $v, $type);
        }
        $stmt->execute();
        return $stmt;
    }

    public function one(string $sql, array $params = []): ?array
    {
        $row = $this->run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public function all(string $sql, array $params = []): array
    {
        return $this->run($sql, $params)->fetchAll();
    }

    public function value(string $sql, array $params = []): mixed
    {
        $v = $this->run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public function insert(string $table, array $data): int
    {
        self::assertIdent($table);
        $cols = array_keys($data);
        array_walk($cols, [self::class, 'assertIdent']);
        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(',', array_map(fn ($c) => "`$c`", $cols)),
            implode(',', array_map(fn ($c) => ":$c", $cols))
        );
        $this->run($sql, $data);
        return (int) $this->pdo->lastInsertId();
    }

    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        self::assertIdent($table);
        $sets = [];
        $params = [];
        foreach ($data as $col => $val) {
            self::assertIdent($col);
            $sets[] = "`$col` = :set_$col";
            $params["set_$col"] = $val;
        }
        $sql = sprintf('UPDATE `%s` SET %s WHERE %s', $table, implode(', ', $sets), $where);
        return $this->run($sql, $params + $whereParams)->rowCount();
    }

    /** Runs $fn inside a transaction (re-entrant; inner calls join the outer one). */
    public function transaction(callable $fn): mixed
    {
        if ($this->txDepth === 0) {
            $this->pdo->beginTransaction();
        }
        $this->txDepth++;
        try {
            $result = $fn($this);
            $this->txDepth--;
            if ($this->txDepth === 0) {
                $this->pdo->commit();
            }
            return $result;
        } catch (\Throwable $e) {
            $this->txDepth--;
            if ($this->txDepth === 0 && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function inTransaction(): bool
    {
        return $this->txDepth > 0;
    }

    public static function assertIdent(string $name): void
    {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $name)) {
            throw new \InvalidArgumentException('Invalid SQL identifier');
        }
    }

    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }
}
