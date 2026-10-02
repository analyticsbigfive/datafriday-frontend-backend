import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { createSpaceElementWithUniqueSlug } from '../../../shared/utils/generate-space-element-slug';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CreateZoneDto, UpdateZoneDto } from '../dto/builder-v2.dto';
import { builderStatePayload } from '../builder-v2.queries';
import { BuilderV2SupportService } from './builder-v2-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * État du builder et zones d'un espace : création, mise à jour, ordre, duplication, suppression.
 */
@Injectable()
export class BuilderV2ZoneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly builderV2SupportService: BuilderV2SupportService,
  ) {}

  // ─── Bootstrap (§3.1) ───────────────────────────────────────────────────────

  /**
   * État complet en 1 SEUL round-trip SQL (CTE + json_agg — même patron éprouvé que
   * getSpaceShops). La version précédente enchaînait 4 allers-retours séquentiels ;
   * à ~200ms-1s de latence pooler par requête (mesuré), elle explosait le budget < 1s.
   */
  async getBuilderState(spaceId: string, tenantId: string) {
    const rows = await builderStatePayload(this.prisma, tenantId, spaceId);

    const payload = rows[0]?.payload;
    if (!payload?.space) throw new NotFoundException(`Space ${spaceId} not found`);

    // Reshape : le front attend memberships[] et usage[] au niveau racine (contrat §3.1).
    const memberships: Array<{ elementId: string; configIds: string[] }> = [];
    const usage: Array<{
      elementId: string; weezeventMapped: boolean;
      weezeventLocationName: string | null; menuItemsCount: number;
      menuCountsByConfig: Record<string, number>;
    }> = [];
    const zones = (payload.zones || []).map((zone: any) => ({
      ...zone,
      elements: (zone.elements || []).map((el: any) => {
        const {
          configIds, weezeventMapped, weezeventLocationName, menuItemsCount,
          menuCountsByConfig, ...element
        } = el;
        memberships.push({ elementId: el.id, configIds: configIds || [] });
        usage.push({
          elementId: el.id,
          weezeventMapped: !!weezeventMapped,
          weezeventLocationName: weezeventLocationName ?? null,
          menuItemsCount: menuItemsCount || 0,
          menuCountsByConfig: menuCountsByConfig || {},
        });
        return element;
      }),
    }));

    return {
      space: {
        id: payload.space.id,
        name: payload.space.name,
        maxCapacity: payload.space.maxCapacity,
      },
      zones,
      configurations: payload.configurations || [],
      memberships,
      usage,
    };
  }

  // ─── Zones ──────────────────────────────────────────────────────────────────

  async createZone(spaceId: string, tenantId: string, dto: CreateZoneDto) {
    await this.builderV2SupportService.getSpaceOrThrow(spaceId, tenantId);
    const level = dto.kind === 'FLOOR' ? dto.level ?? 0 : 0;

    const existing = await this.prisma.zone.findFirst({
      where: { spaceId, kind: dto.kind as any, level },
    });
    if (existing) {
      throw new ConflictException(
        dto.kind === 'FLOOR'
          ? `Un étage existe déjà au niveau ${level}`
          : 'Cette zone existe déjà pour cet espace',
      );
    }

    const zone = await this.prisma.zone.create({
      data: {
        spaceId,
        kind: dto.kind as any,
        name: dto.name,
        level,
        width: dto.width,
        length: dto.length,
        height: dto.height ?? (dto.kind === 'FLOOR' ? 4 : 0),
        geometry: dto.geometry ?? undefined,
        sortIndex: dto.sortIndex ?? 0,
      },
    });
    await this.builderV2SupportService.invalidate(tenantId, spaceId);
    return zone;
  }

  async updateZone(zoneId: string, tenantId: string, dto: UpdateZoneDto, user?: SpaceScopedUser) {
    const zone = await this.builderV2SupportService.getZoneOrThrow(zoneId, tenantId, user);
    const updated = await this.prisma.zone.update({
      where: { id: zoneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.length !== undefined && { length: dto.length }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.geometry !== undefined && { geometry: dto.geometry }),
        ...(dto.sortIndex !== undefined && { sortIndex: dto.sortIndex }),
      },
    });
    await this.builderV2SupportService.invalidate(tenantId, zone.spaceId);
    return updated;
  }

  async reorderZones(spaceId: string, tenantId: string, orderedIds: string[]) {
    await this.builderV2SupportService.getSpaceOrThrow(spaceId, tenantId);
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.zone.updateMany({ where: { id, spaceId }, data: { sortIndex: index } }),
      ),
    );
    await this.builderV2SupportService.invalidate(tenantId, spaceId);
    return { ok: true };
  }

  /**
   * Duplication d'une zone FLOOR (parité v1 « Duplicate floor ») : clone la zone au
   * prochain niveau libre + tous ses éléments (avec leurs adhésions) en une transaction.
   * Les mappings Weezevent ne sont JAMAIS copiés.
   */
  async duplicateZone(zoneId: string, tenantId: string, user?: SpaceScopedUser) {
    const source = await this.prisma.zone.findFirst({
      where: { id: zoneId, space: { tenantId } },
      include: { elements: { include: { configurationElements: true } } },
    });
    if (!source) throw new NotFoundException(`Zone ${zoneId} not found`);
    await this.spaceAccess.assertCanAccessSpace(user, source.spaceId);
    if (source.kind !== 'FLOOR') {
      throw new ConflictException('Seuls les étages peuvent être dupliqués (parvis/externe sont uniques)');
    }

    const floors = await this.prisma.zone.findMany({
      where: { spaceId: source.spaceId, kind: 'FLOOR' },
      select: { level: true },
    });
    const nextLevel = Math.max(...floors.map((f) => f.level)) + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      const zone = await tx.zone.create({
        data: {
          spaceId: source.spaceId,
          kind: 'FLOOR',
          name: `${source.name} (Copy)`,
          level: nextLevel,
          width: source.width,
          length: source.length,
          height: source.height,
          geometry: source.geometry ?? undefined,
          sortIndex: source.sortIndex,
        },
      });

      const memberships: Array<{ elementId: string; configIds: string[] }> = [];
      const elements = [];
      for (const el of source.elements) {
        const copy = await createSpaceElementWithUniqueSlug(tx, el.name, (slug) => ({
          zoneId: zone.id,
          slug,
          name: el.name,
          type: el.type,
          subtypes: el.subtypes,
          x: el.x,
          y: el.y,
          width: el.width ?? 2,
          depth: el.depth ?? 2,
          height3d: el.height3d ?? 2,
          rotation: el.rotation ?? 0,
          capacity: el.capacity,
          image: el.image,
          notes: el.notes,
          area: el.area,
          attributes: el.attributes ?? undefined,
          cornerRadiusTL: el.cornerRadiusTL ?? 0,
          cornerRadiusTR: el.cornerRadiusTR ?? 0,
          cornerRadiusBL: el.cornerRadiusBL ?? 0,
          cornerRadiusBR: el.cornerRadiusBR ?? 0,
        }));
        const configIds = el.configurationElements.map((m) => m.configId);
        if (configIds.length > 0) {
          await tx.configurationElement.createMany({
            data: configIds.map((configId) => ({ configId, elementId: copy.id })),
            skipDuplicates: true,
          });
        }
        memberships.push({ elementId: copy.id, configIds });
        elements.push(copy);
      }

      return { zone, elements, memberships };
    }, { timeout: 20_000 });

    const affectedConfigIds = result.memberships.flatMap((m) => m.configIds);
    await this.builderV2SupportService.recomputeConfigCapacities(tenantId, affectedConfigIds);
    this.builderV2SupportService.invalidate(tenantId, source.spaceId);

    return {
      zone: {
        id: result.zone.id,
        kind: result.zone.kind,
        name: result.zone.name,
        level: result.zone.level,
        width: result.zone.width,
        length: result.zone.length,
        height: result.zone.height,
        geometry: result.zone.geometry,
        sortIndex: result.zone.sortIndex,
        elements: result.elements.map((el) => this.builderV2SupportService.serializeElement(el)),
      },
      memberships: result.memberships,
    };
  }

  async deleteZone(zoneId: string, tenantId: string, force = false, user?: SpaceScopedUser) {
    const zone = await this.builderV2SupportService.getZoneOrThrow(zoneId, tenantId, user);

    const elements = await this.prisma.spaceElement.findMany({
      where: { zoneId },
      select: { id: true },
    });
    const elementIds = elements.map((e) => e.id);

    // Jamais de perte silencieuse : une zone retenant des éléments UTILISÉS → 409
    // détaillé (quel élément, quel shop). force=true après confirmation : la cascade
    // FK délie proprement mappings Weezevent et menus avec les éléments.
    if (elementIds.length > 0 && !force) {
      const described = await this.builderV2SupportService.describeElements(elementIds, tenantId);
      const blockers = described.filter((d) => d.weezeventMapped || d.menuItemsCount > 0);
      if (blockers.length > 0) {
        throw new ConflictException({
          message: `Zone non supprimée : ${blockers.length} élément(s) utilisé(s) — confirmation requise (force=true)`,
          reasons: blockers.map((b) => {
            const uses = [
              ...(b.weezeventMapped
                ? [`shop Weezevent${b.weezeventLocationName ? ` « ${b.weezeventLocationName} »` : ''}`]
                : []),
              ...(b.menuItemsCount > 0 ? [`${b.menuItemsCount} menu item(s)`] : []),
            ];
            return `« ${b.name} » — ${uses.join(', ')}`;
          }),
          blockers,
        });
      }
    }

    const memberConfigIds = elementIds.length
      ? (
          await this.prisma.configurationElement.findMany({
            where: { elementId: { in: elementIds } },
            select: { configId: true },
          })
        ).map((m) => m.configId)
      : [];

    await this.prisma.zone.delete({ where: { id: zoneId } }); // cascade éléments + adhésions
    await this.builderV2SupportService.recomputeConfigCapacities(tenantId, memberConfigIds);
    await this.builderV2SupportService.invalidate(tenantId, zone.spaceId);
    return { ok: true };
  }
}
