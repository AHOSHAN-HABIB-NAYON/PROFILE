<?php
/** Lightweight user-agent parsing for analytics and session lists. */
final class UA
{
    public static function parse(string $ua): array
    {
        $device = preg_match('/iPad|Tablet|(Android(?!.*Mobile))/i', $ua) ? 'tablet'
            : (preg_match('/Mobi|Android|iPhone|iPod/i', $ua) ? 'mobile' : 'desktop');
        $browser = match (true) {
            (bool)preg_match('/Edg\//', $ua) => 'Edge',
            (bool)preg_match('/OPR\/|Opera/', $ua) => 'Opera',
            (bool)preg_match('/SamsungBrowser/', $ua) => 'Samsung Internet',
            (bool)preg_match('/UCBrowser/', $ua) => 'UC Browser',
            (bool)preg_match('/Firefox|FxiOS/', $ua) => 'Firefox',
            (bool)preg_match('/CriOS|Chrome/', $ua) => 'Chrome',
            (bool)preg_match('/Safari/', $ua) => 'Safari',
            default => 'Other',
        };
        $os = match (true) {
            (bool)preg_match('/Windows/', $ua) => 'Windows',
            (bool)preg_match('/Android/', $ua) => 'Android',
            (bool)preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            (bool)preg_match('/Mac OS X/', $ua) => 'macOS',
            (bool)preg_match('/CrOS/', $ua) => 'ChromeOS',
            (bool)preg_match('/Linux/', $ua) => 'Linux',
            default => 'Other',
        };
        return ['device' => $device, 'browser' => $browser, 'os' => $os];
    }

    public static function summary(string $ua): string
    {
        $p = self::parse($ua);
        return $p['browser'] . ' · ' . $p['os'];
    }

    public static function isBot(string $ua): bool
    {
        return $ua === '' || (bool)preg_match('/bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|headless|lighthouse/i', $ua);
    }
}
