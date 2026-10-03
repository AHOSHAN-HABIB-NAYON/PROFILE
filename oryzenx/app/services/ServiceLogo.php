<?php
/**
 * Professional animated SVG logos for services. Each logo is a gradient tile with
 * a recognisable glyph (Node hexagon, React atom, cart, candles…) and a subtle
 * CSS/SMIL animation. Uploaded custom icons still take priority.
 */
final class ServiceLogo
{
    private const T = 'font-family="Inter,Arial,sans-serif" font-weight="800" fill="#fff" stroke="none" text-anchor="middle"';

    /** key => [gradient start, gradient end, svg inner markup] */
    private static function defs(): array
    {
        $t = self::T;
        $gear = '';
        for ($i = 0; $i < 8; $i++) {
            $a = deg2rad($i * 45);
            $gear .= sprintf('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="4.6"/>', 24 + cos($a) * 10.5, 24 + sin($a) * 10.5, 24 + cos($a) * 15, 24 + sin($a) * 15);
        }
        return [
            'node' => ['#1f6f35', '#5fb846', '<path class="lg-draw" pathLength="100" d="M24 5l16.5 9.5v19L24 43 7.5 33.5v-19z"/><text x="24" y="29" font-size="12.5" ' . $t . '>JS</text>'],
            'react' => ['#0b1220', '#1e3a5f', '<g class="lg-spin" stroke="#61dafb" stroke-width="2.1"><ellipse cx="24" cy="24" rx="18" ry="6.8"/><ellipse cx="24" cy="24" rx="18" ry="6.8" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="18" ry="6.8" transform="rotate(120 24 24)"/></g><circle class="lg-pulse" cx="24" cy="24" r="3.6" fill="#61dafb" stroke="none"/>'],
            'php' => ['#3f4a87', '#8892bf', '<g class="lg-float"><ellipse cx="24" cy="24" rx="19" ry="11.5" stroke-width="2.2"/><text x="24" y="28.4" font-size="12.5" font-style="italic" ' . $t . '>php</text></g>'],
            'html' => ['#d9480f', '#f59e0b', '<path class="lg-float" d="M10 7h28l-2.6 29L24 41l-11.4-5z"/><text x="24" y="27.5" font-size="10.5" ' . $t . '>&lt;/&gt;</text>'],
            'landing' => ['#6d28d9', '#c084fc', '<rect x="6" y="9" width="36" height="30" rx="4"/><path d="M6 16h36"/><circle cx="10.5" cy="12.6" r="1.1" fill="#fff"/><circle cx="14.5" cy="12.6" r="1.1" fill="#fff"/><circle cx="18.5" cy="12.6" r="1.1" fill="#fff"/><path d="M14 22h20"/><path d="M18 27h12" opacity=".7"/><rect class="lg-pulse" x="17" y="31" width="14" height="4.6" rx="2.3" fill="#fff" stroke="none"/>'],
            'api' => ['#0e7490', '#22d3ee', '<path d="M15 24l18-9M15 24l18 9"/><circle cx="11" cy="24" r="4.2" fill="#fff"/><circle cx="37" cy="13" r="4.2"/><circle cx="37" cy="35" r="4.2"/><circle r="2.1" fill="#fff" stroke="none"><animateMotion dur="1.6s" repeatCount="indefinite" path="M15 24L33 15"/></circle><circle r="2.1" fill="#fff" stroke="none"><animateMotion dur="1.6s" begin=".8s" repeatCount="indefinite" path="M15 24L33 33"/></circle>'],
            'rest' => ['#0369a1', '#38bdf8', '<path d="M18 10c-4 0-4 3-4 6v3c0 2-1 4-4 5 3 1 4 3 4 5v3c0 3 0 6 4 6M30 10c4 0 4 3 4 6v3c0 2 1 4 4 5-3 1-4 3-4 5v3c0 3 0 6-4 6"/><circle class="lg-blink" cx="19.5" cy="24" r="1.9" fill="#fff" stroke="none"/><circle class="lg-blink d2" cx="24" cy="24" r="1.9" fill="#fff" stroke="none"/><circle class="lg-blink d3" cx="28.5" cy="24" r="1.9" fill="#fff" stroke="none"/>'],
            'plug' => ['#0f766e', '#2dd4bf', '<g class="lg-plug"><path d="M18 7v8M30 7v8M13 15h22v6a11 11 0 0 1-22 0z"/></g><path d="M24 32v9"/><path class="lg-blink" d="M26 20l-3 5h4l-3 5" stroke-width="2"/>'],
            'admin' => ['#1d4ed8', '#60a5fa', '<rect x="6" y="9" width="36" height="30" rx="4"/><path d="M16 9v30"/><path d="M9.5 15h3M9.5 20h3M9.5 25h3" stroke-width="2"/><rect class="lg-bar" x="21" y="27" width="4.2" height="8" rx="1" fill="#fff" stroke="none"/><rect class="lg-bar d2" x="27.5" y="20" width="4.2" height="15" rx="1" fill="#fff" stroke="none"/><rect class="lg-bar d3" x="34" y="24" width="4.2" height="11" rx="1" fill="#fff" stroke="none"/>'],
            'dashboard' => ['#2563eb', '#8b5cf6', '<circle cx="24" cy="24" r="15"/><path class="lg-wedge" d="M24 24V9a15 15 0 0 1 14.3 19.6z" fill="#fff" stroke="none"/>'],
            'cart' => ['#be185d', '#f472b6', '<path d="M5 9h5.5l4.5 20h20l4-13H13"/><circle cx="18" cy="36" r="2.6" fill="#fff"/><circle cx="32" cy="36" r="2.6" fill="#fff"/><rect class="lg-drop" x="20.5" y="13" width="7" height="7" rx="1.6" fill="#fff" stroke="none"/><rect class="lg-drop d2" x="28" y="15" width="5.5" height="5.5" rx="1.4" fill="#fff" stroke="none" opacity=".85"/>'],
            'job' => ['#0f766e', '#34d399', '<g class="lg-float"><rect x="7" y="15" width="34" height="23" rx="4"/><path d="M18 15v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M7 25h34"/><rect x="21" y="22.5" width="6" height="5" rx="1.2" fill="#fff" stroke="none"/></g>'],
            'trading' => ['#14532d', '#22c55e', '<path d="M13 11v26M24 7v26M35 15v26" stroke-width="2"/><rect class="lg-bar" x="10.2" y="17" width="5.6" height="12" rx="1.2" fill="#fff" stroke="none"/><rect class="lg-bar d2" x="21.2" y="12" width="5.6" height="15" rx="1.2" fill="#fff" stroke="none"/><rect class="lg-bar d3" x="32.2" y="21" width="5.6" height="13" rx="1.2" fill="#fff" stroke="none"/>'],
            'invest' => ['#b45309', '#fbbf24', '<path class="lg-draw" pathLength="100" d="M7 36l10-10 7 6 15-16"/><path d="M31 16h8v8"/><circle cx="12" cy="13" r="6"/><text x="12" y="16.4" font-size="9" ' . $t . '>$</text>'],
            'portfolio' => ['#7c3aed', '#ec4899', '<g class="lg-float"><rect x="6" y="10" width="36" height="28" rx="4"/><circle cx="17" cy="21" r="4.5"/><path d="M10.5 33c1.5-4 4-5.5 6.5-5.5s5 1.5 6.5 5.5M27 19h9M27 25h9M27 31h6"/></g>'],
            'business' => ['#1e3a8a', '#3b82f6', '<path d="M12 41V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v32M30 17h7a2 2 0 0 1 2 2v22M8 41h33"/><g fill="#fff" stroke="none"><rect class="lg-blink" x="16" y="12" width="3.6" height="3.6" rx=".6"/><rect class="lg-blink d2" x="22.4" y="12" width="3.6" height="3.6" rx=".6"/><rect class="lg-blink d3" x="16" y="19" width="3.6" height="3.6" rx=".6"/><rect class="lg-blink" x="22.4" y="19" width="3.6" height="3.6" rx=".6"/><rect class="lg-blink d2" x="16" y="26" width="3.6" height="3.6" rx=".6"/><rect class="lg-blink d3" x="22.4" y="26" width="3.6" height="3.6" rx=".6"/><rect x="19" y="33" width="4" height="8" rx=".6"/></g>'],
            'news' => ['#b91c1c', '#fb923c', '<path d="M8 10h26v27a3 3 0 0 0 3 3H11a3 3 0 0 1-3-3zM34 16h5v21a3 3 0 0 1-3 3"/><path class="lg-blink" d="M13 16h16" stroke-width="3.2"/><path d="M13 23h7M13 28h7M13 33h16" stroke-width="2"/><rect x="22.5" y="21" width="6.5" height="9" rx="1" fill="#fff" stroke="none"/>'],
            'blog' => ['#c2410c', '#fdba74', '<g class="lg-write"><path d="M31 7l10 10-19 19H12V26z"/><path d="M27 11l10 10"/></g><path class="lg-draw" pathLength="100" d="M7 42h18" stroke-width="2.4"/>'],
            'cms' => ['#3730a3', '#818cf8', '<path class="lg-float" d="M24 7l17 8.5L24 24 7 15.5z" fill="#fff" fill-opacity=".95"/><path d="M7 24l17 8.5L41 24"/><path d="M7 32l17 8.5L41 32" opacity=".75"/>'],
            'code' => ['#0f172a', '#2563eb', '<path class="lg-left" d="M17 13l-10 11 10 11"/><path class="lg-right" d="M31 13l10 11-10 11"/><path d="M27 10l-6 28"/>'],
            'webapp' => ['#1e40af', '#06b6d4', '<rect x="5" y="8" width="38" height="32" rx="4"/><path d="M5 15h38"/><circle cx="9.5" cy="11.6" r="1.1" fill="#fff"/><circle cx="13.5" cy="11.6" r="1.1" fill="#fff"/><path class="lg-left" d="M19 21l-5 6 5 6"/><path class="lg-right" d="M29 21l5 6-5 6"/><path d="M26 19.5l-4 15" stroke-width="2.2"/>'],
            'pwa' => ['#047857', '#34d399', '<rect x="14" y="5" width="20" height="38" rx="4.5"/><path d="M21 38h6"/><g class="lg-bounce"><path d="M24 13v12M19 20.5l5 5 5-5"/></g>'],
            'speed' => ['#15803d', '#a3e635', '<path d="M8 33a16 16 0 1 1 32 0"/><path d="M12 22l2.5 1.5M24 13v3M36 22l-2.5 1.5" stroke-width="2"/><path class="lg-needle" d="M24 33l8-11"/><circle cx="24" cy="33" r="3" fill="#fff" stroke="none"/>'],
            'seo' => ['#c2410c', '#f59e0b', '<g class="lg-scan"><circle cx="21" cy="21" r="12"/><path d="M30 30l10 10" stroke-width="3.4"/><rect class="lg-bar" x="14.5" y="21" width="3.4" height="6" rx=".8" fill="#fff" stroke="none"/><rect class="lg-bar d2" x="19.4" y="17" width="3.4" height="10" rx=".8" fill="#fff" stroke="none"/><rect class="lg-bar d3" x="24.3" y="14" width="3.4" height="13" rx=".8" fill="#fff" stroke="none"/></g>'],
            'security' => ['#991b1b', '#ef4444', '<path d="M24 5l15 5.5v11c0 9.5-6.5 17.5-15 21-8.5-3.5-15-11.5-15-21v-11z"/><path class="lg-draw" pathLength="100" d="M16.5 24l5.5 5.5 10-11" stroke-width="3"/>'],
            'payment' => ['#be123c', '#fb7185', '<rect x="5" y="11" width="38" height="26" rx="4.5"/><path d="M5 18.5h38" stroke-width="4"/><rect x="10" y="25" width="9" height="6.5" rx="1.5" fill="#fff" stroke="none"/><path class="lg-blink" d="M31 25.5a4 4 0 0 1 0 5.5"/><path class="lg-blink d2" d="M35 23.5a7.5 7.5 0 0 1 0 9.5"/>'],
            'ai' => ['#5b21b6', '#a78bfa', '<rect x="12" y="12" width="24" height="24" rx="5"/><path d="M18 6v6M24 6v6M30 6v6M18 36v6M24 36v6M30 36v6M6 18h6M6 24h6M6 30h6M36 18h6M36 24h6M36 30h6" stroke-width="2.2" class="lg-blink"/><text x="24" y="28.3" font-size="11" ' . $t . '>AI</text>'],
            'spark' => ['#065f46', '#10b981', '<path class="lg-twinkle" d="M24 6c1.6 8.4 4.2 11 12.5 12.5C28.2 20 25.6 22.6 24 31c-1.6-8.4-4.2-11-12.5-12.5C19.8 17 22.4 14.4 24 6z" fill="#fff" stroke="none"/><path class="lg-twinkle d2" d="M36 29c.7 3.4 1.8 4.5 5 5.2-3.2.7-4.3 1.8-5 5.2-.7-3.4-1.8-4.5-5-5.2 3.2-.7 4.3-1.8 5-5.2z" fill="#fff" stroke="none"/>'],
            'gear' => ['#1e293b', '#64748b', '<g class="lg-spin">' . $gear . '<circle cx="24" cy="24" r="10.5"/></g><circle cx="24" cy="24" r="3.6" fill="#fff" stroke="none"/>'],
            'database' => ['#075985', '#38bdf8', '<ellipse cx="24" cy="11.5" rx="13" ry="5"/><path d="M11 11.5v25c0 2.8 5.8 5 13 5s13-2.2 13-5v-25"/><path class="lg-blink" d="M11 20c0 2.8 5.8 5 13 5s13-2.2 13-5"/><path class="lg-blink d2" d="M11 28.5c0 2.8 5.8 5 13 5s13-2.2 13-5"/>'],
        ];
    }

    /** Picks a logo for a service by slug first, then by keywords in slug/title. */
    public static function keyFor(array $s): ?string
    {
        $slug = strtolower((string)($s['slug'] ?? ''));
        $exact = ['nodejs' => 'node', 'react' => 'react', 'php' => 'php', 'html-css' => 'html', 'landing-page' => 'landing', 'api' => 'api', 'rest-api' => 'rest',
            'third-party-api' => 'plug', 'admin-panel' => 'admin', 'dashboard' => 'dashboard', 'ecommerce' => 'cart', 'job-website' => 'job', 'trading-website' => 'trading',
            'investment-website' => 'invest', 'portfolio' => 'portfolio', 'business-website' => 'business', 'news-website' => 'news', 'blog-website' => 'blog', 'cms' => 'cms',
            'custom-web-app' => 'webapp', 'pwa' => 'pwa', 'optimization' => 'speed', 'seo' => 'seo', 'security' => 'security', 'payment-integration' => 'payment',
            'ai-integration' => 'ai', 'openai-integration' => 'spark', 'automation' => 'gear', 'database' => 'database', 'custom-software' => 'code'];
        if (isset($exact[$slug])) return $exact[$slug];
        $hay = $slug . ' ' . strtolower((string)($s['title'] ?? ''));
        foreach ([
            'node' => 'node', 'react|next' => 'react', 'php|laravel|wordpress' => 'php', 'html|css|static' => 'html', 'landing' => 'landing', 'rest' => 'rest',
            'third|plug|integrat' => 'plug', 'api' => 'api', 'admin' => 'admin', 'dashboard|analytic|report' => 'dashboard', 'shop|commerce|store|cart' => 'cart',
            'job|career|hr' => 'job', 'trad|crypto|forex|exchange' => 'trading', 'invest|finance|fund' => 'invest', 'portfolio|resume|cv' => 'portfolio',
            'business|company|corporate' => 'business', 'news|magazine' => 'news', 'blog' => 'blog', 'cms|content' => 'cms', 'pwa|mobile|app' => 'pwa',
            'optimi|speed|perform' => 'speed', 'seo|search' => 'seo', 'secur|ssl|malware' => 'security', 'payment|gateway|bkash|stripe' => 'payment',
            'openai|gpt|chatbot' => 'spark', '\bai\b|machine|ml' => 'ai', 'automat|bot|script' => 'gear', 'database|sql|mongo' => 'database', 'software|custom|code' => 'code',
        ] as $re => $key) {
            if (preg_match('/' . $re . '/', $hay)) return $key;
        }
        return null;
    }

    /** @param string $size sm|md|lg */
    public static function render(array $s, string $size = 'md'): string
    {
        $cls = 'svc-logo svc-logo-' . preg_replace('/[^a-z]/', '', $size);
        if (!empty($s['icon_image'])) {
            return '<span class="' . $cls . ' svc-logo-img"><img src="' . e(upload_url($s['icon_image'])) . '" alt="" loading="lazy"></span>';
        }
        $key = self::keyFor($s);
        if ($key === null) {
            $c = preg_match('/^#[0-9a-f]{6}$/i', (string)($s['icon_color'] ?? '')) ? $s['icon_color'] : '#2563eb';
            return '<span class="' . $cls . ' svc-logo-fa" style="--g1:' . e($c) . ';--g2:' . e($c) . 'aa">' . icon_html($s['icon'] ?? null) . '</span>';
        }
        [$g1, $g2, $inner] = self::defs()[$key];
        return '<span class="' . $cls . ' lg-' . $key . '" style="--g1:' . $g1 . ';--g2:' . $g2 . '" aria-hidden="true">'
            . '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' . $inner . '</svg></span>';
    }
}
