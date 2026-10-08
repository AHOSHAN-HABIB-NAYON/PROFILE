<?php
/**
 * Security headers incl. a nonce-based Content-Security-Policy that still
 * allows the optional third parties (Font Awesome CDN, Google Fonts, Meta
 * Pixel, GTM/Ads, Google Sign-In, YouTube product videos).
 */
final class SecurityHeaders
{
    public static function send(Request $request): void
    {
        if (headers_sent()) {
            return;
        }
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
        header_remove('X-Powered-By');
        if ($request->isSecure()) {
            header('Strict-Transport-Security: max-age=31536000');
        }
        $nonce = View::nonce();
        $csp = [
            "default-src 'self'",
            "script-src 'self' 'nonce-$nonce' 'strict-dynamic' https: 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://accounts.google.com",
            "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' https://*.facebook.com https://*.facebook.net https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.google.com https://*.doubleclick.net https://accounts.google.com",
            "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com https://www.googletagmanager.com https://*.doubleclick.net https://www.facebook.com",
            "worker-src 'self'",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self' https://accounts.google.com",
            "frame-ancestors 'self'",
        ];
        if ($request->isSecure()) {
            $csp[] = 'upgrade-insecure-requests';
        }
        header('Content-Security-Policy: ' . implode('; ', $csp));
    }
}
