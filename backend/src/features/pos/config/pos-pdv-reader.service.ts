import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SHOP_TYPES } from '../../logistics/logistics.types';

export interface PosConfigPdv {
  elementId: string;
  name: string;
  type: string | null;
  slug: string;
  zoneLabel: string | null;
  itemsCount: number;
  otherSources: Array<'WEEZEVENT' | 'DIGIFOOD'>;
}

/** PdV d'une configuration : élément de type point de vente relié à la configuration (v2 ou v1). */
export const pdvOfConfigWhere = (configurationId: string) => ({
  type: { in: SHOP_TYPES },
  OR: [
    { configurationElements: { some: { configId: configurationId } } },
    { floor: { configId: configurationId } },
    { forecourt: { configId: configurationId } },
    { externalMerch: { configId: configurationId } },
  ],
});

/**
 * Lecture des PdV d'une configuration d'évènement avec leurs articles et leurs autres sources de ventes
 * mappées. Requêtes groupées (une par information), jamais une requête par PdV.
 */
@Injectable()
export class PosPdvReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async listForConfig(tenantId: string, configurationId: string): Promise<PosConfigPdv[]> {
    const elements = await this.prisma.spaceElement.findMany({
      where: pdvOfConfigWhere(configurationId),
      select: { id: true, name: true, type: true, slug: true, zone: { select: { name: true } }, floor: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    if (!elements.length) return [];
    const ids = elements.map((e) => e.id);
    const [itemCounts, otherSources] = await Promise.all([
      this.prisma.menuAssignment.groupBy({
        by: ['elementId'],
        where: { elementId: { in: ids }, configId: configurationId, enabled: true, menuItem: { deletedAt: null } },
        _count: { _all: true },
      }),
      this.otherSourcesByElement(tenantId, ids),
    ]);
    const countByElement = new Map(itemCounts.map((c) => [c.elementId, c._count._all]));
    return elements.map((e) => ({
      elementId: e.id,
      name: e.name,
      type: e.type ?? null,
      slug: e.slug,
      zoneLabel: e.zone?.name ?? e.floor?.name ?? null,
      itemsCount: countByElement.get(e.id) ?? 0,
      otherSources: otherSources.get(e.id) ?? [],
    }));
  }

  /** Le PdV fait-il partie de la configuration ? (contrôle des réglages par PdV) */
  async isInConfig(configurationId: string, elementId: string): Promise<boolean> {
    const row = await this.prisma.spaceElement.findFirst({
      where: { id: elementId, ...pdvOfConfigWhere(configurationId) },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Sources Weezevent et Digifood déjà mappées sur les PdV (rappel « les sources s'additionnent »).
   * Le mapping porte l'id (ou l'id externe, mappings historiques) d'un lieu de ventes ; son
   * fournisseur vient de SalesLocation. Le POS lui-même n'est pas listé.
   */
  private async otherSourcesByElement(tenantId: string, elementIds: string[]): Promise<Map<string, Array<'WEEZEVENT' | 'DIGIFOOD'>>> {
    const mappings = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, spaceElementId: { in: elementIds } },
      select: { salesLocationId: true, spaceElementId: true },
    });
    const out = new Map<string, Array<'WEEZEVENT' | 'DIGIFOOD'>>();
    if (!mappings.length) return out;
    const locationIds = [...new Set(mappings.map((m) => m.salesLocationId))];
    const locations = await this.prisma.salesLocation.findMany({
      where: { tenantId, OR: [{ id: { in: locationIds } }, { externalId: { in: locationIds } }] },
      select: { id: true, externalId: true, provider: true },
    });
    const providerByKey = new Map<string, string>();
    for (const l of locations) {
      providerByKey.set(l.id, l.provider);
      if (!providerByKey.has(l.externalId)) providerByKey.set(l.externalId, l.provider);
    }
    for (const m of mappings) {
      const provider = providerByKey.get(m.salesLocationId);
      if (provider !== 'WEEZEVENT' && provider !== 'DIGIFOOD') continue;
      const list = out.get(m.spaceElementId) ?? [];
      if (!list.includes(provider)) list.push(provider);
      out.set(m.spaceElementId, list);
    }
    return out;
  }
}
