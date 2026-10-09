import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  EVENT_OVER_LOOKBACK_MS,
  isEventOver,
  resolveEventTransactionWindow,
} from '../../shared/utils/event-window.util';

/** Au plus autant de matchs à venir dans la liste déroulante (une saison complète). */
const MAX_EVENTS = 60;

const EVENT_SELECT = {
  id: true,
  name: true,
  homeTeamName: true,
  visitingTeamName: true,
  eventDate: true,
  eventStartDate: true,
  eventEndDate: true,
  eventEndTime: true,
  sessions: true,
  configurationId: true,
} as const;

export interface VentilationEventOption {
  id: string;
  name: string;
  /** « Nantes vs Reims » quand les deux équipes sont connues, sinon le nom de l'event. */
  label: string;
  eventDate: Date;
  /** Fin réelle (heure de fin saisie, sinon durée par défaut) : la sélection par défaut tient jusque-là. */
  endsAt: Date;
  configurationId: string | null;
}

/** Libellé « match », même règle que `matchLabel` côté front (utils/inventoryEventContext.js). */
export function eventMatchLabel(e: { name?: string | null; homeTeamName?: string | null; visitingTeamName?: string | null }): string {
  const home = String(e.homeTeamName ?? '').trim();
  const away = String(e.visitingTeamName ?? '').trim();
  return home && away ? `${home} vs ${away}` : String(e.name ?? '');
}

/**
 * Matchs proposés par le sélecteur d'events de Logistique (maquettes Bertrand du
 * 2026-10-09) : ceux qui ne sont pas encore terminés, du plus proche au plus lointain.
 * Le premier est la sélection par défaut, jusqu'à sa fin réelle (et non jusqu'à
 * l'ouverture des portes, règle du « prochain event » de l'inventaire).
 */
@Injectable()
export class VentilationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpenEvents(spaceId: string, tenantId: string, now: Date = new Date()) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } });
    if (!space) throw new NotFoundException('Espace introuvable');
    const timeZone = space.timezone || 'Europe/Paris';
    const rows = await this.prisma.event.findMany({
      where: {
        spaceId,
        tenantId,
        isSimulated: false,
        // Au-delà de ce recul, un match est forcément terminé : seuls les plus récents sont évalués.
        eventDate: { gte: new Date(now.getTime() - EVENT_OVER_LOOKBACK_MS) },
      },
      select: EVENT_SELECT,
      orderBy: { eventDate: 'asc' },
      take: MAX_EVENTS * 2,
    });
    const events: VentilationEventOption[] = rows
      .filter((e) => !isEventOver(e, timeZone, now))
      .slice(0, MAX_EVENTS)
      .map((e) => ({
        id: e.id,
        name: e.name,
        label: eventMatchLabel(e),
        eventDate: e.eventDate,
        endsAt: resolveEventTransactionWindow(e, timeZone).end,
        configurationId: e.configurationId,
      }));
    return { events, defaultEventId: events[0]?.id ?? null };
  }

  /**
   * Matchs choisis, dans l'ordre chronologique, limités à l'espace du tenant. Le
   * premier porte le PIN de la sélection (maquette Bertrand : « l'accès se fait par le
   * PIN du premier event »).
   */
  async orderedEvents(spaceId: string, tenantId: string, eventIds: string[]) {
    const ids = [...new Set(eventIds.filter(Boolean))];
    if (!ids.length) return [];
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } });
    const timeZone = space?.timezone || 'Europe/Paris';
    const rows = await this.prisma.event.findMany({
      where: { id: { in: ids }, spaceId, tenantId },
      select: EVENT_SELECT,
    });
    return rows
      .map((e) => ({ ...e, endsAt: resolveEventTransactionWindow(e, timeZone).end }))
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime() || a.endsAt.getTime() - b.endsAt.getTime());
  }
}
