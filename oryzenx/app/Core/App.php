<?php
declare(strict_types=1);

namespace OryzenX\Core;

use OryzenX\Services\AuditService;
use OryzenX\Services\AuthService;

/**
 * Service container + HTTP kernel.
 * Services are created lazily: App::get(SomeService::class). Constructor dependencies are auto-wired.
 */
final class App
{
    private static array $instances = [];
    private static ?Router $router = null;

    public static function get(string $class): object
    {
        if (!isset(self::$instances[$class])) {
            self::$instances[$class] = self::build($class);
        }
        return self::$instances[$class];
    }

    public static function set(string $class, object $instance): void
    {
        self::$instances[$class] = $instance;
    }

    public static function reset(): void
    {
        self::$instances = [];
        self::$router = null;
    }

    private static function build(string $class): object
    {
        if ($class === Database::class) {
            return Database::instance();
        }
        $ref = new \ReflectionClass($class);
        $ctor = $ref->getConstructor();
        if ($ctor === null) {
            return new $class();
        }
        $args = [];
        foreach ($ctor->getParameters() as $param) {
            $type = $param->getType();
            if ($type instanceof \ReflectionNamedType && !$type->isBuiltin()) {
                $args[] = self::get($type->getName());
            } elseif ($param->isDefaultValueAvailable()) {
                $args[] = $param->getDefaultValue();
            } else {
                throw new \LogicException("Cannot autowire {$class}::\${$param->getName()}");
            }
        }
        return $ref->newInstanceArgs($args);
    }

    public static function router(): Router
    {
        if (self::$router === null) {
            $r = new Router();
            foreach (['web', 'api', 'admin'] as $f) {
                (function (Router $r) use ($f) {
                    require Config::basePath("routes/{$f}.php");
                })($r);
            }
            self::$router = $r;
        }
        return self::$router;
    }

    public static function handle(Request $req): Response
    {
        AuditService::$currentIp = $req->ip();
        I18n::setLocale(I18n::detect($req));
        try {
            if (!Config::isInstalled() && !str_starts_with($req->path, '/install') && !str_starts_with($req->path, '/assets')) {
                return Response::redirect(View::url('install'));
            }
            $match = self::router()->match($req->method, $req->path);
            if ($match === null) {
                throw HttpException::notFound();
            }
            [$handler, $params, $opts] = $match;
            $req->params = $params;
            self::middleware($req, $opts);
            if (is_array($handler)) {
                [$class, $method] = $handler;
                $res = self::get($class)->$method($req);
            } else {
                $res = $handler($req);
            }
            if (!$res instanceof Response) {
                $res = Response::ok($res);
            }
        } catch (HttpException $e) {
            $res = $req->wantsJson()
                ? Response::error($e->errorCode, $e->getMessage(), $e->status, $e->fields)
                : Response::html(View::render('layouts/error', ['status' => $e->status, 'message' => $e->getMessage()]), $e->status);
            if ($e->status === 429 && isset($e->fields['retry_after'])) {
                $res->header('Retry-After', (string) $e->fields['retry_after']);
            }
        } catch (\Throwable $e) {
            Logger::error('Unhandled exception', [
                'type' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile() . ':' . $e->getLine(),
                'path' => $req->path,
            ]);
            $msg = Config::isDebug() ? $e->getMessage() : 'Something went wrong on our side. Please try again.';
            $res = $req->wantsJson()
                ? Response::error('server_error', $msg, 500)
                : Response::html(View::render('layouts/error', ['status' => 500, 'message' => $msg]), 500);
        }
        return self::securityHeaders($req, $res);
    }

    /** Authentication, verification, permission and CSRF checks declared per route. */
    private static function middleware(Request $req, array $opts): void
    {
        /** @var AuthService $auth */
        $needsAuth = !empty($opts['auth']) || !empty($opts['perm']) || !empty($opts['verified']) || !empty($opts['admin']);
        if ($needsAuth || !empty($opts['optional_auth'])) {
            $auth = self::get(AuthService::class);
            $ctx = $auth->resolve($req);
            if ($ctx !== null) {
                $req->attrs['user'] = $ctx['user'];
                $req->attrs['session'] = $ctx['session'];
            }
        }
        $isWrite = !in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true);
        if ($needsAuth) {
            $user = $req->attrs['user'] ?? null;
            if ($user === null) {
                throw HttpException::unauthorized();
            }
            if ($user['status'] !== 'active') {
                throw new HttpException(403, 'account_suspended', 'This account is suspended. Please contact support.');
            }
            if (!empty($opts['verified']) && $user['email_verified_at'] === null) {
                throw new HttpException(403, 'email_unverified', 'Please verify your email address to use this feature.');
            }
            if (!empty($opts['admin']) || !empty($opts['perm'])) {
                $auth = self::get(AuthService::class);
                if (!(int) $user['is_admin']) {
                    throw HttpException::forbidden();
                }
                if (!empty($opts['perm'])) {
                    $perms = (array) $opts['perm'];
                    foreach ($perms as $p) {
                        if (!$auth->can($user, $p)) {
                            throw HttpException::forbidden();
                        }
                    }
                }
                if (!empty($opts['reauth']) && $isWrite) {
                    $auth->requireRecentReauth($req->attrs['session']);
                }
            }
        }
        // CSRF: cookie-authenticated writes need the session token; anonymous web forms use a double-submit cookie.
        if ($isWrite && ($opts['csrf'] ?? true)) {
            $session = $req->attrs['session'] ?? null;
            $header = (string) ($req->header('X-CSRF-Token') ?? $req->post['_csrf'] ?? '');
            if ($session !== null && $session['kind'] === 'web') {
                if (!hash_equals((string) $session['csrf_token'], $header)) {
                    throw new HttpException(419, 'csrf_failed', 'Your session security token expired. Please reload the page and try again.');
                }
            } elseif ($session === null && $req->bearerToken() === null) {
                $cookie = (string) ($req->cookies['oryx_csrf'] ?? '');
                if ($cookie === '' || !hash_equals($cookie, $header)) {
                    throw new HttpException(419, 'csrf_failed', 'Your session security token expired. Please reload the page and try again.');
                }
            }
            self::checkOrigin($req);
        }
    }

    /** Rejects cross-site browser writes when an Origin header is present and does not match. */
    private static function checkOrigin(Request $req): void
    {
        $origin = $req->header('Origin');
        if ($origin === null || $origin === '' || $origin === 'null') {
            return;
        }
        $host = parse_url($origin, PHP_URL_HOST);
        $allowed = array_filter([
            parse_url((string) Config::get('app_url', ''), PHP_URL_HOST),
            $req->server['HTTP_HOST'] ?? null,
        ]);
        $allowed = array_map(fn ($h) => strtolower(preg_replace('/:\d+$/', '', (string) $h)), $allowed);
        if (!in_array(strtolower((string) $host), $allowed, true)) {
            throw new HttpException(403, 'bad_origin', 'Cross-site request blocked.');
        }
    }

    private static function securityHeaders(Request $req, Response $res): Response
    {
        $res->header('X-Content-Type-Options', 'nosniff');
        $res->header('Referrer-Policy', 'strict-origin-when-cross-origin');
        $res->header('X-Frame-Options', 'DENY');
        $res->header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        $res->header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
        if ($req->isHttps()) {
            $res->header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        if ($res->getHeader('Content-Security-Policy') === null && str_contains((string) $res->getHeader('Content-Type'), 'text/html')) {
            $res->header('Content-Security-Policy', implode('; ', [
                "default-src 'self'",
                "script-src 'self' https://accounts.google.com/gsi/client",
                "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
                "img-src 'self' data: blob: https:",
                "font-src 'self'",
                "connect-src 'self' https://accounts.google.com/gsi/",
                "frame-src https://accounts.google.com/gsi/",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "object-src 'none'",
            ]));
        }
        // Anonymous CSRF double-submit cookie for web forms.
        if (!isset($req->cookies['oryx_csrf']) && str_contains((string) $res->getHeader('Content-Type'), 'text/html')) {
            $res->cookie('oryx_csrf', Security::randomToken(24), [
                'expires' => 0,
                'path' => '/',
                'secure' => $req->isHttps(),
                'httponly' => false,
                'samesite' => 'Strict',
            ]);
        }
        return $res;
    }
}
