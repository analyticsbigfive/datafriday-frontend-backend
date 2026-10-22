import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { resolveEventReference } from '../cost-tracking-event-reference.util';
import { EventReferenceSource } from '../cost-tracking.types';
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
    return { eventId: event.id, referenceAt: reference.at.toISOString(), referenceSource: reference.source, costs };
  }
}
