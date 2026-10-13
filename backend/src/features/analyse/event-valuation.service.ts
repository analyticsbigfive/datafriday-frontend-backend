import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { loadPostEventDraftStates } from '../inventory/post-event-draft-state';
import { StockCostResolverService } from './stock-cost-resolver.service';
import { EventValuationQueryDto } from './dto/analyse-rendement.query.dto';
import { resolveShopNames } from './shop-name-scope';

type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

export interface EventValuationRow {
  eventId: string;
  /** null quand l'event n'a aucune feuille post-event. */
  value: number | null;
  isDraft: boolean;
  linesWithoutCost: number;
  reason: 'no-post-event-sheet' | 'unresolved-shop-names' | null;
  /** Présent quand des noms de PdV demandés (shopNames) ne correspondent à aucun élément. */
  unresolvedShopNames?: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Valorisation par event (règle 4) : dernière feuille StockReconciliation kind='post-event'
 * de chaque match (brouillon ou finale), Σ countedUnits × unitCost. Les lignes sans unitCost
 * sont revalorisées au coût actuel par le résolveur partagé ; sans coût, elles sont comptées
 * à part et jamais valorisées à 0.
 */
@Injectable()
export class EventValuationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly costResolver: StockCostResolverService,
  ) {}

  async getValuations(tenantId: string, query: EventValuationQueryDto, user?: SpaceScopedUser): Promise<EventValuationRow[]> {
    const { spaceId } = query;
    const eventIds = query.eventIds ?? [];
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId, user);
    if (!eventIds.length) return [];
    let shopIdList = query.shopIds ?? [];
    let unresolvedShopNames: string[] | undefined;
    if (query.shopNames?.length) {
      const resolved = await resolveShopNames(this.prisma, spaceId, tenantId, query.shopNames);
      unresolvedShopNames = resolved.unresolvedShopNames;
      shopIdList = [...new Set([...shopIdList, ...resolved.ids])];
      // Des noms sont demandés mais rien ne correspond : jamais les lignes de tous les PdV.
      if (!shopIdList.length) {
        return eventIds.map((eventId) => ({
          eventId, value: null, isDraft: false, linesWithoutCost: 0, reason: 'unresolved-shop-names' as const, unresolvedShopNames,
        }));
      }
    }
    const shopIds = shopIdList.length ? new Set(shopIdList) : null;

    // Une seule requête pour tous les events, la plus récente d'abord.
    const docs = await this.prisma.stockReconciliation.findMany({
      where: { tenantId, spaceId, kind: 'post-event', eventId: { in: eventIds } },
      orderBy: { createdAt: 'desc' },
      select: { eventId: true, lines: true, meta: true },
    });
    const latestByEvent = new Map<string, (typeof docs)[number]>();
    for (const d of docs) if (d.eventId && !latestByEvent.has(d.eventId)) latestByEvent.set(d.eventId, d);

    // Le brouillon se recalcule à la lecture (même règle que la liste des réconciliations).
    const flaggedDraft = [...latestByEvent.values()]
      .filter((d) => !!(d.meta as { draft?: boolean } | null)?.draft)
      .map((d) => d.eventId as string);
    const liveDraft = flaggedDraft.length
      ? await loadPostEventDraftStates(this.prisma, tenantId, spaceId, flaggedDraft)
      : new Map<string, boolean>();

    type Line = { elementId?: unknown; itemKey?: unknown; countedUnits?: unknown; unitCost?: unknown };
    const linesByEvent = new Map<string, Line[]>();
    const toRevalue: Array<{ key: string; itemKey: string }> = [];
    for (const [eventId, doc] of latestByEvent) {
      const raw = Array.isArray(doc.lines) ? (doc.lines as Line[]) : [];
      const lines = raw.filter((l) => !shopIds || (typeof l?.elementId === 'string' && shopIds.has(l.elementId)));
      linesByEvent.set(eventId, lines);
      lines.forEach((l, i) => {
        const counted = num(l.countedUnits);
        const cost = num(l.unitCost);
        if (counted && counted > 0 && (cost == null || cost <= 0) && typeof l.itemKey === 'string') {
          toRevalue.push({ key: `${eventId}#${i}`, itemKey: l.itemKey });
        }
      });
    }

    const revalued = await this.costResolver.resolve(
      tenantId,
      toRevalue.map((r) => ({ key: r.key, itemRefId: r.itemKey })),
    );

    return eventIds.map((eventId): EventValuationRow => {
      const doc = latestByEvent.get(eventId);
      if (!doc) return { eventId, value: null, isDraft: false, linesWithoutCost: 0, reason: 'no-post-event-sheet' };
      let value = 0;
      let linesWithoutCost = 0;
      (linesByEvent.get(eventId) ?? []).forEach((l, i) => {
        const counted = num(l.countedUnits);
        if (!counted || counted <= 0) return;
        let cost = num(l.unitCost);
        if (cost == null || cost <= 0) cost = revalued.get(`${eventId}#${i}`)?.unitCost ?? null;
        if (cost == null) {
          linesWithoutCost += 1;
          return;
        }
        value += counted * cost;
      });
      const flagged = !!(doc.meta as { draft?: boolean } | null)?.draft;
      const isDraft = flagged && liveDraft.get(eventId) !== false;
      return {
        eventId, value: round2(value), isDraft, linesWithoutCost, reason: null,
        ...(unresolvedShopNames?.length ? { unresolvedShopNames } : {}),
      };
    });
  }
}
