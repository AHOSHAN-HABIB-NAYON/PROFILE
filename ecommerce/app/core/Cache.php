<?php
/**
 * File cache (shared-hosting friendly, no Redis needed).
 * Keys are grouped ("catalog:home") so a whole group can be flushed when
 * products, categories or settings change.
 */
final class Cache
{
    private static array $memory = [];

    public static function remember(string $key, int $ttl, callable $fn): mixed
    {
        $hit = self::get($key, $found);
        if ($found) {
            return $hit;
        }
        $value = $fn();
        self::set($key, $value, $ttl);
        return $value;
    }

    public static function get(string $key, ?bool &$found = null): mixed
    {
        $found = false;
        if (array_key_exists($key, self::$memory)) {
            $found = true;
            return self::$memory[$key];
        }
        $file = self::path($key);
        if (!is_file($file)) {
            return null;
        }
        $raw = @file_get_contents($file);
        if ($raw === false) {
            return null;
        }
        $payload = @unserialize($raw, ['allowed_classes' => false]);
        if (!is_array($payload) || ($payload['e'] !== 0 && $payload['e'] < time())) {
            @unlink($file);
            return null;
        }
        $found = true;
        return self::$memory[$key] = $payload['v'];
    }

    public static function set(string $key, mixed $value, int $ttl = 300): void
    {
        self::$memory[$key] = $value;
        $file = self::path($key);
        $tmp = $file . '.' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, serialize(['e' => $ttl > 0 ? time() + $ttl : 0, 'v' => $value]), LOCK_EX) !== false) {
            @rename($tmp, $file);
        }
    }

    public static function forget(string $key): void
    {
        unset(self::$memory[$key]);
        @unlink(self::path($key));
    }

    /** Delete every key in a group (prefix before ":"). */
    public static function flushGroup(string $group): void
    {
        foreach (array_keys(self::$memory) as $k) {
            if (str_starts_with($k, $group . ':')) {
                unset(self::$memory[$k]);
            }
        }
        foreach (glob(STORAGE_PATH . '/cache/' . self::slug($group) . '__*.cache') ?: [] as $file) {
            @unlink($file);
        }
    }

    public static function flushAll(): void
    {
        self::$memory = [];
        foreach (glob(STORAGE_PATH . '/cache/*.cache') ?: [] as $file) {
            @unlink($file);
        }
    }

    /**
     * Catalog changed → flush server caches and bump the version so browsers
     * drop their in-memory page cache on the next navigation.
     */
    public static function catalogChanged(): void
    {
        self::flushGroup('catalog');
        Setting::set('cache_version', (string)((int)setting('cache_version', 1) + 1));
    }

    private static function path(string $key): string
    {
        $group = str_contains($key, ':') ? strstr($key, ':', true) : 'misc';
        return STORAGE_PATH . '/cache/' . self::slug($group) . '__' . md5($key) . '.cache';
    }

    private static function slug(string $s): string
    {
        return preg_replace('/[^a-z0-9_-]/i', '', $s) ?: 'misc';
    }
}
