<?php
/**
 * Admin authentication guard: session + server-side session registry
 * (admin_sessions) so sessions can be listed and revoked from Security.
 */
final class AdminAuth
{
    private const IDLE_TIMEOUT = 8 * 3600;
    private static ?array $user = null;
    private static bool $resolved = false;

    public static function handle(Request $request): ?Response
    {
        if (self::user()) {
            return null;
        }
        if ($request->expectsJson() && !$request->isSpa()) {
            return Response::error('অনুগ্রহ করে আবার লগইন করুন।', 401);
        }
        $next = $request->method === 'GET' ? $request->path : '/admin';
        return Response::redirect(url('/admin/login', ['next' => $next]));
    }

    public static function user(): ?array
    {
        if (self::$resolved) {
            return self::$user;
        }
        self::$resolved = true;
        if (!Session::hasCookie()) {
            return null;
        }
        Session::start();
        $id = (int)Session::get('admin_id', 0);
        if ($id <= 0 || Session::get('admin_pending_2fa')) {
            return null;
        }
        $hash = hash('sha256', Session::id());
        $row = DB::one(
            'SELECT a.id, a.name, a.email, a.role, a.status, a.two_factor_enabled, s.id AS sid, s.last_activity
             FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
             WHERE s.session_hash = ? AND s.admin_id = ? AND s.revoked_at IS NULL LIMIT 1',
            [$hash, $id]
        );
        if (!$row || $row['status'] !== 'active' || strtotime($row['last_activity']) < time() - self::IDLE_TIMEOUT) {
            Session::destroy();
            return null;
        }
        if (strtotime($row['last_activity']) < time() - 60) {
            DB::exec('UPDATE admin_sessions SET last_activity = NOW() WHERE id = ?', [$row['sid']]);
        }
        return self::$user = $row;
    }

    /** Start an authenticated session after password/Google (+2FA) verification. */
    public static function login(array $admin): void
    {
        Session::regenerate();
        Session::forget('admin_pending_2fa');
        Session::set('admin_id', (int)$admin['id']);
        $r = Request::current();
        DB::insert('admin_sessions', [
            'admin_id'      => (int)$admin['id'],
            'session_hash'  => hash('sha256', Session::id()),
            'ip'            => $r->ip(),
            'user_agent'    => mb_substr($r->userAgent(), 0, 255),
            'last_activity' => date('Y-m-d H:i:s'),
        ]);
        DB::exec('UPDATE admins SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?', [$r->ip(), $admin['id']]);
        self::$resolved = false;
        Audit::log('admin.login', 'admin', (int)$admin['id']);
    }

    public static function logout(): void
    {
        Session::start();
        DB::exec('UPDATE admin_sessions SET revoked_at = NOW() WHERE session_hash = ?', [hash('sha256', Session::id())]);
        Session::destroy();
        self::$user = null;
    }

    public static function authorize(string $area): bool
    {
        $user = self::user();
        if (!$user) {
            return false;
        }
        $restricted = config('role_restrictions')[$user['role']] ?? [];
        foreach ($restricted as $r) {
            if ($area === $r || str_starts_with($area, $r . '.')) {
                return false;
            }
        }
        return true;
    }

    public static function id(): ?int
    {
        return self::user()['id'] ?? null;
    }
}
