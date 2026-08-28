import { UserRole } from '@prisma/client';

export interface PermissionCheckableUser {
  role?: {
    systemKey?: UserRole | null;
    permissions?: string[];
  } | null;
}

/**
 * Même logique que `PermissionsGuard` : ADMIN bypass tout, sinon appartenance au tableau
 * `role.permissions`. À réutiliser pour tout contrôle de permission fait en dehors d'un guard
 * (ex. rédaction de champs dans un service), afin de ne jamais diverger du comportement du guard.
 */
export function hasPermission(user: PermissionCheckableUser, code: string): boolean {
  if (user.role?.systemKey === UserRole.ADMIN) return true;
  return (user.role?.permissions ?? []).includes(code);
}
