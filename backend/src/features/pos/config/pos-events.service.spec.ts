import { NotFoundException } from '@nestjs/common';
import { PosEventsService } from './pos-events.service';
import { posEventStatus } from './pos-event-status';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date('2099-01-10T12:00:00.000Z');

const baseEvent = (over: object = {}) => ({
  id: 'ev-1', name: 'Match', eventDate: day('2099-01-10'), eventStartDate: day('2099-01-10'), eventEndDate: day('2099-01-10'),
  eventEndTime: '23:00', sessions: null, configurationId: 'cfg-1', space: { timezone: 'Europe/Paris' }, configuration: { name: 'Config match' }, ...over,
});

describe('posEventStatus', () => {
  const ev = baseEvent();
  it('live pendant le jour du match, upcoming avant, null après fin réelle + grâce', () => {
    expect(posEventStatus(ev, 'Europe/Paris', NOW)).toBe('live');
    expect(posEventStatus(ev, 'Europe/Paris', new Date('2099-01-09T12:00:00.000Z'))).toBe('upcoming');
    expect(posEventStatus(ev, 'Europe/Paris', new Date('2099-01-11T05:00:00.000Z'))).toBeNull();
  });
  it('la grâce garde la caisse ouverte juste après la fin déclarée', () => {
    // fin 23:00 Paris = 22:00Z, grâce 3 h : encore vendable à 00:30Z le lendemain
    expect(posEventStatus(ev, 'Europe/Paris', new Date('2099-01-11T00:30:00.000Z'))).toBe('live');
  });
});

describe('PosEventsService', () => {
  let prisma: any;
  let access: { statuses: jest.Mock };
  let pdvReader: { listForConfig: jest.Mock };
  let salesSummary: { byElement: jest.Mock };
  let service: PosEventsService;

  const pdv = (id: string, extra: object = {}) => ({ elementId: id, name: `PdV ${id}`, type: 'shop', slug: `slug-${id}`, zoneLabel: 'RDC', itemsCount: 4, otherSources: [], ...extra });
  const status = (id: string, open: boolean, pin: string | null) => ({ elementId: id, windowId: open ? `w-${id}` : null, open, pin, pinSetAt: null, openedAt: null, closedAt: null, lastLoginAt: null });

  beforeEach(() => {
    prisma = {
      event: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(baseEvent()) },
      inventoryWindow: { groupBy: jest.fn().mockResolvedValue([]) },
      posPdvSetting: { findMany: jest.fn().mockResolvedValue([]) },
      posEventSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      hrPerson: { findMany: jest.fn().mockResolvedValue([]) },
    };
    access = { statuses: jest.fn() };
    pdvReader = { listForConfig: jest.fn() };
    salesSummary = { byElement: jest.fn().mockResolvedValue(new Map()) };
    service = new PosEventsService(prisma, access as any, pdvReader as any, salesSummary as any);
  });

  describe('listEvents', () => {
    it('garde en cours et à venir, écarte les terminés, compte les caisses démarrées', async () => {
      prisma.event.findMany.mockResolvedValue([
        baseEvent({ id: 'ev-past', eventDate: day('2099-01-05'), eventStartDate: day('2099-01-05'), eventEndDate: day('2099-01-05') }),
        baseEvent({ id: 'ev-live' }),
        baseEvent({ id: 'ev-next', eventDate: day('2099-01-20'), eventStartDate: day('2099-01-20'), eventEndDate: day('2099-01-20') }),
      ]);
      prisma.inventoryWindow.groupBy.mockResolvedValue([{ eventId: 'ev-live', _count: { _all: 3 } }]);
      const out = await service.listEvents('t', 's', NOW);
      expect(out.map((e) => [e.id, e.status, e.startedPdvCount])).toEqual([['ev-live', 'live', 3], ['ev-next', 'upcoming', 0]]);
      expect(prisma.event.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't', spaceId: 's', isSimulated: false });
    });
  });

  describe('getEventDetail', () => {
    beforeEach(() => {
      pdvReader.listForConfig.mockResolvedValue([pdv('a'), pdv('b', { otherSources: ['WEEZEVENT'] }), pdv('c')]);
      access.statuses.mockResolvedValue([status('a', false, null), status('b', true, '123456'), status('c', true, '654321')]);
      salesSummary.byElement.mockResolvedValue(new Map([['c', { tickets: 4, revenueTtc: 52 }]]));
    });

    it('statut : inactive (non démarrée), ready (démarrée sans vente), selling (au moins un ticket)', async () => {
      const detail = await service.getEventDetail('t', 's', 'ev-1', true, NOW);
      expect(detail.pdvs.map((p) => [p.elementId, p.status])).toEqual([['a', 'inactive'], ['b', 'ready'], ['c', 'selling']]);
      expect(detail.pdvs[1].otherSources).toEqual(['WEEZEVENT']);
      expect(detail.pdvs[0]).toMatchObject({ qrSlug: 'slug-a', spaceMenuLabel: 'Config match', itemsCount: 4 });
    });

    it('PIN en clair avec posManage seulement', async () => {
      const withManage = await service.getEventDetail('t', 's', 'ev-1', true, NOW);
      expect(withManage.pdvs.map((p) => p.pin)).toEqual([null, '123456', '654321']);
      const without = await service.getEventDetail('t', 's', 'ev-1', false, NOW);
      expect(without.pdvs.map((p) => p.pin)).toEqual([null, null, null]);
      expect(JSON.stringify(without)).not.toContain('123456');
    });

    it('KPI, réglages par défaut et responsable RH', async () => {
      prisma.posPdvSetting.findMany.mockResolvedValue([{ elementId: 'b', responsibleHrPersonId: 'hr-1' }]);
      prisma.hrPerson.findMany.mockResolvedValue([{ id: 'hr-1', firstName: 'Awa', lastName: 'Kone' }]);
      const detail = await service.getEventDetail('t', 's', 'ev-1', false, NOW);
      expect(detail.kpis).toEqual({ activePdv: 2, totalPdv: 3, tickets: 4, revenueTtc: 52, averageBasketTtc: 13 });
      expect(detail.settings).toEqual({ paymentMethodIds: [], promosEnabled: true, cancelEnabled: true, lowStockUnits: 5, tipsEnabled: false });
      expect(detail.pdvs[1]).toMatchObject({ responsibleHrPersonId: 'hr-1', responsibleName: 'Awa Kone' });
      expect(detail.event).toMatchObject({ id: 'ev-1', status: 'live', startedPdvCount: 2 });
    });

    it('réglages enregistrés repris tels quels', async () => {
      prisma.posEventSetting.findFirst.mockResolvedValue({ paymentMethodIds: ['pm-1'], promosEnabled: false, cancelEnabled: true, lowStockUnits: 3, tipsEnabled: true });
      expect((await service.getEventDetail('t', 's', 'ev-1', false, NOW)).settings).toEqual({ paymentMethodIds: ['pm-1'], promosEnabled: false, cancelEnabled: true, lowStockUnits: 3, tipsEnabled: true });
    });

    it('évènement sans configuration : aucun PdV', async () => {
      prisma.event.findFirst.mockResolvedValue(baseEvent({ configurationId: null }));
      access.statuses.mockResolvedValue([]);
      const detail = await service.getEventDetail('t', 's', 'ev-1', true, NOW);
      expect(detail.pdvs).toEqual([]);
      expect(pdvReader.listForConfig).not.toHaveBeenCalled();
      expect(detail.kpis.averageBasketTtc).toBe(0);
    });

    it('évènement hors espace ou tenant : introuvable', async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.getEventDetail('t', 's', 'nope', true, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
