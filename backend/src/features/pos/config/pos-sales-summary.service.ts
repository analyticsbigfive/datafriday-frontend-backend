import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

export interface PosPdvSales {
  tickets: number;
  revenueTtc: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tickets et chiffre d'affaires POS par PdV pour un évènement : UNE agrégation SQL groupée par lieu
 * de vente (pas de lecture des lignes). Ventes valides seulement (status 'V', non annulées).
 *
 * Chemin : intégration(s) POS de l'espace (LocationSpaceMapping -> Integration provider POS) ->
 * SalesEvent (externalId = Event.id) et SalesLocation (externalId = SpaceElement.id) -> groupBy
 * SalesTransaction.locationId. EXPLAIN requis (voir le rapport du lot) : index
 * (tenantId, eventId, status) de SalesTransaction.
 */
@Injectable()
export class PosSalesSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async byElement(tenantId: string, spaceId: string, eventId: string, elementIds: string[]): Promise<Map<string, PosPdvSales>> {
    const out = new Map<string, PosPdvSales>();
    if (!elementIds.length) return out;
    const mappings = await this.prisma.locationSpaceMapping.findMany({ where: { tenantId, spaceId }, select: { salesLocationId: true } });
    if (!mappings.length) return out;
    const integrations = await this.prisma.integration.findMany({
      where: { tenantId, provider: 'POS', id: { in: mappings.map((m) => m.salesLocationId) } },
      select: { id: true },
    });
    if (!integrations.length) return out;
    const integrationIds = integrations.map((i) => i.id);
    const salesEvents = await this.prisma.salesEvent.findMany({
      where: { tenantId, integrationId: { in: integrationIds }, externalId: eventId },
      select: { id: true },
    });
    if (!salesEvents.length) return out;
    const locations = await this.prisma.salesLocation.findMany({
      where: { tenantId, integrationId: { in: integrationIds }, externalId: { in: elementIds } },
      select: { id: true, externalId: true },
    });
    if (!locations.length) return out;
    const elementByLocation = new Map(locations.map((l) => [l.id, l.externalId]));
    const rows = await this.prisma.salesTransaction.groupBy({
      by: ['locationId'],
      where: {
        tenantId,
        eventId: { in: salesEvents.map((e) => e.id) },
        locationId: { in: locations.map((l) => l.id) },
        status: 'V',
        deletedAt: null,
      },
      _count: { _all: true },
      _sum: { amount: true },
    });
    for (const row of rows) {
      const elementId = row.locationId ? elementByLocation.get(row.locationId) : undefined;
      if (!elementId) continue;
      const previous = out.get(elementId) ?? { tickets: 0, revenueTtc: 0 };
      out.set(elementId, {
        tickets: previous.tickets + row._count._all,
        revenueTtc: round2(previous.revenueTtc + Number(row._sum.amount ?? 0)),
      });
    }
    return out;
  }
}
