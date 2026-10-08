<?php
/**
 * Maintenance mode: storefront shows a friendly page; admin and admin APIs keep working,
 * and logged-in admins can still preview the store.
 */
final class Maintenance
{
    public static function check(Request $request): ?Response
    {
        if (setting('maintenance_mode') !== '1') {
            return null;
        }
        $p = $request->path;
        if (str_starts_with($p, '/admin') || str_starts_with($p, '/api/admin') || in_array($p, ['/robots.txt', '/manifest.json'], true)) {
            return null;
        }
        if (AdminAuth::user()) {
            return null;
        }
        if (str_starts_with($p, '/api/')) {
            return Response::error((string)setting('maintenance_message'), 503);
        }
        $html = View::render('pages/maintenance', ['message' => setting('maintenance_message')], 'minimal');
        return Response::html($html, 503, ['Retry-After' => '3600']);
    }
}
