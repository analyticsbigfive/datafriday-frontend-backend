import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { CostTrackingAsOfService } from '../cost-tracking/services/cost-tracking-as-of.service';

type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

export type EventCostSource = 'snapshot' | 'baseline' | 'current';

export interface EventCostEntry {
  /** Coût de fournée (MenuItem.totalCost), même sémantique que la menuItemCostMap de l'Analyse. */
  totalCost: number;
  source: EventCostSource;
  /** Date de la version retenue, null pour le repli sur le coût courant. */
  versionAt: string | null;
}

export interface EventCostsResult {
  events: Record<string, Record<string, EventCostEntry>>;
  /** Ids demandés qui ne sont pas des events de cet espace : l'appelant garde le coût courant. */
  unknownEventIds: string[];
}

/** Events traités en parallèle : borne la pression sur le pooleur (4 requêtes par event). */
const CONCURRENCY = 5;

/**
 * Carte des coûts par event (lot 4a du Cost tracking). Complète `menuItemCostMap` (coût courant,
 * construit dans la RPC shop_details, inchangée) : pour chaque event, le coût de chaque article
 * rattaché à Weezevent tel qu'il était à l'instant de référence de l'event. Sans snapshot, le
 * coût courant de MenuItem est renvoyé (source `current`), donc le comportement d'avant.
 */
@Injectable()
export class EventCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly asOf: CostTrackingAsOfService,
  ) {}

  async getEventCosts(tenantId: string, spaceId: string, eventIds: string[], user?: SpaceScopedUser): Promise<EventCostsResult> {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId, user);
    const wanted = [...new Set(eventIds)];
    if (!wanted.length) return { events: {}, unknownEventIds: [] };

    const known = await this.prisma.event.findMany({ where: { id: { in: wanted }, tenantId, spaceId }, select: { id: true } });
    const knownIds = known.map((e) => e.id);
    const knownSet = new Set(knownIds);
    const unknownEventIds = wanted.filter((id) => !knownSet.has(id));
    if (!knownIds.length) return { events: {}, unknownEventIds };

    const current = await this.currentCosts(tenantId);
    const menuItemIds = [...current.keys()];
    const events: Record<string, Record<string, EventCostEntry>> = {};
    for (let i = 0; i < knownIds.length; i += CONCURRENCY) {
      const chunk = knownIds.slice(i, i + CONCURRENCY);
      // eslint-disable-next-line no-await-in-loop -- petits lots pour ne pas saturer le pooleur
      const results = await Promise.all(chunk.map((eventId) => this.asOf.costsAsOf(tenantId, { eventId, menuItemIds })));
      for (const r of results) events[r.eventId] = this.merge(current, r.costs);
    }
    return { events, unknownEventIds };
  }

  /** Articles rattachés à un produit Weezevent avec leur coût courant (même périmètre que la RPC). */
  private async currentCosts(tenantId: string): Promise<Map<string, number>> {
    const mappings = await this.prisma.productMapping.findMany({
      where: { tenantId },
      select: { menuItemId: true },
      distinct: ['menuItemId'],
    });
    const ids = mappings.map((m) => m.menuItemId);
    const out = new Map<string, number>();
    if (!ids.length) return out;
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: ids }, tenantId, totalCost: { not: null } },
      select: { id: true, totalCost: true },
    });
    for (const it of items) out.set(it.id, Number(it.totalCost));
    return out;
  }

  private merge(
    current: Map<string, number>,
    asOfCosts: Record<string, { totalCost: number; versionAt: string; source: 'snapshot' | 'baseline' }>,
  ): Record<string, EventCostEntry> {
    const out: Record<string, EventCostEntry> = {};
    for (const [menuItemId, totalCost] of current) {
      const snap = asOfCosts[menuItemId];
      out[menuItemId] = snap
        ? { totalCost: snap.totalCost, source: snap.source, versionAt: snap.versionAt }
        : { totalCost, source: 'current', versionAt: null };
    }
    return out;
  }
}
