import type { Role } from '../api/types';

/** One permission per screen or capability. Routes and nav items reference these. */
export type Permission =
  | 'dashboard'
  | 'predict'
  | 'history'
  | 'weather'
  | 'soil'
  | 'recommendations'
  | 'risk'
  | 'farms'
  | 'analytics'
  | 'notifications'
  | 'settings'
  | 'help'
  | 'eda'
  | 'dataset'
  | 'models'
  | 'users';

const FARMER: readonly Permission[] = [
  'dashboard',
  'predict',
  'history',
  'weather',
  'soil',
  'recommendations',
  'risk',
  'farms',
  'analytics',
  'notifications',
  'settings',
  'help',
];

const AGRONOMIST: readonly Permission[] = [...FARMER, 'eda', 'dataset', 'models'];

const ADMIN: readonly Permission[] = [...AGRONOMIST, 'users'];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  Farmer: new Set(FARMER),
  Agronomist: new Set(AGRONOMIST),
  Admin: new Set(ADMIN),
};

/** Maps the server's role string to a known role. Unknown roles get the least privilege. */
export function normalizeRole(role: string | null | undefined): Role {
  switch ((role ?? '').trim().toLowerCase()) {
    case 'admin':
      return 'Admin';
    case 'agronomist':
      return 'Agronomist';
    default:
      return 'Farmer';
  }
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].has(permission);
}
