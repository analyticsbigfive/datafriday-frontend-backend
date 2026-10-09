import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { UserAuthInfo } from '../../../core/supabase/supabase-admin.service';
import { Prisma, UserRole } from '@prisma/client';

/**
 * Outils communs aux utilisateurs : résolution du rôle et des espaces cibles, statut d'authentification, nettoyage des champs sensibles.
 */
@Injectable()
export class UserSupportService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolve the tenant's Role row matching a system key (ADMIN/MANAGER/...).
   * Returns null when the tenant has no cloned roles yet (legacy tenants);
   * callers fall back to the legacy enum on `User.role`.
   */
  private async resolveRoleId(
    tenantId: string,
    systemKey: UserRole,
  ): Promise<string | null> {
    const role = await this.prisma.role.findFirst({
      where: { tenantId, systemKey },
      select: { id: true },
    });
    return role?.id ?? null;
  }

  /**
   * Resolve a role from either a dynamic `roleId` (preferred, from the UI) or a
   * legacy system `role` enum. Returns both the effective systemKey (for the
   * legacy `User.role` column) and the `roleId` FK.
   */
  async resolveRole(
    tenantId: string,
    opts: { roleId?: string; role?: UserRole },
  ): Promise<{ systemKey: UserRole; roleId: string | null }> {
    if (opts.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: opts.roleId, tenantId },
        select: { id: true, systemKey: true },
      });
      if (!role) {
        throw new NotFoundException(`Role ${opts.roleId} not found`);
      }
      return { systemKey: role.systemKey ?? UserRole.VIEWER, roleId: role.id };
    }

    const systemKey = opts.role ?? UserRole.VIEWER;
    const roleId = await this.resolveRoleId(tenantId, systemKey);
    return { systemKey, roleId };
  }

  /**
   * Résout les espaces à accorder à un nouvel utilisateur :
   * `allSpaces` → tous les espaces du tenant ; sinon `spaceIds` validés
   * (les IDs hors de l'organisation sont silencieusement ignorés).
   */
  async resolveTargetSpaceIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: { allSpaces?: boolean; spaceIds?: string[] },
  ): Promise<string[]> {
    if (dto.allSpaces) {
      const spaces = await tx.space.findMany({ where: { tenantId }, select: { id: true } });
      return spaces.map((s) => s.id);
    }
    if (dto.spaceIds?.length) {
      const valid = await tx.space.findMany({
        where: { tenantId, id: { in: dto.spaceIds } },
        select: { id: true },
      });
      return valid.map((s) => s.id);
    }
    return [];
  }

  /**
   * Attach the connection lifecycle (`status` + timestamps) read from Supabase.
   * - `active`  : the user has logged in at least once;
   * - `pending` : invited / created but never signed in;
   * - `unknown` : Supabase info unavailable (admin client off, or no auth row).
   */
  withAuthStatus(user: any, info?: UserAuthInfo) {
    if (!info) {
      return { ...user, status: 'unknown', lastSignInAt: null, invitedAt: null, emailConfirmedAt: null };
    }
    return {
      ...user,
      status: info.lastSignInAt ? 'active' : 'pending',
      lastSignInAt: info.lastSignInAt,
      invitedAt: info.invitedAt,
      emailConfirmedAt: info.emailConfirmedAt,
    };
  }

  /**
   * Sanitize user object (remove sensitive data)
   */
  sanitizeUser(user: any) {
    // Remove any sensitive fields if present
    const { roleRef, userTenants, ...sanitized } = user;

    // isOwner DE CE TENANT, quand `userTenants` a été demandé (findAll) — le front s'en sert
    // pour désactiver la suppression/rétrogradation du owner (cf. UserListView.vue).
    if (Array.isArray(userTenants)) {
      sanitized.isOwner = userTenants[0]?.isOwner ?? false;
    }

    // Quand la relation `roleRef` a été DEMANDÉE (findAll/findOne incluent `roleRef`,
    // même si la valeur est null car `roleId` est null), on expose le rôle sous la
    // forme attendue par le front : `role: { id, name, systemKey }` + `roleName`.
    // Fallback sur l'enum legacy `role` quand il n'y a pas de rôle dynamique
    // (roleId null) — IDENTIQUE à la résolution de /me (jwt-db-lookup.strategy) :
    // `roleRef?.name ?? user.role`. Évite la colonne "Role" vide (ex. ADMIN owner
    // ou users invités sans roleId assigné).
    // Les autres appelants (login, create) n'incluent PAS `roleRef` →
    // la clé est absente → on ne touche à rien (champ legacy `role` enum inchangé).
    if ('roleRef' in user) {
      const name = roleRef?.name ?? sanitized.role ?? null;
      return {
        ...sanitized,
        role: { id: roleRef?.id ?? null, name, systemKey: roleRef?.systemKey ?? sanitized.role ?? null },
        roleName: name,
      };
    }

    return sanitized;
  }
}
