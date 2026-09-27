/** RBAC catalogue. `super_admin` implicitly has every permission. */
export const PERMISSIONS = {
  'dashboard.view': 'View admin dashboard',
  'users.view': 'View users',
  'users.manage': 'Suspend/activate users and reset security',
  'balances.adjust': 'Manually adjust user balances',
  'markets.view': 'View assets, networks and markets',
  'markets.manage': 'Create/edit/disable assets, networks and markets',
  'orders.view': 'View orders and trades',
  'orders.manage': 'Cancel user orders',
  'deposits.view': 'View deposits',
  'deposits.manage': 'Credit or reject deposits',
  'withdrawals.view': 'View withdrawals',
  'withdrawals.manage': 'Approve/reject/complete withdrawals',
  'fees.manage': 'Configure fees',
  'notifications.send': 'Send announcements and notifications',
  'audit.view': 'View audit and security logs',
  'settings.manage': 'Change system settings',
  'security.manage': 'Manage admin accounts, roles, IP restrictions',
  'system.view': 'View system health and versions',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: Object.keys(PERMISSIONS) as Permission[],
  admin: [
    'dashboard.view',
    'users.view',
    'users.manage',
    'markets.view',
    'markets.manage',
    'orders.view',
    'orders.manage',
    'deposits.view',
    'deposits.manage',
    'withdrawals.view',
    'withdrawals.manage',
    'fees.manage',
    'notifications.send',
    'audit.view',
    'system.view',
  ],
  support: [
    'dashboard.view',
    'users.view',
    'orders.view',
    'deposits.view',
    'withdrawals.view',
    'markets.view',
  ],
};
