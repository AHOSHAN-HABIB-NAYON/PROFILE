<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** Centralized translations from resources/lang/{en,bn}/*.php. */
final class I18n
{
    public const LOCALES = ['en', 'bn'];
    private static array $cache = [];
    private static string $locale = 'en';

    public static function setLocale(string $locale): void
    {
        self::$locale = in_array($locale, self::LOCALES, true) ? $locale : 'en';
    }

    public static function locale(): string
    {
        return self::$locale;
    }

    public static function load(string $locale, string $group): array
    {
        $key = $locale . '/' . $group;
        if (!isset(self::$cache[$key])) {
            if (!in_array($locale, self::LOCALES, true) || !preg_match('/^[a-z_]+$/', $group)) {
                return [];
            }
            $file = Config::basePath("resources/lang/{$locale}/{$group}.php");
            self::$cache[$key] = is_file($file) ? (require $file) : [];
        }
        return self::$cache[$key];
    }

    /** t('landing.hero_title') */
    public static function t(string $key, array $replace = [], ?string $locale = null): string
    {
        $locale ??= self::$locale;
        [$group, $item] = array_pad(explode('.', $key, 2), 2, '');
        $lines = self::load($locale, $group);
        $text = $lines[$item] ?? self::load('en', $group)[$item] ?? $key;
        foreach ($replace as $k => $v) {
            $text = str_replace(':' . $k, (string) $v, $text);
        }
        return $text;
    }

    /** Detect locale from ?lang=, cookie, then default 'en'. */
    public static function detect(Request $req): string
    {
        $q = (string) ($req->query['lang'] ?? '');
        if (in_array($q, self::LOCALES, true)) {
            return $q;
        }
        $c = (string) ($req->cookies['oryx_lang'] ?? '');
        if (in_array($c, self::LOCALES, true)) {
            return $c;
        }
        return 'en';
    }
}
