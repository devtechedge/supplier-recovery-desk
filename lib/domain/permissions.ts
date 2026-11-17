export const ORG_ROLES = ['owner', 'admin', 'analyst', 'contributor', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type Permission =
  | 'org:manage'
  | 'members:manage'
  | 'billing:manage'
  | 'settings:manage'
  | 'suppliers:write'
  | 'imports:commit'
  | 'cases:create'
  | 'cases:edit'
  | 'cases:transition'
  | 'cases:submit'
  | 'evidence:upload'
  | 'evidence:read'
  | 'settlements:record'
  | 'reports:export'
  | 'ai:assist';

const ROLE_PERMISSIONS: Record<OrgRole, Set<Permission>> = {
  owner: new Set<Permission>([
    'org:manage',
    'members:manage',
    'billing:manage',
    'settings:manage',
    'suppliers:write',
    'imports:commit',
    'cases:create',
    'cases:edit',
    'cases:transition',
    'cases:submit',
    'evidence:upload',
    'evidence:read',
    'settlements:record',
    'reports:export',
    'ai:assist',
  ]),
  admin: new Set<Permission>([
    'members:manage',
    'billing:manage',
    'settings:manage',
    'suppliers:write',
    'imports:commit',
    'cases:create',
    'cases:edit',
    'cases:transition',
    'cases:submit',
    'evidence:upload',
    'evidence:read',
    'settlements:record',
    'reports:export',
    'ai:assist',
  ]),
  analyst: new Set<Permission>([
    'suppliers:write',
    'imports:commit',
    'cases:create',
    'cases:edit',
    'cases:transition',
    'cases:submit',
    'evidence:upload',
    'evidence:read',
    'settlements:record',
    'reports:export',
    'ai:assist',
  ]),
  contributor: new Set<Permission>([
    'imports:commit',
    'cases:create',
    'cases:edit',
    'evidence:upload',
    'evidence:read',
    'reports:export',
    'ai:assist',
  ]),
  viewer: new Set<Permission>(['evidence:read', 'reports:export']),
};

export function hasPermission(role: OrgRole | string, permission: Permission): boolean {
  if (!(role in ROLE_PERMISSIONS)) {
    return false;
  }
  return ROLE_PERMISSIONS[role as OrgRole].has(permission);
}

export function getRolePermissions(role: OrgRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
