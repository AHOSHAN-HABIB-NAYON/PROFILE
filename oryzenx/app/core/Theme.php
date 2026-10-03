<?php
final class Theme
{
    private static function hex(string $h, string $fallback): string
    {
        return preg_match('/^#[0-9a-f]{6}$/i', $h) ? strtolower($h) : $fallback;
    }

    private static function shade(string $hex, float $f): string
    {
        [$r, $g, $b] = sscanf($hex, '#%02x%02x%02x');
        $m = fn($c) => (int)max(0, min(255, $f < 0 ? $c * (1 + $f) : $c + (255 - $c) * $f));
        return sprintf('#%02x%02x%02x', $m($r), $m($g), $m($b));
    }

    public static function palette(): array
    {
        $p = self::hex((string)setting('color_primary'), '#2563eb');
        [$r, $g, $b] = sscanf($p, '#%02x%02x%02x');
        return [
            'primary' => $p, 'dark' => self::shade($p, -0.22), 'rgb' => "$r,$g,$b",
            'secondary' => self::hex((string)setting('color_secondary'), '#0ea5e9'),
            'accent' => self::hex((string)setting('color_accent'), '#7c3aed'),
        ];
    }
}
