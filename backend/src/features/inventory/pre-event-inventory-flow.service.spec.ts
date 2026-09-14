import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../core/database/prisma.service';

const MIN = 60 * 1000;

/**
 * Flux Pre-event Inventory (critères d'acceptation 2026-09-14) : verrou 30 min,
 * régénération d'UNE feuille par match, passage portes ouvertes idempotent.
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
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    inventoryWindow: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

  const eventOpenedAgo = (minutes: number) => ({
    id: 'event-1',
    name: 'Match A',
    eventDate: new Date(Date.now() - minutes * MIN),
    eventStartDate: new Date(Date.now() - minutes * MIN),
    eventEndDate: null,
  });

  const flowEvent = (minutes: number) => ({
    ...eventOpenedAgo(minutes),
    tenantId: 'tenant-1',
    spaceId: 'space-1',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(eventOpenedAgo(-120)); // portes dans 2h par défaut
    mockPrisma.stockReconciliation.findMany.mockResolvedValue([]);
    mockPrisma.kvStore.findUnique.mockResolvedValue(null);
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
    it('doorsOpenAt = eventStartDate ?? eventDate, deadline = +30 min', () => {
      const eventDate = new Date('2026-09-14T18:00:00Z');
      const eventStartDate = new Date('2026-09-14T19:30:00Z');
      expect(service.doorsOpenAt({ eventDate, eventStartDate })).toEqual(eventStartDate);
      expect(service.doorsOpenAt({ eventDate, eventStartDate: null })).toEqual(eventDate);
      expect(service.editDeadline({ eventDate, eventStartDate: null })).toEqual(
        new Date('2026-09-14T18:30:00Z'),
      );
    });
  });

  describe('saveCount', () => {
    it('hors phase pre-event : simple délégation, aucun verrou ni marquage', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(eventOpenedAgo(90));
      await service.saveCount({ ...baseDto, phase: 'post-event' }, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledTimes(1);
      expect(mockPrisma.event.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.kvStore.upsert).not.toHaveBeenCalled();
    });

    it('avant les portes : sauvegarde sans marquer dirty', async () => {
      await service.saveCount(baseDto, 'tenant-1', 'user-1');
      expect(mockInventory.saveInventoryCounts).toHaveBeenCalledWith(baseDto, 'tenant-1', 'user-1');
      expect(mockPrisma.kvStore.upsert).not.toHaveBeenCalled();
    });

    it('dans les 30 min après les portes : sauvegarde ET marque la feuille à régénérer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(eventOpenedAgo(10));
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

    it("plus de 30 min après les portes : 403, rien n'est écrit", async () => {
      mockPrisma.event.findFirst.mockResolvedValue(eventOpenedAgo(31));
      await expect(service.saveCount(baseDto, 'tenant-1', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockInventory.saveInventoryCounts).not.toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('crée la feuille depuis les comptages vivants, supprime les précédentes, pose le snapshot pre-event', async () => {
      mockPrisma.stockReconciliation.findMany.mockResolvedValue([
        {
          id: 'reco-old',
          lines: [{ elementId: 'shop-1', itemKey: 'mi-cookie', predictedUnits: 40 }],
        },
      ]);

      const result = await service.regenerate(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        'pdv-complete',
        { elementId: 'shop-1' },
      );

      expect(result).toEqual({ ok: true, reconciliationId: 'reco-new', lineCount: 2 });
      expect(mockInventory.getBySpaceAndEvent).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'pre-event',
      );
      // Besoin prédit de l'ancienne feuille reporté, trigger archivé dans meta.
      expect(mockInventory.createPreEventReconciliation).toHaveBeenCalledWith(
        'space-1',
        'event-1',
        'tenant-1',
        'user-1',
        true,
        { 'shop-1': { 'mi-cookie': 40 } },
        { trigger: 'pdv-complete', regeneratedFrom: 'reco-old', elementId: 'shop-1' },
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
  });

  describe('runDoorsOpen', () => {
    it('clôt la fenêtre invité pre-event, régénère, pose le marqueur', async () => {
      const result = await service.runDoorsOpen(flowEvent(1));

      expect(result.ok).toBe(true);
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
      );
      expect(mockPrisma.kvStore.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          key: 'live-pre-event-init:space-1:event-1',
        }),
      });
    });

    it('idempotent : marqueur présent, rien ne se passe', async () => {
      mockPrisma.kvStore.findUnique.mockResolvedValue({ id: 'kv-1' });
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
      );
    });

    it('régénération en échec : le marqueur est reposé', async () => {
      mockPrisma.kvStore.findUnique.mockResolvedValue({ id: 'kv-dirty' });
      mockInventory.createPreEventReconciliation.mockRejectedValueOnce(new Error('boom'));
      await expect(service.flushDirty(flowEvent(5))).rejects.toThrow('boom');
      expect(mockPrisma.kvStore.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
