import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsController } from './integrations.controller';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventAuthService } from '../weezevent/services/weezevent-auth.service';
import { DigifoodIntegrationService } from './services/digifood-integration.service';
import { DigifoodCsvImportService } from '../digifood/services/digifood-csv-import.service';
import { WeezeventConfigDto } from './dto/weezevent-config.dto';
import { WebhookConfigDto } from './dto/webhook-config.dto';

describe('IntegrationsController', () => {
  let controller: IntegrationsController;
  let weezeventService: WeezeventIntegrationService;
  let webhookService: WebhookIntegrationService;

  const mockUser = { id: 'user-123', tenantId: 'org-123', email: 'test@example.com' };

  const mockWeezeventConfig = {
    clientId: 'client-123',
    organizationId: 'weez-org-456',
    enabled: true,
    configured: true,
  };

  const mockWebhookConfig = {
    enabled: true,
    configured: true,
  };

  const mockWeezeventIntegrationService = {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    getWebhookConfig: jest.fn(),
    updateWebhookConfig: jest.fn(),
  };

  const mockWebhookIntegrationService = {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
  };

  const mockDigifoodIntegrationService = {
    listInstances: jest.fn().mockResolvedValue([]),
    getInstance: jest.fn(),
    createInstance: jest.fn(),
    updateInstance: jest.fn(),
    deleteInstance: jest.fn(),
    testInstance: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        {
          provide: WeezeventIntegrationService,
          useValue: mockWeezeventIntegrationService,
        },
        {
          provide: WebhookIntegrationService,
          useValue: mockWebhookIntegrationService,
        },
        {
          provide: WeezeventAuthService,
          useValue: { testCredentials: jest.fn().mockResolvedValue({ valid: true }) },
        },
        {
          provide: DigifoodIntegrationService,
          useValue: mockDigifoodIntegrationService,
        },
        {
          provide: DigifoodCsvImportService,
          useValue: { importCsv: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
    weezeventService = module.get<WeezeventIntegrationService>(WeezeventIntegrationService);
    webhookService = module.get<WebhookIntegrationService>(WebhookIntegrationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listIntegrations', () => {
    it('should return all integrations', async () => {
      mockWeezeventIntegrationService.getConfig.mockResolvedValue(mockWeezeventConfig);
      mockWebhookIntegrationService.getConfig.mockResolvedValue(mockWebhookConfig);

      const result = await controller.listIntegrations('org-123', mockUser);

      expect(result).toEqual({
        weezevent: mockWeezeventConfig,
        digifood: [],
        webhooks: mockWebhookConfig,
      });
      expect(mockWeezeventIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
      expect(mockWebhookIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
    });
  });

  describe('updateWeezeventConfig', () => {
    it('should update Weezevent configuration', async () => {
      const dto: WeezeventConfigDto = {
        weezeventClientId: 'new-client-id',
        weezeventEnabled: true,
      };
      const updatedConfig = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        weezeventClientId: 'new-client-id',
        weezeventEnabled: true,
      };
      mockWeezeventIntegrationService.updateConfig.mockResolvedValue(updatedConfig);

      const result = await controller.updateWeezeventConfig('org-123', mockUser, dto);

      expect(result).toEqual(updatedConfig);
      expect(mockWeezeventIntegrationService.updateConfig).toHaveBeenCalledWith(
        'org-123',
        dto,
      );
    });
  });

  describe('getWeezeventConfig', () => {
    it('should return Weezevent configuration', async () => {
      mockWeezeventIntegrationService.getConfig.mockResolvedValue(mockWeezeventConfig);

      const result = await controller.getWeezeventConfig('org-123', mockUser);

      expect(result).toEqual(mockWeezeventConfig);
      expect(mockWeezeventIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
    });
  });

  describe('updateWebhookConfig', () => {
    it('should update webhook configuration', async () => {
      const dto: WebhookConfigDto = {
        weezeventWebhookEnabled: true,
        weezeventWebhookSecret: 'new-secret',
      };
      const updatedConfig = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        weezeventWebhookEnabled: true,
      };
      mockWebhookIntegrationService.updateConfig.mockResolvedValue(updatedConfig);

      const result = await controller.updateWebhookConfig('org-123', mockUser, dto);

      expect(result).toEqual(updatedConfig);
      expect(mockWebhookIntegrationService.updateConfig).toHaveBeenCalledWith(
        'org-123',
        dto,
      );
    });
  });

  describe('getWebhookConfig', () => {
    it('should return webhook configuration', async () => {
      mockWebhookIntegrationService.getConfig.mockResolvedValue(mockWebhookConfig);

      const result = await controller.getWebhookConfig('org-123', mockUser);

      expect(result).toEqual(mockWebhookConfig);
      expect(mockWebhookIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
    });
  });

  // BUG-106 : secret webhook par instance Weezevent (au lieu du seul écran tenant-level ci-dessus)
  describe('getWeezeventInstanceWebhook', () => {
    it('delegates to weezeventService.getWebhookConfig with the resolved tenantId', async () => {
      mockWeezeventIntegrationService.getWebhookConfig.mockResolvedValue({
        enabled: true,
        configured: true,
      });

      const result = await controller.getWeezeventInstanceWebhook('org-123', 'inst-1', mockUser);

      expect(result).toEqual({ enabled: true, configured: true });
      expect(mockWeezeventIntegrationService.getWebhookConfig).toHaveBeenCalledWith(
        'org-123',
        'inst-1',
      );
    });
  });

  describe('updateWeezeventInstanceWebhook', () => {
    it('delegates to weezeventService.updateWebhookConfig with the resolved tenantId', async () => {
      const dto = { webhookSecret: 'new-secret', webhookEnabled: true };
      mockWeezeventIntegrationService.updateWebhookConfig.mockResolvedValue({
        enabled: true,
        configured: true,
      });

      const result = await controller.updateWeezeventInstanceWebhook(
        'org-123',
        'inst-1',
        mockUser,
        dto,
      );

      expect(result).toEqual({ enabled: true, configured: true });
      expect(mockWeezeventIntegrationService.updateWebhookConfig).toHaveBeenCalledWith(
        'org-123',
        'inst-1',
        dto,
      );
    });
  });
});
