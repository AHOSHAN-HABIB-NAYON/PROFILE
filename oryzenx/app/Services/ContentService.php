<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\I18n;

/**
 * Landing-page content and app translation overrides. Defaults come from resources/lang; administrators
 * may override individual strings per locale (stored in landing_page_content / translations).
 */
final class ContentService
{
    private array $cache = [];

    public function __construct(private Database $db, private AuditService $audit)
    {
    }

    /** Landing strings for a locale: file defaults merged with admin overrides. */
    public function landing(string $locale): array
    {
        if (!isset($this->cache[$locale])) {
            $base = I18n::load('en', 'landing');
            $loc = I18n::load($locale, 'landing');
            $merged = array_merge($base, $loc);
            try {
                foreach ($this->db->all('SELECT content_key, value FROM landing_page_content WHERE locale = :l', ['l' => $locale]) as $r) {
                    if (array_key_exists($r['content_key'], $merged)) {
                        $merged[$r['content_key']] = $r['value'];
                    }
                }
            } catch (\PDOException) {
                // not installed yet — file defaults only
            }
            $this->cache[$locale] = $merged;
        }
        return $this->cache[$locale];
    }

    public function landingForAdmin(): array
    {
        $keys = array_keys(I18n::load('en', 'landing'));
        $over = [];
        foreach ($this->db->all('SELECT locale, content_key, value, updated_at FROM landing_page_content') as $r) {
            $over[$r['locale']][$r['content_key']] = $r;
        }
        $out = [];
        foreach ($keys as $k) {
            $out[] = [
                'key' => $k,
                'default_en' => I18n::load('en', 'landing')[$k] ?? '',
                'default_bn' => I18n::load('bn', 'landing')[$k] ?? '',
                'en' => $over['en'][$k]['value'] ?? null,
                'bn' => $over['bn'][$k]['value'] ?? null,
            ];
        }
        return $out;
    }

    public function saveLanding(string $locale, string $key, ?string $value, int $actorId): void
    {
        if (!in_array($locale, I18n::LOCALES, true) || !array_key_exists($key, I18n::load('en', 'landing'))) {
            throw \OryzenX\Core\HttpException::validation(['key' => 'Unknown content key.']);
        }
        if ($value === null || trim($value) === '') {
            $this->db->run('DELETE FROM landing_page_content WHERE locale = :l AND content_key = :k', ['l' => $locale, 'k' => $key]);
        } else {
            $this->db->run(
                'INSERT INTO landing_page_content (locale, content_key, value, updated_by, updated_at) VALUES (:l, :k, :v, :u, :n)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)',
                // landing content is rendered as plain text (escaped), so tags are stripped
                ['l' => $locale, 'k' => $key, 'v' => mb_substr(strip_tags($value), 0, 5000), 'u' => $actorId, 'n' => Database::now()]
            );
        }
        unset($this->cache[$locale]);
        $this->audit->log($actorId, 'content.landing_updated', 'landing_content', $locale . ':' . $key);
    }

    /** App UI strings (for the web apps): file defaults + overrides. */
    public function appStrings(string $locale): array
    {
        $base = I18n::load('en', 'app');
        $merged = array_merge($base, I18n::load($locale, 'app'));
        try {
            foreach ($this->db->all('SELECT item_key, value FROM translations WHERE locale = :l AND group_name = "app"', ['l' => $locale]) as $r) {
                if (array_key_exists($r['item_key'], $merged)) {
                    $merged[$r['item_key']] = $r['value'];
                }
            }
        } catch (\PDOException) {
        }
        return $merged;
    }

    public function translationsForAdmin(string $q = '', bool $missingOnly = false): array
    {
        $en = I18n::load('en', 'app');
        $bn = I18n::load('bn', 'app');
        $over = [];
        foreach ($this->db->all('SELECT locale, item_key, value FROM translations WHERE group_name = "app"') as $r) {
            $over[$r['locale']][$r['item_key']] = $r['value'];
        }
        $out = [];
        foreach ($en as $k => $v) {
            $row = ['key' => $k, 'default_en' => $v, 'default_bn' => $bn[$k] ?? '', 'en' => $over['en'][$k] ?? null, 'bn' => $over['bn'][$k] ?? null];
            if ($missingOnly && ($bn[$k] ?? '') !== '' ) {
                continue;
            }
            if ($q !== '' && stripos($k . ' ' . $v . ' ' . ($bn[$k] ?? ''), $q) === false) {
                continue;
            }
            $out[] = $row;
        }
        return $out;
    }

    public function saveTranslation(string $locale, string $key, ?string $value, int $actorId): void
    {
        if (!in_array($locale, I18n::LOCALES, true) || !array_key_exists($key, I18n::load('en', 'app'))) {
            throw \OryzenX\Core\HttpException::validation(['key' => 'Unknown translation key.']);
        }
        if ($value === null || trim($value) === '') {
            $this->db->run('DELETE FROM translations WHERE locale = :l AND group_name = "app" AND item_key = :k', ['l' => $locale, 'k' => $key]);
        } else {
            $this->db->run(
                'INSERT INTO translations (locale, group_name, item_key, value, updated_by, updated_at) VALUES (:l, "app", :k, :v, :u, :n)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)',
                ['l' => $locale, 'k' => $key, 'v' => mb_substr(strip_tags($value), 0, 2000), 'u' => $actorId, 'n' => Database::now()]
            );
        }
        $this->audit->log($actorId, 'content.translation_updated', 'translation', $locale . ':' . $key);
    }
}
