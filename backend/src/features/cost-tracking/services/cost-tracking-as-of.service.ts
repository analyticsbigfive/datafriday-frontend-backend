import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { resolveEventReference } from '../cost-tracking-event-reference.util';
import { EventDayFields } from '../../../shared/utils/event-window.util';
import { EventReferenceSource, SnapshotPoint } from '../cost-tracking.types';
import { CostTrackingSnapshotReaderService } from './cost-tracking-snapshot-reader.service';

const DEFAULT_TIMEZONE = 'Europe/Paris';

export interface CostAsOf {
  totalCost: number;
  numberOfPieces: number;
  costPerPiece: number;
  basePrice: number | null;
  /** Date de la version retenue. */
  versionAt: string;
  /** `baseline` : l'event précède le premier snapshot, la toute première version est utilisée. */
  source: 'snapshot' | 'baseline';
}

export interface CostsAsOfResult {
  eventId: string;
  referenceAt: string;
  referenceSource: EventReferenceSource;
  /** Articles sans aucun snapshot : absents de la carte (l'appelant se replie sur le coût courant). */
  costs: Record<string, CostAsOf>;
}

/**
 * Coût des articles à la date d'un event (PLAN §3), destiné au lot 4 (rapports d'Analyse).
 * Instant de référence = ouverture des portes, sinon minuit local du jour de l'event.
 */
@Injectable()
export class CostTrackingAsOfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: CostTrackingSnapshotReaderService,
  ) {}

  async costsAsOf(tenantId: string, input: { eventId: string; menuItemIds: string[] }): Promise<CostsAsOfResult> {
    const event = await this.prisma.event.findFirst({
      where: { id: input.eventId, tenantId },
      select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, sessions: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable.');
    const space = event.spaceId
      ? await this.prisma.space.findFirst({ where: { id: event.spaceId, tenantId }, select: { timezone: true } })
      : null;
    const reference = resolveEventReference(event, space?.timezone || DEFAULT_TIMEZONE);
    const found = await this.reader.readAsOf(tenantId, input.menuItemIds, reference.at);
    const costs = this.toCosts(found);
    return { eventId: event.id, referenceAt: reference.at.toISOString(), referenceSource: reference.source, costs };
  }

  /**
   * Variante lot de `costsAsOf` pour des events déjà chargés (même espace, donc même fuseau) :
   * pas de relecture des events ni du space, et une lecture de snapshots unique pour tous les
   * instants de référence. Résultat identique à un `costsAsOf` par event, dans l'ordre d'entrée.
   */
  async costsAsOfMany(
    tenantId: string,
    input: { events: Array<EventDayFields & { id: string }>; timeZone?: string | null; menuItemIds: string[] },
  ): Promise<CostsAsOfResult[]> {
    const timeZone = input.timeZone || DEFAULT_TIMEZONE;
    const references = input.events.map((event) => resolveEventReference(event, timeZone));
    const found = await this.reader.readAsOfMany(tenantId, input.menuItemIds, references.map((r) => r.at));
    return input.events.map((event, i) => ({
      eventId: event.id,
      referenceAt: references[i].at.toISOString(),
      referenceSource: references[i].source,
      costs: this.toCosts(found.get(references[i].at.getTime()) ?? new Map()),
    }));
  }

  private toCosts(found: Map<string, { snapshot: SnapshotPoint; source: 'snapshot' | 'baseline' }>): Record<string, CostAsOf> {
    const costs: Record<string, CostAsOf> = {};
    for (const [menuItemId, { snapshot, source }] of found) {
      costs[menuItemId] = {
        totalCost: snapshot.totalCost,
        numberOfPieces: snapshot.numberOfPieces,
        costPerPiece: snapshot.costPerPiece,
        basePrice: snapshot.basePrice,
        versionAt: snapshot.effectiveFrom.toISOString(),
        source,
      };
    }
    return costs;
  }
}
