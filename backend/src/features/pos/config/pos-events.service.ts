import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EVENT_OVER_LOOKBACK_MS } from '../../../shared/utils/event-window.util';
import { PosAccessService } from '../../guest-pin-access/pos-access.service';
import { POS_PHASE, PosEventDetail, PosEventListItem, PosEventSettingDto, PosPdvRow, PosPdvStatus } from '../pos.contracts';
import { posEventStatus } from './pos-event-status';
import { PosPdvReaderService } from './pos-pdv-reader.service';
import { PosSalesSummaryService } from './pos-sales-summary.service';

const EVENT_SELECT = {
  id: true,
  name: true,
  eventDate: true,
  eventStartDate: true,
  eventEndDate: true,
  eventEndTime: true,
  sessions: true,
  configurationId: true,
  space: { select: { timezone: true } },
  configuration: { select: { name: true } },
} as const;

export const POS_DEFAULT_EVENT_SETTINGS: PosEventSettingDto = { paymentMethodIds: [], promosEnabled: true, cancelEnabled: true, lowStockUnits: 5, tipsEnabled: false };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lecture staff : évènements vendables d'un espace et détail de leurs caisses. */
@Injectable()
export class PosEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PosAccessService,
    private readonly pdvReader: PosPdvReaderService,
    private readonly salesSummary: PosSalesSummaryService,
  ) {}

  /** Évènements en cours et à venir de l'espace (fin réelle + grâce non dépassée), avec le nombre de caisses démarrées. */
  async listEvents(tenantId: string, spaceId: string, now: Date = new Date()): Promise<PosEventListItem[]> {
    const candidates = await this.prisma.event.findMany({
      where: { tenantId, spaceId, isSimulated: false, eventDate: { gte: new Date(now.getTime() - EVENT_OVER_LOOKBACK_MS) } },
      orderBy: { eventDate: 'asc' },
      take: 100,
      select: EVENT_SELECT,
    });
    const visible = candidates
      .map((event) => ({ event, status: posEventStatus(event, event.space?.timezone ?? 'Europe/Paris', now) }))
      .filter((entry): entry is { event: (typeof candidates)[number]; status: PosEventListItem['status'] } => entry.status !== null);
    if (!visible.length) return [];
    const started = await this.prisma.inventoryWindow.groupBy({
      by: ['eventId'],
      where: { tenantId, spaceId, phase: POS_PHASE, status: 'open', eventId: { in: visible.map((v) => v.event.id) } },
      _count: { _all: true },
    });
    const startedByEvent = new Map(started.map((s) => [s.eventId, s._count._all]));
    return visible.map(({ event, status }) => this.toListItem(event, status, startedByEvent.get(event.id) ?? 0));
  }

  /** `includePin` : vrai seulement pour `front.fb.posManage` ; sans lui le PIN reste null. */
  async getEventDetail(tenantId: string, spaceId: string, eventId: string, includePin: boolean, now: Date = new Date()): Promise<PosEventDetail> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId, spaceId }, select: EVENT_SELECT });
    if (!event) throw new NotFoundException('Évènement introuvable');
    const status = posEventStatus(event, event.space?.timezone ?? 'Europe/Paris', now) ?? 'live';

    const pdvs = event.configurationId ? await this.pdvReader.listForConfig(tenantId, event.configurationId) : [];
    const elementIds = pdvs.map((p) => p.elementId);
    const [statuses, pdvSettings, setting, sales] = await Promise.all([
      this.access.statuses(tenantId, spaceId, eventId, elementIds),
      this.prisma.posPdvSetting.findMany({ where: { tenantId, eventId, elementId: { in: elementIds } }, select: { elementId: true, responsibleHrPersonId: true } }),
      this.prisma.posEventSetting.findFirst({ where: { tenantId, eventId } }),
      this.salesSummary.byElement(tenantId, spaceId, eventId, elementIds),
    ]);
    const responsibleByElement = new Map(pdvSettings.map((s) => [s.elementId, s.responsibleHrPersonId]));
    const people = await this.peopleById(tenantId, [...responsibleByElement.values()].filter((id): id is string => !!id));
    const statusByElement = new Map(statuses.map((s) => [s.elementId, s]));

    const rows: PosPdvRow[] = pdvs.map((pdv) => {
      const access = statusByElement.get(pdv.elementId);
      const pdvSales = sales.get(pdv.elementId) ?? { tickets: 0, revenueTtc: 0 };
      const responsibleHrPersonId = responsibleByElement.get(pdv.elementId) ?? null;
      return {
        elementId: pdv.elementId,
        name: pdv.name,
        type: pdv.type,
        zoneLabel: pdv.zoneLabel,
        spaceMenuLabel: event.configuration?.name ?? null,
        itemsCount: pdv.itemsCount,
        status: this.pdvStatus(!!access?.open, pdvSales.tickets),
        pin: includePin ? (access?.pin ?? null) : null,
        qrSlug: pdv.slug,
        responsibleHrPersonId,
        responsibleName: responsibleHrPersonId ? (people.get(responsibleHrPersonId) ?? null) : null,
        otherSources: pdv.otherSources,
        sales: pdvSales,
      };
    });

    const tickets = rows.reduce((sum, r) => sum + r.sales.tickets, 0);
    const revenueTtc = round2(rows.reduce((sum, r) => sum + r.sales.revenueTtc, 0));
    return {
      event: this.toListItem(event, status, rows.filter((r) => r.status !== 'inactive').length),
      pdvs: rows,
      settings: setting
        ? { paymentMethodIds: setting.paymentMethodIds, promosEnabled: setting.promosEnabled, cancelEnabled: setting.cancelEnabled, lowStockUnits: setting.lowStockUnits, tipsEnabled: setting.tipsEnabled }
        : { ...POS_DEFAULT_EVENT_SETTINGS },
      kpis: {
        activePdv: rows.filter((r) => r.status !== 'inactive').length,
        totalPdv: rows.length,
        tickets,
        revenueTtc,
        averageBasketTtc: tickets ? round2(revenueTtc / tickets) : 0,
      },
    };
  }

  /** inactive = caisse non démarrée ; ready = démarrée sans vente ; selling = au moins un ticket. */
  private pdvStatus(open: boolean, tickets: number): PosPdvStatus {
    if (!open) return 'inactive';
    return tickets > 0 ? 'selling' : 'ready';
  }

  private toListItem(
    event: { id: string; name: string; eventDate: Date; configurationId: string | null },
    status: PosEventListItem['status'],
    startedPdvCount: number,
  ): PosEventListItem {
    return {
      id: event.id,
      name: event.name,
      eventDate: event.eventDate.toISOString(),
      status,
      configurationId: event.configurationId,
      startedPdvCount,
    };
  }

  private async peopleById(tenantId: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.hrPerson.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
  }
}
