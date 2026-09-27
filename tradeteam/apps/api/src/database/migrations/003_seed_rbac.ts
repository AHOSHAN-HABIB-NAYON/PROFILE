import type { Migration } from '../migrator';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../modules/admin/permissions';

const esc = (s: string) => s.replace(/'/g, "''");

export const m003: Migration = {
  version: 3,
  name: 'seed_rbac',
  up: [
    ...Object.entries(PERMISSIONS).map(
      ([code, desc]) =>
        `INSERT IGNORE INTO admin_permissions (code, description) VALUES ('${esc(code)}', '${esc(desc)}')`,
    ),
    ...Object.keys(ROLE_PERMISSIONS).map(
      (role) =>
        `INSERT IGNORE INTO admin_roles (name, description, is_system) VALUES ('${esc(role)}', '${esc(role.replace('_', ' '))}', 1)`,
    ),
    ...Object.entries(ROLE_PERMISSIONS).map(
      ([role, perms]) =>
        `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM admin_roles r JOIN admin_permissions p ON p.code IN (${perms.map((p) => `'${esc(p)}'`).join(',')})
         WHERE r.name = '${esc(role)}'`,
    ),
    `INSERT IGNORE INTO fees (scope, market_id, network_id, maker_rate, taker_rate) VALUES ('trading', NULL, NULL, 0.001, 0.001)`,
  ],
};
