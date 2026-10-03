<?php
final class AdminUserController
{
    public function index(): void
    {
        $q = trim((string)input('q'));
        $status = (string)input('status');
        $where = '1=1'; $params = [];
        if ($q !== '') { $where .= ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR id = ?)'; array_push($params, "%$q%", "%$q%", "%$q%", (int)$q); }
        match ($status) {
            'active' => $where .= " AND status = 'active' AND deleted_at IS NULL",
            'banned' => $where .= " AND status = 'banned'",
            'suspended' => $where .= " AND status = 'suspended'",
            'deleted' => $where .= ' AND deleted_at IS NOT NULL',
            'admin' => $where .= " AND role = 'admin'",
            'unverified' => $where .= ' AND email_verified_at IS NULL',
            default => null,
        };
        $p = DB::paginate('u.*, (SELECT COUNT(*) FROM payments WHERE user_id = u.id) AS pay_count', "FROM users u WHERE $where ORDER BY id DESC", $params, input_int('page', 1), 25);
        View::page('admin/users', ['p' => $p, 'q' => $q, 'status' => $status], ['layout' => 'admin', 'title' => t('admin.users'), 'nav' => 'users', 'cache' => false]);
    }

    private function find(string $id): array
    {
        $u = DB::row('SELECT * FROM users WHERE id = ?', [(int)$id]);
        if (!$u) throw new HttpException(t('error.404'), 404);
        return $u;
    }

    public function show(string $id): void
    {
        $u = $this->find($id);
        $data = [
            'u' => $u,
            'payments' => DB::all('SELECT p.*, o.service_title, o.order_no FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 20', [$u['id']]),
            'logins' => DB::all('SELECT * FROM login_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 15', [$u['id']]),
            'activity' => DB::all('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$u['id']]),
            'sessions' => DB::all('SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 10', [$u['id']]),
            'locations' => DB::all("SELECT country, region, city, COUNT(*) c FROM page_views WHERE user_id = ? AND country IS NOT NULL GROUP BY country, region, city ORDER BY c DESC LIMIT 5", [$u['id']]),
            'tfa' => (bool)DB::val('SELECT 1 FROM user_2fa WHERE user_id = ? AND enabled_at IS NOT NULL', [$u['id']]),
            'passkeys' => (int)DB::val('SELECT COUNT(*) FROM passkeys WHERE user_id = ?', [$u['id']]),
        ];
        View::page('admin/user', $data, ['layout' => 'admin', 'title' => $u['name'], 'nav' => 'users', 'cache' => false]);
    }

    public function update(string $id): void
    {
        $u = $this->find($id);
        validate(['name' => 'required|max:100', 'email' => 'required|email|max:190', 'phone' => 'max:30', 'role' => 'required|in:user,admin']);
        $email = mb_strtolower((string)input('email'));
        if (DB::val('SELECT 1 FROM users WHERE email = ? AND id <> ?', [$email, $u['id']])) fail(t('auth.email_taken'), ['email' => t('auth.email_taken')]);
        if ((int)$u['id'] === Auth::id() && input('role') !== 'admin') fail(t('admin.self_demote'));
        DB::update('users', ['name' => input('name'), 'email' => $email, 'phone' => input('phone') ?: null, 'role' => input('role'),
            'email_verified_at' => input('verified') === '1' ? ($u['email_verified_at'] ?: now()) : null], 'id = ?', [$u['id']]);
        Auth::activity('admin_user_updated', "#{$u['id']}");
        respond(true, t('common.saved'), '/admin/users/' . $u['id']);
    }

    public function action(string $id): void
    {
        $u = $this->find($id);
        $act = (string)input('action');
        $self = (int)$u['id'] === Auth::id();
        if ($self && in_array($act, ['ban', 'suspend', 'delete'], true)) fail(t('admin.self_action'));
        $msg = t('common.saved');
        switch ($act) {
            case 'ban':
                $hours = max(1, input_int('hours', 24));
                DB::q("UPDATE users SET status = 'banned', banned_until = ?, ban_reason = ? WHERE id = ?", [date('Y-m-d H:i:s', time() + $hours * 3600), mb_substr((string)input('reason'), 0, 255) ?: null, $u['id']]);
                DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']]);
                break;
            case 'suspend':
                DB::q("UPDATE users SET status = 'suspended', banned_until = NULL, ban_reason = ? WHERE id = ?", [mb_substr((string)input('reason'), 0, 255) ?: null, $u['id']]);
                DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']]);
                break;
            case 'activate':
                DB::q("UPDATE users SET status = 'active', banned_until = NULL, ban_reason = NULL WHERE id = ?", [$u['id']]);
                break;
            case 'delete':
                DB::q('UPDATE users SET deleted_at = NOW() WHERE id = ?', [$u['id']]);
                DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']]);
                $msg = t('admin.user_deleted');
                break;
            case 'restore':
                DB::q('UPDATE users SET deleted_at = NULL WHERE id = ?', [$u['id']]);
                break;
            case 'logout':
                DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$u['id']]);
                $msg = t('admin.sessions_ended');
                break;
            case 'reset_2fa':
                DB::q('DELETE FROM user_2fa WHERE user_id = ?', [$u['id']]);
                break;
            case 'balance':
                $amount = (float)input('amount');
                if ($amount == 0.0 || abs($amount) > 1_000_000) fail(t('valid.numeric'), ['amount' => t('valid.numeric')]);
                DB::q('UPDATE users SET balance = balance + ? WHERE id = ?', [$amount, $u['id']]);
                Notifier::send([(int)$u['id']], t('notif.balance_title'), t('notif.balance_text', ['amount' => money(abs($amount)), 'dir' => $amount > 0 ? '+' : '−']), ['icon' => 'fa-solid fa-coins', 'link' => '/profile']);
                break;
            case 'notify':
                if (input('title') === '' || input('message') === '') fail(t('valid.required'));
                Notifier::send([(int)$u['id']], (string)input('title'), (string)input('message'), ['link' => input('link') ?: null, 'email' => input('email') === '1', 'created_by' => Auth::id()]);
                $msg = t('admin.notif_sent', ['n' => num(1)]);
                break;
            default:
                fail(t('valid.in'));
        }
        Auth::activity('admin_user_' . $act, "#{$u['id']}");
        respond(true, $msg, '/admin/users/' . $u['id']);
    }
}
