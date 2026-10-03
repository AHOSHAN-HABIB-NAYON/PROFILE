<?php
final class Middleware
{
    public static function run(string $name): void
    {
        switch ($name) {
            case 'auth':
                if (!Auth::user()) {
                    if (is_json_request() && !is_spa()) json_out(['ok' => false, 'message' => t('auth.login_required'), 'redirect' => url('/login')], 401);
                    $_SESSION['intended'] = current_path_with_query();
                    redirect('/login');
                }
                break;
            case 'guest':
                if (Auth::user()) redirect('/profile');
                break;
            case 'admin':
                $u = Auth::user();
                if (!$u) { $_SESSION['intended'] = current_path_with_query(); redirect('/login'); }
                if ($u['role'] !== 'admin') throw new HttpException(t('error.403'), 403);
                break;
            default:
                throw new LogicException("Unknown middleware $name");
        }
    }
}
