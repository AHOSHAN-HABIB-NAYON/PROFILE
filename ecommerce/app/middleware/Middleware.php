<?php
/**
 * Middleware dispatcher. Route definitions reference middleware by name:
 *   'admin'             – admin must be logged in
 *   'admin.csrf'        – admin CSRF token (non-GET)
 *   'csrf.public'       – storefront double-submit CSRF cookie
 *   'role:area'         – admin role may access area
 *   'throttle:key,max,seconds'
 */
final class Middleware
{
    public static function run(string $spec, Request $request): ?Response
    {
        [$name, $arg] = array_pad(explode(':', $spec, 2), 2, '');
        return match ($name) {
            'admin'       => AdminAuth::handle($request),
            'admin.csrf'  => self::adminCsrf($request),
            'csrf.public' => self::publicCsrf($request),
            'role'        => AdminAuth::authorize($arg) ? null : self::deny(),
            'throttle'    => self::throttle($request, $arg),
            default       => throw new RuntimeException('Unknown middleware ' . $name),
        };
    }

    private static function adminCsrf(Request $r): ?Response
    {
        if ($r->method === 'GET' || $r->method === 'HEAD') {
            return null;
        }
        return Csrf::verifyAdmin($r) ? null : Response::error('সেশনের মেয়াদ শেষ। পেজটি রিফ্রেশ করুন।', 419);
    }

    private static function publicCsrf(Request $r): ?Response
    {
        return Csrf::verifyPublic($r) ? null : Response::error('পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।', 419);
    }

    private static function throttle(Request $r, string $arg): ?Response
    {
        [$key, $max, $seconds] = array_pad(explode(',', $arg), 3, null);
        $allowed = RateLimiter::hit('throttle:' . $key . ':' . $r->ip(), (int)($max ?: 60), (int)($seconds ?: 60));
        return $allowed ? null : Response::error('অনেক বেশি অনুরোধ। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
    }

    private static function deny(): Response
    {
        if (Request::current()->expectsJson() && !Request::current()->isSpa()) {
            return Response::error('এই কাজের অনুমতি আপনার নেই।', 403);
        }
        return View::page('admin:pages/forbidden', [], ['title' => 'Access denied', 'status' => 403, 'nav' => ''], 'admin');
    }
}
