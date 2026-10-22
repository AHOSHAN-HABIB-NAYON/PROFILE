<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** Applies versioned SQL migrations from database/migrations and idempotent reference seeds. */
final class Migrator
{
    public function __construct(private Database $db)
    {
    }

    /** @return string[] applied migration versions in this run */
    public function migrate(): array
    {
        $this->db->run('CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(100) NOT NULL PRIMARY KEY,
            applied_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

        $done = array_column($this->db->all('SELECT version FROM schema_migrations'), 'version');
        $files = glob(Config::basePath('database/migrations/*.sql')) ?: [];
        sort($files, SORT_STRING);
        $applied = [];
        foreach ($files as $file) {
            $version = basename($file, '.sql');
            if (in_array($version, $done, true)) {
                continue;
            }
            foreach (self::splitSql((string) file_get_contents($file)) as $stmt) {
                $this->db->pdo()->exec($stmt);
            }
            $this->db->insert('schema_migrations', ['version' => $version, 'applied_at' => Database::now()]);
            $applied[] = $version;
        }
        $this->seedReferenceData();
        return $applied;
    }

    public function pending(): array
    {
        try {
            $done = array_column($this->db->all('SELECT version FROM schema_migrations'), 'version');
        } catch (\PDOException) {
            $done = [];
        }
        $files = glob(Config::basePath('database/migrations/*.sql')) ?: [];
        $all = array_map(fn ($f) => basename($f, '.sql'), $files);
        return array_values(array_diff($all, $done));
    }

    /** Splits a migration into statements (statements end with ';' at end of line; no procedures). */
    public static function splitSql(string $sql): array
    {
        $lines = preg_split('/\R/', $sql) ?: [];
        $out = [];
        $buf = '';
        foreach ($lines as $line) {
            $trim = trim($line);
            if ($trim === '' || str_starts_with($trim, '--')) {
                continue;
            }
            $buf .= $line . "\n";
            if (str_ends_with($trim, ';')) {
                $out[] = rtrim(trim($buf), ';');
                $buf = '';
            }
        }
        if (trim($buf) !== '') {
            $out[] = trim($buf);
        }
        return $out;
    }

    public function seedReferenceData(): void
    {
        $data = require Config::basePath('database/seeds/reference_data.php');
        $now = Database::now();

        foreach ($data['permissions'] as $slug => [$group, $desc]) {
            $this->db->run(
                'INSERT INTO permissions (slug, group_name, description) VALUES (:s, :g, :d)
                 ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description)',
                ['s' => $slug, 'g' => $group, 'd' => $desc]
            );
        }
        foreach ($data['roles'] as $slug => $role) {
            $this->db->run(
                'INSERT INTO roles (slug, name, description, is_system, created_at) VALUES (:s, :n, :d, 1, :c)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)',
                ['s' => $slug, 'n' => $role['name'], 'd' => $role['description'], 'c' => $now]
            );
            $roleId = (int) $this->db->value('SELECT id FROM roles WHERE slug = :s', ['s' => $slug]);
            $perms = $role['permissions'] === '*' ? array_keys($data['permissions']) : $role['permissions'];
            foreach ($perms as $p) {
                $this->db->run(
                    'INSERT IGNORE INTO role_permissions (role_id, permission_id)
                     SELECT :r, id FROM permissions WHERE slug = :p',
                    ['r' => $roleId, 'p' => $p]
                );
            }
        }
        foreach ($data['assets'] as $i => $a) {
            $this->db->run(
                'INSERT IGNORE INTO assets (symbol, name, coingecko_id, binance_symbol, price_decimals, quantity_decimals, color, is_active, sort_order, created_at, updated_at)
                 VALUES (:sym, :name, :cg, :bn, :pd, :qd, :color, 1, :sort, :c, :c)',
                ['sym' => $a[0], 'name' => $a[1], 'cg' => $a[2], 'bn' => $a[3], 'pd' => $a[4], 'qd' => $a[5], 'color' => $a[6], 'sort' => $i * 10, 'c' => $now]
            );
        }
        foreach ($data['payment_methods'] as $i => $pm) {
            $this->db->run(
                'INSERT IGNORE INTO payment_methods (code, name, type, fields, instructions, is_enabled, sort_order, created_at, updated_at)
                 VALUES (:code, :name, :type, :fields, :ins, 1, :sort, :c, :c)',
                ['code' => $pm['code'], 'name' => $pm['name'], 'type' => $pm['type'], 'fields' => json_encode($pm['fields']), 'ins' => $pm['instructions'], 'sort' => $i * 10, 'c' => $now]
            );
        }
        foreach ($data['allocation_rules'] as $i => [$cat, $label, $pct]) {
            $this->db->run(
                'INSERT IGNORE INTO profit_allocation_rules (category, label, percent, is_active, sort_order, updated_at)
                 VALUES (:c, :l, :p, 1, :s, :u)',
                ['c' => $cat, 'l' => $label, 'p' => $pct, 's' => $i, 'u' => $now]
            );
        }
        foreach ($data['settings'] as $key => $value) {
            $this->db->run(
                'INSERT IGNORE INTO app_settings (setting_key, value, is_secret, updated_at) VALUES (:k, :v, 0, :u)',
                ['k' => $key, 'v' => is_string($value) ? $value : json_encode($value), 'u' => $now]
            );
        }
    }
}
