<?php
final class UserAgent
{
    public static function parse(string $ua): array
    {
        $device = preg_match('/iPad|Tablet|(Android(?!.*Mobile))/i', $ua) ? 'ট্যাবলেট'
            : (preg_match('/Mobile|Android|iPhone|iPod|Opera Mini|IEMobile/i', $ua) ? 'মোবাইল' : 'ডেস্কটপ');
        if (preg_match('/bot|crawl|spider|slurp|facebookexternalhit|preview/i', $ua)) {
            $device = 'বট';
        }
        $browser = match (true) {
            (bool) preg_match('/FBAN|FBAV/i', $ua)     => 'Facebook App',
            (bool) preg_match('/Edg\//i', $ua)         => 'Edge',
            (bool) preg_match('/OPR\/|Opera/i', $ua)   => 'Opera',
            (bool) preg_match('/SamsungBrowser/i', $ua)=> 'Samsung Internet',
            (bool) preg_match('/UCBrowser/i', $ua)     => 'UC Browser',
            (bool) preg_match('/Firefox\//i', $ua)     => 'Firefox',
            (bool) preg_match('/Chrome\//i', $ua)      => 'Chrome',
            (bool) preg_match('/Safari\//i', $ua)      => 'Safari',
            default => 'অন্যান্য',
        };
        $os = match (true) {
            (bool) preg_match('/Android/i', $ua)            => 'Android',
            (bool) preg_match('/iPhone|iPad|iPod/i', $ua)   => 'iOS',
            (bool) preg_match('/Windows/i', $ua)            => 'Windows',
            (bool) preg_match('/Mac OS X|Macintosh/i', $ua) => 'macOS',
            (bool) preg_match('/Linux/i', $ua)              => 'Linux',
            default => 'অন্যান্য',
        };
        return ['device' => $device, 'browser' => $browser, 'os' => $os, 'bot' => $device === 'বট'];
    }
}
