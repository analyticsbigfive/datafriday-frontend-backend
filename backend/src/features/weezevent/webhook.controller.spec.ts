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

  // Signature réelle : headers + body + requête avec rawBody (BUG-379-02).
  const rawOf = (payload: unknown) => Buffer.from(JSON.stringify(payload));
  const call = (tenantId: string, integrationId: string, signature: string, payload: unknown) =>
    controller.receiveWebhook(
      tenantId,
      integrationId,
      signature ? { 'x-weezevent-signature': signature } : {},
      payload,
      { rawBody: rawOf(payload) } as any,
    );
  const deliveryIdOf = (payload: unknown) =>
    require('crypto').createHash('sha256').update(rawOf(payload)).digest('hex');

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

      const result = await call('tenant-123', 'integration-123', 'valid-signature', mockPayload);

      expect(result).toEqual({
        received: true,
        eventId: 'event-123',
      });
      expect(mockPrismaService.integrationWebhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalDeliveryId: deliveryIdOf(mockPayload) }),
        }),
      );
    });

    // BUG-026 / BUG-379-02 : un rejeu Weezevent renvoie le même corps → même hash → déjà traité.
    it('should dedupe a retried webhook via raw body hash (BUG-026)', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(true);
      mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue({
        id: 'event-123',
        processed: true,
      });

      const result = await call('tenant-123', 'integration-123', 'valid-signature', mockPayload);

      expect(result).toEqual({ received: true, eventId: 'event-123' });
      expect(mockPrismaService.integrationWebhookEvent.create).not.toHaveBeenCalled();
      expect(mockEventHandler.processEvent).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when tenant not found', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        call('non-existent', 'integration-123', 'signature', mockPayload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when webhooks disabled', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        weezeventWebhookEnabled: false,
      });

      await expect(
        call('tenant-123', 'integration-123', 'signature', mockPayload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature missing', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      await expect(
        call('tenant-123', 'integration-123', '', mockPayload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature invalid', async () => {
      mockPrismaService.integration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(false);

      await expect(
        call('tenant-123', 'integration-123', 'invalid-signature', mockPayload),
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
        call('tenant-123', 'integration-123', '', mockPayload),
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

        const result = await call('tenant-123', 'integration-123', 'valid-signature', mockPayload);

        expect(result).toEqual({ received: true, eventId: 'event-123' });
        expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('encrypted-secret');
        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(
          rawOf(mockPayload),
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

        const result = await call('tenant-123', 'integration-123', 'valid-signature', mockPayload);

        expect(result).toEqual({ received: true, eventId: 'event-123' });
        expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(
          rawOf(mockPayload),
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
          call('tenant-123', 'integration-123', 'bad-signature', mockPayload),
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

        await call('tenant-123', 'integration-123', 'valid-signature', mockPayload);

        expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(
          rawOf(mockPayload),
          'valid-signature',
          mockTenant.weezeventWebhookSecret,
        );
      });
    });

    // BUG-379-02 : format réel WeezPay `{ type, method, origin, organization_id, id, values }`,
    // avec des champs non documentés possibles (jamais rejetés).
    describe('BUG-379-02: real WeezPay payload format', () => {
      const weezPayPayload = {
        type: 'transaction',
        method: 'create',
        origin: 'gill',
        organization_id: 4242,
        id: 987654,
        values: { id: 987654, amount: 1250 },
        some_future_field: 'ignored',
      };
      const integrationWithOrg = {
        ...mockIntegration,
        weezevent: { webhookEnabled: null, webhookSecret: null, organizationId: '4242' },
      };

      it('accepts the documented WeezPay shape and stores the raw payload', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue(integrationWithOrg);
        mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
        mockSignatureService.validateSignature.mockReturnValue(true);
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);
        mockPrismaService.integrationWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

        const result = await call('tenant-123', 'integration-123', 'valid-signature', weezPayPayload);

        expect(result).toEqual({ received: true, eventId: 'event-123' });
        expect(mockPrismaService.integrationWebhookEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ eventType: 'transaction', method: 'create', payload: weezPayPayload }),
          }),
        );
      });

      it('rejects a webhook whose organization_id does not match the integration', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue({
          ...integrationWithOrg,
          weezevent: { ...integrationWithOrg.weezevent, organizationId: '1111' },
        });
        mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
        mockSignatureService.validateSignature.mockReturnValue(true);

        await expect(call('tenant-123', 'integration-123', 'valid-signature', weezPayPayload)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockPrismaService.integrationWebhookEvent.create).not.toHaveBeenCalled();
      });

      it('rejects an unsupported type with a 400 before touching the database', async () => {
        await expect(call('tenant-123', 'integration-123', 'sig', { type: 'nope', method: 'create', id: 1 })).rejects.toThrow(
          BadRequestException,
        );
        expect(mockPrismaService.integration.findUnique).not.toHaveBeenCalled();
      });

      it('reads the signature from an alternative header name', async () => {
        mockPrismaService.integration.findUnique.mockResolvedValue(integrationWithOrg);
        mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
        mockSignatureService.validateSignature.mockReturnValue(true);
        mockPrismaService.integrationWebhookEvent.findUnique.mockResolvedValue(null);
        mockPrismaService.integrationWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

        await controller.receiveWebhook(
          'tenant-123',
          'integration-123',
          { 'x-hub-signature-256': 'sha256=abc' },
          weezPayPayload,
          { rawBody: rawOf(weezPayPayload) } as any,
        );

        expect(mockSignatureService.validateSignature).toHaveBeenCalledWith(rawOf(weezPayPayload), 'sha256=abc', mockTenant.weezeventWebhookSecret);
      });
    });
  });
});
