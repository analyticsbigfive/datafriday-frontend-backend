import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { PrismaService } from '../../core/database/prisma.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';
import { EncryptionService } from '../../core/encryption/encryption.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let prisma: PrismaService;
  let signatureService: WebhookSignatureService;
  let eventHandler: WebhookEventHandler;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Organization',
    weezeventWebhookEnabled: true,
    weezeventWebhookSecret: 'secret-123',
  };

  const mockPayload = {
    type: 'transaction',
    method: 'create',
    data: {
      id: 'tx-123',
      amount: 100,
    },
  };

  const mockWebhookEvent = {
    id: 'event-123',
    tenantId: 'tenant-123',
    eventType: 'transaction',
    method: 'create',
    payload: mockPayload,
    signature: 'valid-signature',
    processed: false,
  };

  const mockIntegration = {
    id: 'integration-123',
    tenantId: 'tenant-123',
  };

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
    },
    integration: {
      findUnique: jest.fn(),
    },
    integrationWebhookEvent: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockSignatureService = {
    validateSignature: jest.fn(),
  };

  const mockEventHandler = {
    processEvent: jest.fn(),
  };

  const mockEncryptionService = {
    decrypt: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WebhookSignatureService,
          useValue: mockSignatureService,
        },
        {
          provide: WebhookEventHandler,
          useValue: mockEventHandler,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    prisma = module.get<PrismaService>(PrismaService);
    signatureService = module.get<WebhookSignatureService>(WebhookSignatureService);
    eventHandler = module.get<WebhookEventHandler>(WebhookEventHandler);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('receiveWebhook', () => {
    it('should receive and store webhook event', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(true);
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.integrationWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

      const result = await controller.receiveWebhook(
        'tenant-123',
        'integration-123',
        'valid-signature',
        mockPayload as any,
      );

      expect(result).toEqual({
        received: true,
        eventId: 'event-123',
      });
      expect(mockPrismaService.integrationWebhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalDeliveryId: 'valid-signature' }),
        }),
      );
    });

    // BUG-026 (corrigé) : un retry Weezevent renvoie le même payload → même signature HMAC
    // (déterministe) → doit être détecté comme déjà traité, pas dupliqué en audit ni retraité.
    it('should dedupe a retried webhook via signature (BUG-026)', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(true);
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
        id: 'event-123',
        processed: true,
      });

      const result = await controller.receiveWebhook(
        'tenant-123',
        'integration-123',
        'valid-signature',
        mockPayload as any,
      );

      expect(result).toEqual({ received: true, eventId: 'event-123' });
      expect(mockPrismaService.integrationWebhookEvent.create).not.toHaveBeenCalled();
      expect(mockEventHandler.processEvent).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when tenant not found', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        controller.receiveWebhook('non-existent', 'integration-123', 'signature', mockPayload as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when webhooks disabled', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        weezeventWebhookEnabled: false,
      });

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', 'signature', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature missing', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', '', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature invalid', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(false);

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', 'invalid-signature', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    // Sécurité (P0-2) : fail-closed — un tenant sans secret configuré ne peut PAS
    // recevoir de webhook (sinon endpoint anonyme spoofable, vu qu'il est @Public).
    it('should REJECT webhook when secret not configured (fail-closed)', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        weezeventWebhookSecret: null,
      });

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', '', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSignatureService.validateSignature).not.toHaveBeenCalled();
      expect(mockPrismaService.integrationWebhookEvent.create).not.toHaveBeenCalled();
    });

    // BUG-106 : secret webhook par intégration (WeezeventIntegrationConfig.webhookSecret),
    // prioritaire sur le secret tenant-global s'il est explicitement configuré.
    describe('BUG-106: per-integration webhook secret', () => {
      const mockIntegrationWithWebhook = {
        ...mockIntegration,
        weezevent: { webhookEnabled: true, webhookSecret: 'encrypted-secret' },
      };

      it('uses the per-integration secret (decrypted) when configured, ignoring the tenant secret', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegrationWithWebhook);
        mockPrismaService.tenant.findUnique.mockResolvedValue({
          ...mockTenant,
          weezeventWebhookEnabled: false, // le tenant serait bloquant si utilisé par erreur
          weezeventWebhookSecret: 'tenant-secret',
        });
        mockEncryptionService.decrypt.mockReturnValue('per-integration-secret');
        mockSignatureService.validateSignature.mockReturnValue(true);
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);
        mockPrismaService.integrationWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

        const result = await controller.receiveWebhook(
          'tenant-123',
          'integration-123',
          'valid-signature',
          mockPayload as any,
        );

        expect(result).toEqual({ received: true, eventId: 'event-123' });
        expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('encrypted-secret');
        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(
          mockPayload,
          'valid-signature',
          'per-integration-secret',
        );
      });

      it('falls back to the tenant secret when no per-integration secret is configured (back-compat)', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue({
          ...mockIntegration,
          weezevent: { webhookEnabled: null, webhookSecret: null },
        });
        mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
        mockSignatureService.validateSignature.mockReturnValue(true);
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);
        mockPrismaService.integrationWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

        const result = await controller.receiveWebhook(
          'tenant-123',
          'integration-123',
          'valid-signature',
          mockPayload as any,
        );

        expect(result).toEqual({ received: true, eventId: 'event-123' });
        expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(
          mockPayload,
          'valid-signature',
          mockTenant.weezeventWebhookSecret,
        );
      });

      it('rejects with an invalid signature validated against the per-integration secret', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegrationWithWebhook);
        mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
        mockEncryptionService.decrypt.mockReturnValue('per-integration-secret');
        mockSignatureService.validateSignature.mockReturnValue(false);

        await expect(
          controller.receiveWebhook('tenant-123', 'integration-123', 'bad-signature', mockPayload as any),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('does NOT treat webhookEnabled=false as configured even if a stale secret is present', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue({
          ...mockIntegration,
          weezevent: { webhookEnabled: false, webhookSecret: 'encrypted-secret' },
        });
        mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
        mockSignatureService.validateSignature.mockReturnValue(true);
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);
        mockPrismaService.integrationWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

        await controller.receiveWebhook(
          'tenant-123',
          'integration-123',
          'valid-signature',
          mockPayload as any,
        );

        expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(
          mockPayload,
          'valid-signature',
          mockTenant.weezeventWebhookSecret,
        );
      });
    });
  });
});
