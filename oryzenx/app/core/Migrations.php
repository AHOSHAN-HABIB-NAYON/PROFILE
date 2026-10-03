<?php
/** Upgrades existing installs in place. Each step is idempotent; the applied version is stored in settings. */
final class Migrations
{
    public const LATEST = 2;

    public static function run(): void
    {
        $current = (int)Settings::get('db_version', '1');
        if ($current >= self::LATEST) return;
        if ($current < 2) {
            DB::pdo()->exec("CREATE TABLE IF NOT EXISTS post_likes (
                post_id INT UNSIGNED NOT NULL, liker_hash CHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (post_id, liker_hash),
                CONSTRAINT fk_plikes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            if (!DB::val("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'likes'")) {
                DB::pdo()->exec('ALTER TABLE posts ADD likes INT UNSIGNED NOT NULL DEFAULT 0 AFTER views');
            }
        }
        Settings::set(['db_version' => (string)self::LATEST]);
    }
}
