<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\Validator;

final class UserAdminService
{
    public function __construct(
        private Database $db,
        private AuditService $audit,
        private AuthService $auth,
        private NotificationService $notify
    ) {
    }

    public function list(array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if (!empty($f['q'])) {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $f['q']) . '%';
            $where[] = '(u.email LIKE :q1 OR u.full_name LIKE :q2 OR u.phone LIKE :q3)';
            $p += ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }
        if (!empty($f['status']) && in_array($f['status'], ['active', 'suspended', 'closed'], true)) {
            $where[] = 'u.status = :s';
            $p['s'] = $f['status'];
        }
        if (($f['verified'] ?? '') === 'email') {
            $where[] = 'u.email_verified_at IS NOT NULL';
        } elseif (($f['verified'] ?? '') === 'unverified') {
            $where[] = 'u.email_verified_at IS NULL';
        }
        if (!empty($f['identity']) && in_array($f['identity'], ['not_submitted', 'pending', 'approved', 'rejected'], true)) {
            $where[] = 'u.identity_status = :i';
            $p['i'] = $f['identity'];
        }
        if (($f['role'] ?? '') === 'admin') {
            $where[] = 'u.is_admin = 1';
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM users u WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT u.id, u.full_name, u.email, u.phone, u.status, u.email_verified_at, u.identity_status, u.is_admin, u.is_demo, u.last_login_at, u.created_at,
                    (SELECT GROUP_CONCAT(r.slug) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
             FROM users u WHERE $w ORDER BY u.id DESC LIMIT :l OFFSET :o",
            $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        return [$rows, $total];
    }

    public function detail(int $id): array
    {
        $u = $this->db->one(
            'SELECT u.id, u.uuid, u.full_name, u.email, u.phone, u.status, u.suspended_reason, u.email_verified_at, u.identity_status, u.is_admin, u.is_demo,
                    u.locale, u.last_login_at, u.created_at, u.google_sub IS NOT NULL has_google, p.address_line, p.city, p.country, p.postal_code
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = :id',
            ['id' => $id]
        );
        if (!$u) {
            throw HttpException::notFound('User not found.');
        }
        $u['roles'] = $this->db->all('SELECT r.id, r.slug, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :u', ['u' => $id]);
        $u['logins'] = $this->auth->loginHistory($id, 15);
        $u['sessions'] = count($this->auth->sessions($id));
        return $u;
    }

    public function update(int $id, array $in, int $actorId): array
    {
        $data = Validator::make($in, [
            'full_name' => 'required|string|min:2|max:120',
            'phone' => 'nullable|phone',
            'locale' => 'nullable|in:en,bn',
            'address_line' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'country' => 'nullable|string|max:100',
        ])->validated();
        $before = $this->detail($id);
        $this->db->update('users', ['full_name' => strip_tags($data['full_name']), 'phone' => $data['phone'], 'locale' => $data['locale'] ?? $before['locale'], 'updated_at' => Database::now()], 'id = :id', ['id' => $id]);
        $this->db->run(
            'INSERT INTO user_profiles (user_id, address_line, city, country, updated_at) VALUES (:u, :a, :c, :co, :n)
             ON DUPLICATE KEY UPDATE address_line = VALUES(address_line), city = VALUES(city), country = VALUES(country), updated_at = VALUES(updated_at)',
            ['u' => $id, 'a' => $data['address_line'], 'c' => $data['city'], 'co' => $data['country'], 'n' => Database::now()]
        );
        $this->audit->log($actorId, 'user.updated', 'user', $id, ['before' => array_intersect_key($before, $data), 'after' => $data]);
        return $this->detail($id);
    }

    public function setStatus(int $id, string $status, ?string $reason, int $actorId): void
    {
        if (!in_array($status, ['active', 'suspended'], true)) {
            throw HttpException::validation(['status' => 'Select a valid status.']);
        }
        if ($id === $actorId) {
            throw HttpException::forbidden('You cannot change the status of your own account.');
        }
        $this->guardLastSuperAdmin($id, $status === 'suspended');
        $this->db->update('users', ['status' => $status, 'suspended_reason' => $status === 'suspended' ? mb_substr(strip_tags((string) $reason), 0, 255) : null, 'updated_at' => Database::now()], 'id = :id', ['id' => $id]);
        if ($status === 'suspended') {
            $this->db->run('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = :u AND revoked_at IS NULL', ['u' => $id]);
        }
        $this->audit->log($actorId, 'user.' . ($status === 'suspended' ? 'suspended' : 'reactivated'), 'user', $id, ['reason' => $reason]);
        $this->notify->securityEvent($id, $status === 'suspended' ? 'account_suspended' : 'account_reactivated', []);
    }

    public function setRoles(int $id, array $roleIds, int $actorId): void
    {
        $roleIds = array_values(array_unique(array_map('intval', $roleIds)));
        if ($id === $actorId) {
            throw HttpException::forbidden('You cannot change your own roles. Ask another super administrator.');
        }
        $superId = (int) $this->db->value('SELECT id FROM roles WHERE slug = "super_admin"');
        if (!in_array($superId, $roleIds, true)) {
            $this->guardLastSuperAdmin($id, true);
        }
        $valid = array_map('intval', array_column($this->db->all('SELECT id FROM roles'), 'id'));
        foreach ($roleIds as $r) {
            if (!in_array($r, $valid, true)) {
                throw HttpException::validation(['roles' => 'Unknown role.']);
            }
        }
        $before = array_column($this->db->all('SELECT role_id FROM user_roles WHERE user_id = :u', ['u' => $id]), 'role_id');
        $this->db->transaction(function (Database $db) use ($id, $roleIds, $actorId) {
            $db->run('DELETE FROM user_roles WHERE user_id = :u', ['u' => $id]);
            foreach ($roleIds as $r) {
                $db->insert('user_roles', ['user_id' => $id, 'role_id' => $r, 'assigned_by' => $actorId, 'created_at' => Database::now()]);
            }
            $db->update('users', ['is_admin' => $roleIds ? 1 : 0, 'updated_at' => Database::now()], 'id = :id', ['id' => $id]);
            // role changes take effect on next sign-in: revoke sessions to prevent stale privileges
            $db->run('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = :u AND revoked_at IS NULL', ['u' => $id]);
        });
        $this->auth->flushPermissionCache();
        $this->audit->log($actorId, 'user.roles_changed', 'user', $id, ['before' => $before, 'after' => $roleIds]);
    }

    private function guardLastSuperAdmin(int $userId, bool $removing): void
    {
        if (!$removing) {
            return;
        }
        $isSuper = (int) $this->db->value('SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.slug = "super_admin" AND ur.user_id = :u', ['u' => $userId]);
        if (!$isSuper) {
            return;
        }
        $others = (int) $this->db->value('SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
                                          WHERE r.slug = "super_admin" AND ur.user_id <> :u AND u.status = "active"', ['u' => $userId]);
        if ($others === 0) {
            throw HttpException::conflict('This is the only active super administrator. Assign another one first.', 'last_super_admin');
        }
    }

    public function roles(): array
    {
        $roles = $this->db->all('SELECT * FROM roles ORDER BY id');
        foreach ($roles as &$r) {
            $r['permissions'] = array_column($this->db->all('SELECT p.slug FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = :r', ['r' => $r['id']]), 'slug');
            $r['members'] = (int) $this->db->value('SELECT COUNT(*) FROM user_roles WHERE role_id = :r', ['r' => $r['id']]);
        }
        return $roles;
    }

    public function permissions(): array
    {
        return $this->db->all('SELECT slug, group_name, description FROM permissions ORDER BY group_name, slug');
    }

    public function saveRole(?int $roleId, array $in, int $actorId): array
    {
        $data = Validator::make($in, [
            'name' => 'required|string|min:3|max:100',
            'slug' => $roleId ? 'nullable|slug' : 'required|slug',
            'description' => 'nullable|string|max:255',
            'permissions' => 'nullable|array',
        ])->validated();
        $perms = array_values(array_filter((array) ($data['permissions'] ?? []), 'is_string'));
        $validPerms = array_column($this->permissions(), 'slug');
        foreach ($perms as $p) {
            if (!in_array($p, $validPerms, true)) {
                throw HttpException::validation(['permissions' => 'Unknown permission ' . $p]);
            }
        }
        return $this->db->transaction(function (Database $db) use ($roleId, $data, $perms, $actorId) {
            if ($roleId) {
                $role = $db->one('SELECT * FROM roles WHERE id = :id', ['id' => $roleId]);
                if (!$role) {
                    throw HttpException::notFound();
                }
                if ($role['slug'] === 'super_admin') {
                    throw HttpException::forbidden('The super administrator role always has every permission.');
                }
                $db->update('roles', ['name' => strip_tags($data['name']), 'description' => $data['description']], 'id = :id', ['id' => $roleId]);
            } else {
                if ($db->value('SELECT id FROM roles WHERE slug = :s', ['s' => $data['slug']])) {
                    throw HttpException::validation(['slug' => 'This role id already exists.']);
                }
                $roleId = $db->insert('roles', ['slug' => $data['slug'], 'name' => strip_tags($data['name']), 'description' => $data['description'], 'is_system' => 0, 'created_at' => Database::now()]);
            }
            $db->run('DELETE FROM role_permissions WHERE role_id = :r', ['r' => $roleId]);
            foreach ($perms as $p) {
                $db->run('INSERT INTO role_permissions (role_id, permission_id) SELECT :r, id FROM permissions WHERE slug = :p', ['r' => $roleId, 'p' => $p]);
            }
            $this->audit->log($actorId, 'role.saved', 'role', $roleId, ['permissions' => $perms]);
            $this->auth->flushPermissionCache();
            return $db->one('SELECT * FROM roles WHERE id = :id', ['id' => $roleId]);
        });
    }

    public function deleteRole(int $roleId, int $actorId): void
    {
        $role = $this->db->one('SELECT * FROM roles WHERE id = :id', ['id' => $roleId]);
        if (!$role) {
            throw HttpException::notFound();
        }
        if ((int) $role['is_system']) {
            throw HttpException::forbidden('Built-in roles cannot be deleted.');
        }
        if ((int) $this->db->value('SELECT COUNT(*) FROM user_roles WHERE role_id = :r', ['r' => $roleId]) > 0) {
            throw HttpException::conflict('Remove this role from all users first.');
        }
        $this->db->run('DELETE FROM roles WHERE id = :id', ['id' => $roleId]);
        $this->audit->log($actorId, 'role.deleted', 'role', $roleId, ['slug' => $role['slug']]);
    }
}
