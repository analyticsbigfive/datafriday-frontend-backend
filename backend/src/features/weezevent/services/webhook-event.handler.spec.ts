import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEventHandler } from './webhook-event.handler';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { LiveEventWindowService } from './live/live-event-window.service';
import { LiveAggregationTriggerService } from './live/live-aggregation-trigger.service';
import { WebhookHealthService } from './live/webhook-health.service';

describe('WebhookEventHandler', () => {
  let handler: WebhookEventHandler;
  let prisma: PrismaService;
  let syncService: WeezeventSyncService;

  const mockWebhookEvent = {
    id: 'event-123',
    tenantId: 'tenant-123',
    eventType: 'transaction',
    method: 'create',
    payload: {
      type: 'transaction',
      method: 'create',
      data: { id: 'tx-123' },
    },
    processed: false,
    tenant: {
      id: 'tenant-123',
      weezeventOrganizationId: 'weez-org-123',
    },
  };

  const mockTenant = {
    id: 'tenant-123',
    weezeventEnabled: true,
    weezeventOrganizationId: 'weez-org-123',
  };

  const mockPrismaService = {
    integrationWebhookEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    salesTransaction: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    event: {
      findFirst: jest.fn(),
    },
    aggregationJobLog: {
      create: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  };

  const mockSyncService = {
    syncTransactions: jest.fn(),
    syncSingleTransaction: jest.fn(),
  };

  const mockLiveWindow = { findLiveEvents: jest.fn() };
  const mockLiveTrigger = { queueMinuteAggregation: jest.fn() };
  const mockWebhookHealth = { markProcessed: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventHandler,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WeezeventSyncService,
          useValue: mockSyncService,
        },
        { provide: LiveEventWindowService, useValue: mockLiveWindow },
        { provide: LiveAggregationTriggerService, useValue: mockLiveTrigger },
        { provide: WebhookHealthService, useValue: mockWebhookHealth },
      ],
    }).compile();

    handler = module.get<WebhookEventHandler>(WebhookEventHandler);
    prisma = module.get<PrismaService>(PrismaService);
    syncService = module.get<WeezeventSyncService>(WeezeventSyncService);

    jest.clearAllMocks();
    // Défaut : aucun event en direct → pas d'agrégation déclenchée (BUG-109 / BUG-379-02).
    mockLiveWindow.findLiveEvents.mockResolvedValue([]);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('processEvent', () => {
    it('should process transaction create event', async () => {
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(mockWebhookEvent);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({
        ...mockWebhookEvent,
        processed: true,
      });
      mockSyncService.syncSingleTransaction.mockResolvedValue({ success: true });

      await handler.processEvent('event-123');

      expect(mockPrismaService.integrationWebhookEvent.findUnique).toHaveBeenCalledWith({
        where: { id: 'event-123' },
        include: { tenant: true },
      });
    });

    it('should skip already processed events', async () => {
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        processed: true,
      });

      await handler.processEvent('event-123');

      expect(mockPrismaService.integrationWebhookEvent.update).not.toHaveBeenCalled();
    });

    it('should handle event not found', async () => {
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);

      await handler.processEvent('non-existent');

      expect(mockPrismaService.integrationWebhookEvent.update).not.toHaveBeenCalled();
    });

    it('should update error on failure', async () => {
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        payload: { type: 'transaction', method: 'create', data: {} }, // Missing ID
      });

      await expect(handler.processEvent('event-123')).rejects.toThrow();

      expect(mockPrismaService.integrationWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-123' },
        data: expect.objectContaining({
          error: expect.any(String),
          retryCount: { increment: 1 },
        }),
      });
    });

    // BUG-028 (corrigé) : markTransactionAsDeleted doit vraiment marquer un deletedAt, pas
    // seulement toucher syncedAt.
    it('should soft-delete the transaction (set deletedAt) on a transaction delete webhook', async () => {
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        method: 'delete',
        payload: { type: 'transaction', method: 'delete', data: { id: 'tx-123' } },
      });
      mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({});
      mockPrismaService.salesTransaction.updateMany.mockResolvedValue({ count: 1 });

      await handler.processEvent('event-123');

      expect(mockPrismaService.salesTransaction.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', integrationId: undefined, externalId: 'tx-123', deletedAt: null },
        data: { deletedAt: expect.any(Date), syncedAt: expect.any(Date) },
      });
      expect(mockSyncService.syncSingleTransaction).not.toHaveBeenCalled();
    });

    // BUG-109 / BUG-379-02 : après un sync réussi, l'agrégation live par minute est mise en
    // file (coalescée) pour les events en direct de cette intégration.
    describe('BUG-379-02 — agrégation live après webhook', () => {
      const eventWithIntegration = { ...mockWebhookEvent, integrationId: 'integration-123' };
      const liveEvent = (overrides: Partial<{ id: string; tenantId: string; spaceId: string; integrationId: string | null }>) => ({
        id: 'df-event-1',
        tenantId: 'tenant-123',
        spaceId: 'space-1',
        integrationId: 'integration-123',
        windowStart: new Date(),
        windowEnd: new Date(),
        graceEnd: new Date(),
        ...overrides,
      });

      it('queues a coalesced minute aggregation for the live events of this integration', async () => {
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(eventWithIntegration);
        mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({});
        mockSyncService.syncSingleTransaction.mockResolvedValue({ created: true, updated: false });
        mockLiveWindow.findLiveEvents.mockResolvedValue([
          liveEvent({}),
          liveEvent({ id: 'other-club', integrationId: 'integration-999' }),
          liveEvent({ id: 'other-tenant', tenantId: 'tenant-999' }),
        ]);

        await handler.processEvent('event-123');

        expect(mockLiveTrigger.queueMinuteAggregation).toHaveBeenCalledTimes(1);
        expect(mockLiveTrigger.queueMinuteAggregation).toHaveBeenCalledWith(
          { tenantId: 'tenant-123', spaceId: 'space-1', integrationId: 'integration-123', eventIds: ['df-event-1'] },
          'webhook-live',
        );
        expect(mockWebhookHealth.markProcessed).toHaveBeenCalledWith('integration-123');
      });

      it('reads the transaction id at the root of the real WeezPay payload', async () => {
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
          ...eventWithIntegration,
          payload: { type: 'transaction', method: 'create', origin: 'gill', organization_id: 1, id: 555, values: { id: 555 } },
        });
        mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({});
        mockSyncService.syncSingleTransaction.mockResolvedValue({ created: true, updated: false });

        await handler.processEvent('event-123');

        expect(mockSyncService.syncSingleTransaction).toHaveBeenCalledWith('tenant-123', 'integration-123', '555');
      });

      it('does not queue aggregation when no event is live', async () => {
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(eventWithIntegration);
        mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({});
        mockSyncService.syncSingleTransaction.mockResolvedValue({ created: true, updated: false });

        await handler.processEvent('event-123');

        expect(mockLiveTrigger.queueMinuteAggregation).not.toHaveBeenCalled();
      });

      it('does not fail webhook processing when the aggregation trigger itself errors', async () => {
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(eventWithIntegration);
        mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({});
        mockSyncService.syncSingleTransaction.mockResolvedValue({ created: true, updated: false });
        mockLiveWindow.findLiveEvents.mockRejectedValue(new Error('DB timeout'));

        await expect(handler.processEvent('event-123')).resolves.not.toThrow();

        expect(mockPrismaService.integrationWebhookEvent.update).toHaveBeenCalledWith({
          where: { id: 'event-123' },
          data: expect.objectContaining({ processed: true }),
        });
      });
    });

    it('should handle unknown event type', async () => {
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        eventType: 'unknown',
      });
      mockPrismaService.integrationWebhookEvent.update.mockResolvedValue({});

      await handler.processEvent('event-123');

      // Should still mark as processed even for unknown types
      expect(mockPrismaService.integrationWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-123' },
        data: expect.objectContaining({
          processed: true,
        }),
      });
    });
  });
});
