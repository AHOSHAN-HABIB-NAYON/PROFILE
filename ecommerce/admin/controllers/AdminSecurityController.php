<?php
/**
 * Security centre: duplicate-order protection, IP blocks, alerts, admin sessions,
 * admin users, audit log, and the signed-in admin's password & 2FA.
 */
final class AdminSecurityController extends AdminController
{
    public function index(Request $r): Response
    {
        DB::exec("DELETE FROM blocked_ips WHERE type = 'temporary' AND expires_at < NOW() - INTERVAL 30 DAY");
        return $this->page('security', [
            'blocked' => DB::all('SELECT b.*, a.name AS admin_name FROM blocked_ips b LEFT JOIN admins a ON a.id = b.created_by ORDER BY b.id DESC LIMIT 200'),
            'alerts' => DB::all('SELECT * FROM security_alerts ORDER BY is_resolved ASC, id DESC LIMIT 50'),
            'attempts' => DB::all('SELECT ip, reason, COUNT(*) AS c, MAX(created_at) AS last_at FROM order_attempts WHERE created_at > NOW() - INTERVAL 7 DAY GROUP BY ip, reason ORDER BY last_at DESC LIMIT 50'),
            'sessions' => DB::all('SELECT s.id, s.ip, s.user_agent, s.last_activity, s.created_at, s.session_hash, a.name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.revoked_at IS NULL AND s.last_activity > NOW() - INTERVAL 8 HOUR ORDER BY s.last_activity DESC'),
            'logins' => DB::all('SELECT ip, email, success, created_at FROM login_attempts ORDER BY id DESC LIMIT 30'),
            'admins' => DB::all('SELECT id, name, email, role, status, two_factor_enabled, last_login_at FROM admins ORDER BY id'),
            'logs' => DB::all('SELECT l.*, a.name AS admin_name FROM logs l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 60'),
            'currentHash' => hash('sha256', Session::id()),
            'canManageAdmins' => AdminAuth::authorize('security.admins'),
        ], ['title' => 'Security', 'nav' => 'security', 'page' => 'security']);
    }

    public function saveDuplicate(Request $r): Response
    {
        $values = [
            'dup_enabled' => $r->bool('dup_enabled') ? '1' : '0',
            'dup_window_hours' => (string)max(1, min(720, $r->int('dup_window_hours', 24))),
            'dup_block_hours' => (string)max(1, min(8760, $r->int('dup_block_hours', 24))),
            'dup_max_attempts' => (string)max(1, min(50, $r->int('dup_max_attempts', 3))),
            'dup_check_ip' => $r->bool('dup_check_ip') ? '1' : '0',
            'dup_check_phone' => $r->bool('dup_check_phone') ? '1' : '0',
            'dup_check_device' => $r->bool('dup_check_device') ? '1' : '0',
        ];
        $old = array_intersect_key(Setting::all(), $values);
        Setting::setMany($values);
        [$o, $n] = Audit::diff($old, $values);
        Audit::log('security.duplicate', 'settings', null, $o ?: null, $n ?: null);
        return $this->done('Duplicate-order protection saved.');
    }

    public function block(Request $r): Response
    {
        $ip = $r->str('ip', 45);
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            return $this->fail('Enter a valid IPv4 or IPv6 address.');
        }
        if ($ip === $r->ip()) {
            return $this->fail('You cannot block your own current IP.');
        }
        $type = $r->str('type', 10) === 'permanent' ? 'permanent' : 'temporary';
        FraudGuard::block($ip, $r->str('reason', 250) ?: 'Manual block', $type, max(1, $r->int('hours', 24)));
        Audit::log('security.block_ip', null, null, null, ['ip' => $ip, 'type' => $type]);
        return $this->done("IP $ip blocked ($type).");
    }

    public function unblock(Request $r, string $id): Response
    {
        $row = DB::one('SELECT ip FROM blocked_ips WHERE id = ?', [(int)$id]);
        if (!$row) {
            return $this->fail('Not found.', 404);
        }
        DB::exec('DELETE FROM blocked_ips WHERE id = ?', [(int)$id]);
        DB::exec('DELETE FROM order_attempts WHERE ip = ?', [$row['ip']]);
        Audit::log('security.unblock_ip', null, null, null, ['ip' => $row['ip']]);
        return $this->done('IP ' . $row['ip'] . ' unblocked.');
    }

    public function resolveAlert(Request $r, string $id): Response
    {
        DB::exec('UPDATE security_alerts SET is_resolved = 1 WHERE id = ?', [(int)$id]);
        return $this->done('Alert resolved.');
    }

    public function revokeSession(Request $r, string $id): Response
    {
        DB::exec('UPDATE admin_sessions SET revoked_at = NOW() WHERE id = ?', [(int)$id]);
        Audit::log('security.revoke_session', 'admin_session', (int)$id);
        return $this->done('Session signed out.');
    }

    public function saveAdmin(Request $r): Response
    {
        $id = $r->int('id');
        $email = strtolower($r->str('email', 191));
        $role = in_array($r->str('role', 10), ['owner', 'manager', 'staff'], true) ? $r->str('role', 10) : 'staff';
        $status = $r->str('status', 10) === 'disabled' ? 'disabled' : 'active';
        $password = (string)$r->input('password', '');
        if ($id === AdminAuth::id() && ($status === 'disabled' || $role !== 'owner')) {
            return $this->fail('You cannot demote or disable your own account.');
        }
        if ($id) {
            DB::exec('UPDATE admins SET role = ?, status = ?, allow_google = ? WHERE id = ?', [$role, $status, $r->bool('allow_google') ? 1 : 0, $id]);
            if ($status === 'disabled') {
                DB::exec('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL', [$id]);
            }
            Audit::log('admin.update', 'admin', $id, null, ['role' => $role, 'status' => $status]);
            return $this->done('Admin updated.');
        }
        $this->validate(['name' => $r->str('name', 120), 'email' => $email], ['name' => 'required', 'email' => 'required|email'], ['name' => 'Name', 'email' => 'Email']);
        if (!AdminAuthController::strongPassword($password)) {
            return $this->fail('Password must be 10+ characters with upper & lower case letters, a number and a symbol.');
        }
        if (DB::value('SELECT 1 FROM admins WHERE email = ?', [$email])) {
            return $this->fail('An admin with this email already exists.');
        }
        $newId = DB::insert('admins', ['name' => $r->str('name', 120), 'email' => $email, 'password_hash' => password_hash($password, PASSWORD_DEFAULT), 'role' => $role, 'allow_google' => $r->bool('allow_google') ? 1 : 0]);
        Audit::log('admin.create', 'admin', $newId, null, ['email' => $email, 'role' => $role]);
        return $this->done('Admin account created.');
    }

    public function account(Request $r): Response
    {
        $admin = DB::one('SELECT id, name, email, role, two_factor_enabled, allow_google, last_login_at, last_login_ip FROM admins WHERE id = ?', [AdminAuth::id()]);
        $pending = Session::get('2fa_setup_secret');
        return $this->page('account', [
            'admin' => $admin,
            'setupSecret' => $pending,
            'setupUri' => $pending ? Totp::uri($pending, $admin['email']) : null,
        ], ['title' => 'Account', 'nav' => '', 'page' => 'account']);
    }

    public function password(Request $r): Response
    {
        $admin = DB::one('SELECT * FROM admins WHERE id = ?', [AdminAuth::id()]);
        if (!password_verify((string)$r->input('current_password', ''), $admin['password_hash'])) {
            return $this->fail('Current password is incorrect.');
        }
        $new = (string)$r->input('new_password', '');
        if (!AdminAuthController::strongPassword($new)) {
            return $this->fail('Password must be 10+ characters with upper & lower case letters, a number and a symbol.');
        }
        DB::exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $admin['id']]);
        // Sign out every other session of this admin.
        DB::exec('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = ? AND session_hash <> ? AND revoked_at IS NULL', [$admin['id'], hash('sha256', Session::id())]);
        Audit::log('admin.password_change', 'admin', (int)$admin['id']);
        return $this->done('Password changed. Other sessions were signed out.');
    }

    public function twoFactorSetup(Request $r): Response
    {
        Session::set('2fa_setup_secret', Totp::generateSecret());
        return $this->done('Scan the key in your authenticator app, then confirm with a code.');
    }

    public function twoFactorEnable(Request $r): Response
    {
        $secret = (string)Session::get('2fa_setup_secret', '');
        if ($secret === '' || !Totp::verify($secret, $r->str('code', 10))) {
            return $this->fail('Invalid code. Check your phone time and try again.');
        }
        DB::exec('UPDATE admins SET two_factor_secret = ?, two_factor_enabled = 1 WHERE id = ?', [Crypto::encrypt($secret), AdminAuth::id()]);
        Session::forget('2fa_setup_secret');
        Audit::log('admin.2fa_enable', 'admin', AdminAuth::id());
        return $this->done('Two-factor authentication enabled.');
    }

    public function twoFactorDisable(Request $r): Response
    {
        $admin = DB::one('SELECT * FROM admins WHERE id = ?', [AdminAuth::id()]);
        if (!password_verify((string)$r->input('password', ''), $admin['password_hash'])) {
            return $this->fail('Password is incorrect.');
        }
        DB::exec('UPDATE admins SET two_factor_secret = NULL, two_factor_enabled = 0 WHERE id = ?', [$admin['id']]);
        Audit::log('admin.2fa_disable', 'admin', (int)$admin['id']);
        return $this->done('Two-factor authentication disabled.');
    }
}
