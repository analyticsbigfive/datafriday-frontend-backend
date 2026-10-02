import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { SpaceScopedUser, ElementRef } from '../logistics.types';

/**
 * Portée des éléments logistiques d'un espace (PdV, stockages) et de leur configuration.
 */
@Injectable()
export class LogisticsElementScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  // ─── Scoping / résolution d'éléments ─────────────────────────────────────────

  /** Fragment where : SpaceElement appartenant au tenant (v1 floor/forecourt/externalMerch + v2 zone). */
  private tenantElementWhere(tenantId: string) {
    return {
      OR: [
        { floor: { config: { space: { tenantId } } } },
        { forecourt: { config: { space: { tenantId } } } },
        { externalMerch: { config: { space: { tenantId } } } },
        { zone: { space: { tenantId } } },
      ],
    } as any;
  }

  async getElementOrThrow(elementId: string, tenantId: string, user?: SpaceScopedUser): Promise<ElementRef> {
    const el = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, ...this.tenantElementWhere(tenantId) },
      select: {
        id: true,
        name: true,
        floor: { select: { config: { select: { spaceId: true } } } },
        forecourt: { select: { config: { select: { spaceId: true } } } },
        externalMerch: { select: { config: { select: { spaceId: true } } } },
        zone: { select: { spaceId: true } },
      },
    } as any);
    if (!el) throw new NotFoundException(`Element ${elementId} not found`);
    const anyEl = el as any;
    const spaceId: string | null =
      anyEl.floor?.config?.spaceId ??
      anyEl.forecourt?.config?.spaceId ??
      anyEl.externalMerch?.config?.spaceId ??
      anyEl.zone?.spaceId ??
      null;
    if (!spaceId) throw new NotFoundException(`Element ${elementId} has no space`);
    await this.spaceAccess.assertCanAccessSpace(user, spaceId);
    return { id: anyEl.id, name: anyEl.name, spaceId };
  }

  /** Tous les éléments (PDV + storages) d'un espace du tenant. */
  async getSpaceElementIds(spaceId: string, tenantId: string): Promise<string[]> {
    const rows = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { config: { space: { id: spaceId, tenantId } } } },
          { forecourt: { config: { space: { id: spaceId, tenantId } } } },
          { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
          { zone: { space: { id: spaceId, tenantId } } },
        ],
      } as any,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Config effective d'un élément (miroir SpaceMenuScopeService.resolveShopConfigId). */
  resolveElementConfigId(
    el: { floor?: any; forecourt?: any; externalMerch?: any; configurationElements?: any[] },
    explicitConfigId?: string | null,
  ): string | null {
    if (explicitConfigId) return explicitConfigId;
    const v1Config = el.floor?.config ?? el.forecourt?.config ?? el.externalMerch?.config;
    return v1Config?.id ?? el.configurationElements?.[0]?.configId ?? null;
  }

  /**
   * Éléments (PDV + Storage) de l'espace avec leur référentiel d'items. Storage =
   * union des items des shops liés (`attributes.selectedShops`), miroir exact du
   * comportement front actuel (buildStorageInventory ne fait pas de filtre par
   * sous-type de storage côté Logistic — non reproduit ici, à vérifier en test réel).
   */
  /** Fragment where : SpaceElement appartenant à CET espace (v1 floor/forecourt/externalMerch + v2 zone). */
  spaceElementScopeWhere(spaceId: string, tenantId: string) {
    return {
      OR: [
        { floor: { config: { space: { id: spaceId, tenantId } } } },
        { forecourt: { config: { space: { id: spaceId, tenantId } } } },
        { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
        { zone: { space: { id: spaceId, tenantId } } },
      ],
    } as any;
  }

  /** Regroupement "même étage/zone" (mockups Restocker, 08/2026) : id du Floor v1, ou à
   *  défaut du Forecourt/ExternalMerch — null si aucun (élément v2 sans floor/forecourt). */
  floorGroupIdOf(el: { floor?: { id?: string } | null; forecourt?: { id?: string } | null; externalMerch?: { id?: string } | null }): string | null {
    return el.floor?.id ?? el.forecourt?.id ?? el.externalMerch?.id ?? null;
  }

  /**
   * Provider (Weezevent/Digifood) par PDV, dérivé de LocationShopMapping → SalesLocation
   * (même jointure que simulateSale/purgeSimulatedSales). Purement informatif — sert au
   * front à afficher un badge dans le picker « simuler une vente » ; absent (`null`) si le
   * PDV n'est pas encore mappé à une location réelle.
   */
  async getProviderByShopElementId(elementIds: string[], tenantId: string) {
    const result = new Map<string, string | null>();
    if (!elementIds.length) return result;
    const mappings = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, spaceElementId: { in: elementIds } },
      select: { spaceElementId: true, salesLocationId: true },
    });
    if (!mappings.length) return result;
    const salesLocationIds = [...new Set(mappings.map((m) => m.salesLocationId))];
    const locations = await this.prisma.salesLocation.findMany({
      where: { tenantId, OR: [{ id: { in: salesLocationIds } }, { externalId: { in: salesLocationIds } }] },
      select: { id: true, externalId: true, provider: true },
    });
    const locationByKey = new Map<string, (typeof locations)[number]>();
    for (const loc of locations) {
      locationByKey.set(loc.id, loc);
      locationByKey.set(loc.externalId, loc);
    }
    for (const m of mappings) {
      const loc = locationByKey.get(m.salesLocationId);
      if (loc) result.set(m.spaceElementId, loc.provider);
    }
    return result;
  }
}
