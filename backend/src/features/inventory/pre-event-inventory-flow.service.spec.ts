import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { FlowEvent, PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../core/database/prisma.service';

const MIN = 60 * 1000;

/**
 * Flux Pre-event Inventory (critères d'acceptation 2026-09-14, fix robuste
 * 2026-09-17) : Doors Open = sessions.doorsOpening (jamais minuit), verrou 30 min,
 * régénération d'UNE feuille par match (lignes précédentes transmises), passage
 * portes ouvertes idempotent par marqueur réclamé, garde tardive.
 * InventoryService est mocké : createPreEventReconciliation/pushCountToLogistic
 * ont leur propre suite (inventory.service.spec.ts).
 */
describe('PreEventInventoryFlowService', () => {
  let service: PreEventInventoryFlowService;

  const mockInventory = {
    saveInventoryCounts: jest.fn().mockResolvedValue({ id: 'count-1' }),
    getBySpaceAndEvent: jest.fn(),
    createPreEventReconciliation: jest.fn(),
    upsertInventory: jest.fn().mockResolvedValue({ id: 'snap-1' }),
  };
  const mockPrisma = {
    event: { findFirst: jest.fn() },
    stockReconciliation: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    kvStore: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    inventoryWindow: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    inventoryCount: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const baseDto = {
    spaceId: 'space-1',
    eventId: 'event-1',
    shopId: 'shop-1',
    itemId: 'mi-cookie',
    packedUnits: 2,
    looseUnits: 1,
    isCounted: true,
    phase: 'pre-event' as const,
  };

  /** Jour UTC (minuit) de l'instant donné, comme `Event.eventDate` en base. */
  const dayOf = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  /** "HH:mm" locale Europe/Paris de l'instant donné. */
  const parisHHmm = (d: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(d)
      .replace('h', ':');

  /** Event Prisma (avec `space`) dont les portes ouvrent `minutes` minutes avant maintenant. */
  const prismaEventOpenedAgo = (minutes: number) => {
    const doors = new Date(Math.floor(Date.now() / MIN) * MIN - minutes * MIN);
    return {
      id: 'event-1',
      name: 'Match A',
      eventDate: dayOf(doors),
      eventStartDate: dayOf(doors),
      eventEndDate: null,
      eventEndTime: null,
      sessions: JSON.stringify([{ doorsOpening: parisHHmm(doors), showTime: null }]),
      space: { timezone: 'Europe/Paris' },
    };
  };

  const flowEvent = (minutes: number): FlowEvent => {
    const { space, ...e } = prismaEventOpenedAgo(minutes);
    return { ...e, tenantId: 'tenant-1', spaceId: 'space-1', timezone: space.timezone };
  };

  const eventWithoutDoors = () => ({
    ...prismaEventOpenedAgo(0),
    sessions: null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(prismaEventOpenedAgo(-120)); // portes dans 2h par défaut
    mockPrisma.stockReconciliation.findMany.mockResolvedValue([]);
    mockPrisma.kvStore.findUnique.mockResolvedValue(null);
    mockPrisma.kvStore.create.mockResolvedValue({});
    mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
    mockInventory.getBySpaceAndEvent.mockResolvedValue({
      inventoryCounts: {
        'shop-1': { 'mi-cookie': { packedUnits: 2, looseUnits: 1, isCounted: true } },
      },
    });
    mockInventory.createPreEventReconciliation.mockResolvedValue({
      id: 'reco-new',
      lines: [{}, {}],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreEventInventoryFlowService,
        { provide: InventoryService, useValue: mockInventory },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(PreEventInventoryFlowService);
  });

  describe('dates', () => {
    it("doorsOpenAt = sessions.doorsOpening posée sur le jour de l'event, fuseau du space", () => {
      // 19:30 à Paris le 14/09/2026 (heure d'été, UTC+2) = 17:30Z.
      const event: FlowEvent = {
        id: 'e',
        tenantId: 't',
        spaceId: 's',
        name: null,
        eventDate: new Date('2026-09-14T00:00:00.000Z'),
        eventStartDate: null,
        sessions: [{ doorsOpening: '19:30', showTime: '21:00' }],
        timezone: 'Europe/Paris',
      };
      expect(service.doorsOpenAt(event)).toEqual(new Date('2026-09-14T17:30:00.000Z'));
      expect(service.editDeadline(event)).toEqual(new Date('2026-09-14T18:00:00.000Z'));
      expect(service.windowState(event, new Date('2026-09-14T17:00:00.000Z')).phase).toBe('before');
      expect(service.windowState(event, new Date('2026-09-14T17:45:00.000Z')).phase).toBe(
        'editing',
      );
      expect(service.windowState(event, new Date('2026-09-14T18:00:01.000Z')).phase).toBe('locked');
    });

    it('sans doorsOpening : null, jamais minuit (eventDate est un jour, pas une heure)', () => {
      const event: FlowEvent = {
        id: 'e',
        tenantId: 't',
        spaceId: 's',
        name: null,
        eventDate: new Date('2026-09-14T00:00:00.000Z'),
        eventStartDate: new Date('2026-09-14T00:00:00.000Z'),
        sessions: '[]',
        timezone: 'Europe/Paris',
      };
      expect(service.doorsOpenAt(event)).toBeNull();
      expect(service.editDeadline(event)).toBeNull();
      expect(service.windowState(event)).toEqual({
        phase: 'no-doors-open',
        doorsOpenAt: null,
        editDeadline: null,
      });
    });

    it('sessions double-encodées (string JSON par élément) : lues quand même', () => {
      const event: FlowEvent = {
        id: 'e',
        tenantId: 't',
        spaceId: 's',
        name: null,
        eventDate: new Date('2026-12-14T00:00:00.000Z'),
        eventStartDate: null,
        sessions: '["{\\"doorsOpening\\":\\"12:00\\",\\"showTime\\":\\"14:00\\"}"]',
        timezone: 'Europe/Paris',
      };
      // Heure d'hiver (UTC+1).
      expect(service.doorsOpenAt(event)).toEqual(new Date('2026-12-14T11:00:00.000Z'));
    });
  });

  describe('saveCount', () => {
    it('hors phase pre-event : simple délégation, aucun verrou ni marquage', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(prismaEventOpenedAgo(90));
      await service.saveCount({ ...baseDto, phase: 'post-event' }, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledTimes(1);
      expect(mockPrisma.event.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.kvStore.upsert).not.toHaveBeenCalled();
    });

    it("sans heure d'ouverture des portes : aucun verrou, même le jour du match", async () => {
      mockPrisma.event.findFirst.mockResolvedValue(eventWithoutDoors());
      await service.saveCount(baseDto, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledTimes(1);
      expect(mockPrisma.kvStore.upsert).not.toHaveBeenCalled();
    });

    it('avant les portes : sauvegarde sans marquer dirty', async () => {
      await service.saveCount(baseDto, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledWith(baseDto, 'tenant-1', 'user-1');
      expect(mockPrisma.kvStore.upsert).not.toHaveBeenCalled();
    });

    it('dans les 30 min après les portes : sauvegarde ET marque la feuille à régénérer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(prismaEventOpenedAgo(10));
      await service.saveCount(baseDto, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledTimes(1);
      expect(mockPrisma.kvStore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            uniq_kv_store: { tenantId: 'tenant-1', key: 'pre-event-reco-dirty:space-1:event-1' },
          },
        }),
      );
    });

    it('dans les 30 min : un article déjà compté est figé (403), un non compté passe', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(prismaEventOpenedAgo(10));
      mockPrisma.inventoryCount.findFirst.mockResolvedValueOnce({ isCounted: true });
      await expect(
        service.saveCount({ ...baseDto, isCounted: false }, 'tenant-1', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockInventory.saveInventoryCounts).not.toHaveBeenCalled();

      mockPrisma.inventoryCount.findFirst.mockResolvedValueOnce({ isCounted: false });
      await service.saveCount(baseDto, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledTimes(1);
    });

    it('avant les portes : un article compté reste modifiable', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue({ isCounted: true });
      await service.saveCount({ ...baseDto, isCounted: false }, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledTimes(1);
    });

    it("plus de 30 min après les portes : 403, rien n'est écrit", async () => {
      mockPrisma.event.findFirst.mockResolvedValue(prismaEventOpenedAgo(31));
      await expect(service.saveCount(baseDto, 'tenant-1', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockInventory.saveInventoryCounts).not.toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('crée la feuille depuis les comptages vivants en transmettant les lignes précédentes, supprime les précédentes, pose le snapshot pre-event', async () => {
      const previousLines = [
        { elementId: 'shop-1', itemKey: 'mi-cookie', predictedUnits: 40, countedSource: 'count' },
      ];
      mockPrisma.stockReconciliation.findMany.mockResolvedValue([
        { id: 'reco-old', lines: previousLines },
      ]);

      const result = await service.regenerate(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        'pdv-complete',
        { elementId: 'shop-1' },
      );

      expect(result).toEqual({
        ok: true,
        reconciliationId: 'reco-new',
        lineCount: 2,
        document: { id: 'reco-new', lines: [{}, {}] },
      });
      expect(mockInventory.getBySpaceAndEvent).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'pre-event',
      );
      // Besoin prédit de l'ancienne feuille reporté, trigger archivé dans meta,
      // lignes précédentes transmises (reprise des lignes déjà poussées).
      expect(mockInventory.createPreEventReconciliation).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        true,
        { 'shop-1': { 'mi-cookie': 40 } },
        { trigger: 'pdv-complete', regeneratedFrom: 'reco-old', elementId: 'shop-1' },
        previousLines,
      );
      expect(mockPrisma.stockReconciliation.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['reco-old'] } },
      });
      expect(mockInventory.upsertInventory).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'space-1', eventId: 'event-1', kind: 'pre-event' }),
        'tenant-1',
        'user-1',
      );
    });

    it('appel manuel : le besoin prédit du client prime sur celui de la feuille précédente, réponse expurgée si demandé', async () => {
      mockPrisma.stockReconciliation.findMany.mockResolvedValue([
        {
          id: 'reco-old',
          lines: [{ elementId: 'shop-1', itemKey: 'mi-cookie', predictedUnits: 40 }],
        },
      ]);
      await service.regenerate(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        'manual',
        {},
        {
          predictedUnits: { 'shop-1': { 'mi-cookie': 55 } },
          canSeeExpected: false,
        },
      );
      expect(mockInventory.createPreEventReconciliation).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        false,
        { 'shop-1': { 'mi-cookie': 55 } },
        expect.objectContaining({ trigger: 'manual' }),
        expect.any(Array),
      );
    });

    it('sans aucun comptage : no-counts, rien de créé ni supprimé', async () => {
      mockInventory.getBySpaceAndEvent.mockResolvedValue({ inventoryCounts: {} });
      const result = await service.regenerate(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        'doors-open',
      );
      expect(result).toEqual({ ok: false, reason: 'no-counts' });
      expect(mockInventory.createPreEventReconciliation).not.toHaveBeenCalled();
      expect(mockPrisma.stockReconciliation.deleteMany).not.toHaveBeenCalled();
    });

    it('deux régénérations concurrentes du même match sont sérialisées', async () => {
      const order: string[] = [];
      mockInventory.createPreEventReconciliation.mockImplementation(async (...args: any[]) => {
        const trigger = args[6]?.trigger;
        order.push(`start:${trigger}`);
        await new Promise((r) => setTimeout(r, 20));
        order.push(`end:${trigger}`);
        return { id: `reco-${trigger}`, lines: [] };
      });
      await Promise.all([
        service.regenerate('space-1', 'event-1', 'tenant-1', 'u', 'pdv-complete'),
        service.regenerate('space-1', 'event-1', 'tenant-1', 'u', 'doors-open'),
      ]);
      expect(order).toEqual([
        'start:pdv-complete',
        'end:pdv-complete',
        'start:doors-open',
        'end:doors-open',
      ]);
    });

    it("un échec n'empêche pas la régénération suivante du même match", async () => {
      mockInventory.createPreEventReconciliation.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.regenerate('space-1', 'event-1', 'tenant-1', 'u', 'pdv-complete'),
      ).rejects.toThrow('boom');
      const result = await service.regenerate(
        'space-1',
        'event-1',
        'tenant-1',
        'u',
        'pdv-complete',
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('runDoorsOpen', () => {
    it('réclame le marqueur, clôt la fenêtre invité pre-event, régénère, archive le résultat', async () => {
      const result = await service.runDoorsOpen(flowEvent(1));

      expect(result.ok).toBe(true);
      expect(mockPrisma.kvStore.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          key: 'live-pre-event-init:space-1:event-1',
        }),
      });
      expect(mockPrisma.inventoryWindow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            spaceId: 'space-1',
            eventId: 'event-1',
            phase: 'pre-event',
            status: 'open',
          },
          data: expect.objectContaining({
            status: 'closed',
            closedBy: 'system-doors-open',
            pinLookupHash: null,
            pinCiphertext: null,
          }),
        }),
      );
      expect(mockInventory.createPreEventReconciliation).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'system-doors-open',
        true,
        null,
        expect.objectContaining({ trigger: 'doors-open' }),
        null,
      );
      expect(mockPrisma.kvStore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            uniq_kv_store: { tenantId: 'tenant-1', key: 'live-pre-event-init:space-1:event-1' },
          },
          data: {
            value: expect.objectContaining({ result: expect.objectContaining({ ok: true }) }),
          },
        }),
      );
    });

    it('idempotent : marqueur déjà pris (P2002), rien ne se passe', async () => {
      mockPrisma.kvStore.create.mockRejectedValueOnce({ code: 'P2002' });
      const result = await service.runDoorsOpen(flowEvent(1));
      expect(result).toEqual({ ok: false, reason: 'already-initialized' });
      expect(mockPrisma.inventoryWindow.updateMany).not.toHaveBeenCalled();
      expect(mockInventory.createPreEventReconciliation).not.toHaveBeenCalled();
    });

    it('pose le marqueur même sans comptage (rien à pousser, les saisies suivantes passent par dirty)', async () => {
      mockInventory.getBySpaceAndEvent.mockResolvedValue({ inventoryCounts: {} });
      const result = await service.runDoorsOpen(flowEvent(1));
      expect(result).toEqual({ ok: false, reason: 'no-counts' });
      expect(mockPrisma.kvStore.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.kvStore.delete).not.toHaveBeenCalled();
    });

    it('rattrapage tardif (fenêtre des 30 min dépassée) : fenêtre clôturée, marqueur posé, rien de régénéré', async () => {
      const result = await service.runDoorsOpen(flowEvent(60));
      expect(result).toEqual({ ok: false, reason: 'late' });
      expect(mockPrisma.inventoryWindow.updateMany).toHaveBeenCalledTimes(1);
      expect(mockInventory.createPreEventReconciliation).not.toHaveBeenCalled();
      expect(mockPrisma.kvStore.update).toHaveBeenCalledTimes(1);
    });

    it('échec du travail : le marqueur est retiré pour que le tick suivant réessaie', async () => {
      mockInventory.createPreEventReconciliation.mockRejectedValueOnce(new Error('boom'));
      await expect(service.runDoorsOpen(flowEvent(1))).rejects.toThrow('boom');
      expect(mockPrisma.kvStore.delete).toHaveBeenCalledWith({
        where: {
          uniq_kv_store: { tenantId: 'tenant-1', key: 'live-pre-event-init:space-1:event-1' },
        },
      });
    });

    it("manuel sans heure d'ouverture : passe quand même (pas de garde tardive possible)", async () => {
      const event: FlowEvent = { ...flowEvent(0), sessions: null };
      const result = await service.runDoorsOpen(event, 'user:u1');
      expect(result.ok).toBe(true);
      expect(mockPrisma.inventoryWindow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ closedBy: 'user:u1' }) }),
      );
    });
  });

  describe('flushDirty', () => {
    it('clean : rien', async () => {
      const result = await service.flushDirty(flowEvent(5));
      expect(result).toEqual({ ok: false, reason: 'clean' });
      expect(mockInventory.createPreEventReconciliation).not.toHaveBeenCalled();
    });

    it('dirty : retire le marqueur puis régénère', async () => {
      mockPrisma.kvStore.findUnique.mockResolvedValue({ id: 'kv-dirty' });
      const result = await service.flushDirty(flowEvent(5));
      expect(mockPrisma.kvStore.delete).toHaveBeenCalledWith({ where: { id: 'kv-dirty' } });
      expect(result.ok).toBe(true);
      expect(mockInventory.createPreEventReconciliation).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'system-post-doors-open-edit',
        true,
        null,
        expect.objectContaining({ trigger: 'post-doors-open-edit' }),
        null,
      );
    });

    it('régénération en échec : le marqueur est reposé', async () => {
      mockPrisma.kvStore.findUnique.mockResolvedValue({ id: 'kv-dirty' });
      mockInventory.createPreEventReconciliation.mockRejectedValueOnce(new Error('boom'));
      await expect(service.flushDirty(flowEvent(5))).rejects.toThrow('boom');
      expect(mockPrisma.kvStore.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWindowState', () => {
    it('expose la phase, les instants et si le passage portes ouvertes est déjà fait', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(prismaEventOpenedAgo(10));
      mockPrisma.kvStore.findUnique.mockResolvedValue({ id: 'kv-1' });
      const state = await service.getWindowState('space-1', 'event-1', 'tenant-1');
      expect(state.phase).toBe('editing');
      expect(state.doorsOpenAt).toBeInstanceOf(Date);
      expect(state.editDeadline!.getTime() - state.doorsOpenAt!.getTime()).toBe(30 * MIN);
      expect(state.doorsOpenDone).toBe(true);
    });
  });
});
