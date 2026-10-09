import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CurrentUserData } from './decorators/current-user.decorator';

/** Profil minimal nécessaire pour résoudre le périmètre d'espaces. */
type SpaceUser = Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>;

/**
 * Résout le périmètre d'espaces d'un utilisateur (cf. docs/CONCEPTION_CIBLE_AUTH.md §5).
 *
 * Règle (décision 2026-06-25, raffinée) : l'accès aux espaces est **découplé du rôle**.
 * Accès complet = super-admin, OU owner de l'organisation, OU flag `allSpacesAccess`
 * (positionné par l'owner, présents+futurs). Sinon, l'accès est limité aux espaces
 * explicitement accordés via `UserSpaceAccess` — y compris pour un ADMIN/MANAGER non-owner.
 */
@Injectable()
export class SpaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** True si l'utilisateur voit TOUS les espaces (pas de restriction). */
  hasFullAccess(user: Pick<CurrentUserData, 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>): boolean {
    return !!(user?.isSuperAdmin || user?.isOwner || user?.allSpacesAccess);
  }

  /**
   * Retourne `'ALL'` (aucun filtre) ou la liste des spaceId accessibles.
   * À utiliser pour filtrer les listes d'espaces.
   */
  async getAccessibleSpaceIds(user: SpaceUser): Promise<'ALL' | string[]> {
    if (this.hasFullAccess(user)) return 'ALL';
    const rows = await this.prisma.userSpaceAccess.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    });
    return rows.map((r) => r.spaceId);
  }

  /** True si l'utilisateur peut accéder à CET espace précis. */
  async canAccessSpace(
    user: SpaceUser,
    spaceId: string,
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) return true;
    const row = await this.prisma.userSpaceAccess.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId } },
      select: { spaceId: true },
    });
    return !!row;
  }

  /**
   * L'espace existe dans ce tenant, sinon 404 (on ne révèle pas l'existence d'un espace
   * d'un autre tenant). Renvoie son id et son nom.
   */
  async assertSpaceInTenant(spaceId: string, tenantId: string): Promise<{ id: string; name: string }> {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true, name: true } });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
    return space;
  }

  /**
   * L'utilisateur peut accéder à cet espace, sinon 403. Sans utilisateur (appel système) ou
   * sans espace, aucun contrôle : le contrôle d'existence relève d'assertSpaceInTenant.
   */
  async assertCanAccessSpace(
    user: SpaceUser | undefined,
    spaceId: string | null | undefined,
    deniedMessage = "Vous n'avez pas accès à cet espace.",
  ): Promise<void> {
    if (!user || !spaceId) return;
    if (!(await this.canAccessSpace(user, spaceId))) throw new ForbiddenException(deniedMessage);
  }

  /** Existence dans le tenant (404) puis accès de l'utilisateur (403). */
  async assertSpaceAccessible(spaceId: string, tenantId: string, user?: SpaceUser): Promise<{ id: string; name: string }> {
    const space = await this.assertSpaceInTenant(spaceId, tenantId);
    await this.assertCanAccessSpace(user, spaceId);
    return space;
  }

  /**
   * Ressource rattachée à plusieurs espaces (article, fournisseur, prix...) : l'utilisateur doit
   * accéder à au moins l'un d'eux. Une ressource sans espace est réservée aux comptes à accès
   * complet. Sans utilisateur (appel système), aucun contrôle.
   */
  async assertCanAccessAny(
    user: SpaceUser | undefined,
    spaceIds: ReadonlyArray<string> | null | undefined,
    messages: { none: string; denied: string },
  ): Promise<void> {
    if (!user || this.hasFullAccess(user)) return;
    if (!spaceIds?.length) throw new ForbiddenException(messages.none);
    const accessible = await this.getAccessibleSpaceIds(user);
    if (accessible === 'ALL' || spaceIds.some((id) => accessible.includes(id))) return;
    throw new ForbiddenException(messages.denied);
  }
}
