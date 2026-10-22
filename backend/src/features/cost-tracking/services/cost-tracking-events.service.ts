import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { localMidnightOf, resolveEventReference } from '../cost-tracking-event-reference.util';
import { EventReferenceSource } from '../cost-tracking.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 180;
const MAX_PERIOD_DAYS = 1830;
const DEFAULT_TIMEZONE = 'Europe/Paris';
/** Plafond d'events renvoyés pour les étiquettes du graphique. */
const MAX_EVENTS = 200;

export interface CostTrackingPeriod {
  /** Jours calendaires `YYYY-MM-DD` demandés (bornes incluses). */
  fromDay: string;
  toDay: string;
  /** Instants UTC : minuit local de `fromDay` (inclus) et minuit local du lendemain de `toDay` (exclu). */
  from: Date;
  toExclusive: Date;
  timezone: string;
}

export interface CostTrackingEvent {
  id: string;
  name: string;
  /** Jour de l'event (`YYYY-MM-DD`). */
  eventDate: string;
  /** Instant de référence ISO (portes ouvertes, sinon minuit local). */
  referenceAt: string;
  referenceSource: EventReferenceSource;
}

const toDay = (d: Date) => d.toISOString().slice(0, 10);

/** Période demandée et events de l'espace qu'elle contient, avec leur instant de référence. */
@Injectable()
export class CostTrackingEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async spaceTimezone(tenantId: string, spaceId: string): Promise<string> {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } });
    return space?.timezone || DEFAULT_TIMEZONE;
  }

  async resolvePeriod(tenantId: string, spaceId: string, fromRaw?: string, toRaw?: string): Promise<CostTrackingPeriod> {
    const timezone = await this.spaceTimezone(tenantId, spaceId);
    const todayDay = new Date(`${toDay(new Date())}T00:00:00.000Z`);
    const toDayDate = toRaw ? new Date(`${toRaw.slice(0, 10)}T00:00:00.000Z`) : todayDay;
    const fromDayDate = fromRaw ? new Date(`${fromRaw.slice(0, 10)}T00:00:00.000Z`) : new Date(toDayDate.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
    if (Number.isNaN(fromDayDate.getTime()) || Number.isNaN(toDayDate.getTime())) throw new BadRequestException('Période invalide.');
    if (fromDayDate > toDayDate) throw new BadRequestException('La date de début doit précéder la date de fin.');
    if ((toDayDate.getTime() - fromDayDate.getTime()) / DAY_MS > MAX_PERIOD_DAYS) {
      throw new BadRequestException(`La période ne peut pas dépasser ${MAX_PERIOD_DAYS} jours.`);
    }
    return {
      fromDay: toDay(fromDayDate),
      toDay: toDay(toDayDate),
      from: localMidnightOf(fromDayDate, timezone),
      toExclusive: localMidnightOf(new Date(toDayDate.getTime() + DAY_MS), timezone),
      timezone,
    };
  }

  /** Events de l'espace dont le jour de début tombe dans la période, du plus ancien au plus récent. */
  async listEvents(tenantId: string, spaceId: string, period: CostTrackingPeriod): Promise<CostTrackingEvent[]> {
    const dayFrom = new Date(`${period.fromDay}T00:00:00.000Z`);
    const dayTo = new Date(`${period.toDay}T00:00:00.000Z`);
    const rows = await this.prisma.event.findMany({
      where: {
        tenantId,
        spaceId,
        OR: [
          { eventStartDate: { gte: dayFrom, lte: dayTo } },
          { eventStartDate: null, eventDate: { gte: dayFrom, lte: dayTo } },
        ],
      },
      select: { id: true, name: true, eventDate: true, eventStartDate: true, eventEndDate: true, sessions: true },
      orderBy: [{ eventDate: 'asc' }, { name: 'asc' }],
      take: MAX_EVENTS,
    });
    return rows
      .map((e) => {
        const ref = resolveEventReference(e, period.timezone);
        return {
          id: e.id,
          name: e.name,
          eventDate: toDay(new Date(e.eventStartDate ?? e.eventDate)),
          referenceAt: ref.at.toISOString(),
          referenceSource: ref.source,
        };
      })
      .sort((a, b) => a.referenceAt.localeCompare(b.referenceAt));
  }
}
