import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * RH staffing — fournisseurs (agences), rôles métier (« positions ») et
 * personnes internes. Migre les données localStorage du frontend
 * (utils/hrApi.js : hr_suppliers / staff_positions) via l'import one-shot.
 * ⚠️ Sans rapport avec features/roles/ (permissions utilisateurs).
 * tenantId auto-scopé par PrismaService ; on filtre quand même explicitement
 * (défense en profondeur, cf. hr-settings.service.ts).
 */



const ASSERT_SPACE_WRITE_ACCESS_MESSAGES = {
  none: "Cette ressource ne dessert aucun espace — réservée aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace de cette ressource.",
};

/**
 * Ratios postes RH par article du menu.
 */
@Injectable()
export class HrRoleMenuItemRatioService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
  ) {}

  // ── Role ↔ Menu Item ratios (11_RH_STAFFING.md §11.16) ──────────────────────

  private mapRoleMenuItemRatio(r: any) {
    return {
      id: r.id,
      spaceId: r.spaceId,
      roleId: r.roleId,
      ratioBasis: r.ratioBasis,
      ratioValue: r.ratioValue,
      unitQty: r.unitQty,
      allMenuItems: r.allMenuItems,
      menuItemIds: r.menuItemIds,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async findAllRoleMenuItemRatios(tenantId: string, filter: { spaceId?: string } = {}, user?: SpaceScopedUser) {
    const where: any = { tenantId };
    if (filter.spaceId) {
      where.spaceId = filter.spaceId;
    } else if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') where.spaceId = { in: accessible };
    }
    const rows = await this.prisma.hrRoleMenuItemRatio.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map((r) => this.mapRoleMenuItemRatio(r)) };
  }

  private async assertValidRoleMenuItemRatio(input: any, tenantId: string, existing?: any) {
    const roleId = input.roleId ?? existing?.roleId;
    const spaceId = input.spaceId ?? existing?.spaceId;
    const role = await this.prisma.hrRole.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new BadRequestException(`Rôle ${roleId} introuvable`);
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new BadRequestException(`Espace ${spaceId} introuvable`);

    const ratioBasis = input.ratioBasis ?? existing?.ratioBasis;
    if (!['REVENUE', 'QUANTITY'].includes(ratioBasis)) {
      throw new BadRequestException("ratioBasis doit être 'REVENUE' ou 'QUANTITY'.");
    }
    const ratioValue = input.ratioValue !== undefined ? Number(input.ratioValue) : existing?.ratioValue;
    if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
      throw new BadRequestException('ratioValue doit être un nombre > 0.');
    }
    const unitQty = input.unitQty !== undefined ? Number(input.unitQty) : (existing?.unitQty ?? 1);
    if (!Number.isFinite(unitQty) || unitQty < 1) {
      throw new BadRequestException('unitQty doit être un entier ≥ 1.');
    }
    const allMenuItems = input.allMenuItems !== undefined ? !!input.allMenuItems : (existing?.allMenuItems ?? false);
    const menuItemIds: string[] = allMenuItems
      ? []
      : (input.menuItemIds !== undefined ? input.menuItemIds : (existing?.menuItemIds ?? []));
    if (!allMenuItems) {
      if (!menuItemIds.length) {
        throw new BadRequestException("menuItemIds est requis (non vide) quand allMenuItems est faux.");
      }
      // Les items doivent réellement être rattachés à cet espace (SpaceMenuItem) — même condition
      // 0 stricte que SpaceMenuAvailabilityService.getSpaceMenuItems, pour ne pas laisser une association
      // pointer vers un item retiré du menu de l'espace après coup.
      const linked = await this.prisma.spaceMenuItem.findMany({
        where: { spaceId, menuItemId: { in: menuItemIds } },
        select: { menuItemId: true },
      });
      const linkedIds = new Set(linked.map((l) => l.menuItemId));
      const missing = menuItemIds.filter((id) => !linkedIds.has(id));
      if (missing.length) {
        throw new BadRequestException(
          `Menu Item(s) non rattaché(s) à cet espace : ${missing.join(', ')}`,
        );
      }
    }
    return { ratioBasis, ratioValue, unitQty, allMenuItems, menuItemIds };
  }

  async createRoleMenuItemRatio(input: any, tenantId: string) {
    const n = await this.assertValidRoleMenuItemRatio(input, tenantId);
    const row = await this.prisma.hrRoleMenuItemRatio.create({
      data: {
        tenantId,
        spaceId: input.spaceId,
        roleId: input.roleId,
        ratioBasis: n.ratioBasis,
        ratioValue: n.ratioValue,
        unitQty: n.unitQty,
        allMenuItems: n.allMenuItems,
        menuItemIds: n.menuItemIds,
      },
    });
    return this.mapRoleMenuItemRatio(row);
  }

  async updateRoleMenuItemRatio(id: string, input: any, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.prisma.hrRoleMenuItemRatio.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrRoleMenuItemRatio ${id} introuvable`);
    await this.spaceAccess.assertCanAccessAny(user, [existing.spaceId], ASSERT_SPACE_WRITE_ACCESS_MESSAGES);
    const n = await this.assertValidRoleMenuItemRatio(input, tenantId, existing);
    const row = await this.prisma.hrRoleMenuItemRatio.update({
      where: { id },
      data: {
        ratioBasis: n.ratioBasis,
        ratioValue: n.ratioValue,
        unitQty: n.unitQty,
        allMenuItems: n.allMenuItems,
        menuItemIds: n.menuItemIds,
      },
    });
    return this.mapRoleMenuItemRatio(row);
  }

  async removeRoleMenuItemRatio(id: string, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.prisma.hrRoleMenuItemRatio.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrRoleMenuItemRatio ${id} introuvable`);
    await this.spaceAccess.assertCanAccessAny(user, [existing.spaceId], ASSERT_SPACE_WRITE_ACCESS_MESSAGES);
    await this.prisma.hrRoleMenuItemRatio.delete({ where: { id } });
    return { deleted: true };
  }
}
