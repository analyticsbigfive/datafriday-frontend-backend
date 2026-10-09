import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService, ProcessingContext } from './orchestrator.service';
import { RedisService } from '../../core/redis/redis.service';
import { QueueService } from '../../core/queue/queue.service';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      deletePattern: jest.fn(),
      ping: jest.fn(),
    };

    const mockQueueService = {
      getAllQueueStats: jest.fn().mockResolvedValue({
        'data-sync': { waiting: 0, active: 0, completed: 10, failed: 0 },
        'analytics': { waiting: 1, active: 0, completed: 5, failed: 0 },
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-key',
          SUPABASE_ANON_KEY: 'test-anon-key',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('decideStrategy', () => {
    it('should return sync for small datasets', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('sync');
      expect(decision.reason).toContain('Small dataset');
    });

    it('should return queue for medium datasets', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 10000,
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('queue');
      expect(decision.reason).toContain('Medium dataset');
    });

    it('should return edge for large datasets', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 100000,
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('edge');
      expect(decision.reason).toContain('Large dataset');
    });

    it('should prioritize sync for high priority with small data', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'analytics',
        estimatedItems: 800,
        priority: 'high',
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('sync');
      expect(decision.reason).toContain('High priority');
    });

    it('should estimate duration based on items', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
      };

      const decision = service.decideStrategy(context);

      expect(decision.estimatedDuration).toBe(1000); // 500 * 2ms
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate all cache for a tenant', async () => {
      redisService.deletePattern.mockResolvedValue(5);

      await service.invalidateCache('tenant-123');

      expect(redisService.deletePattern).toHaveBeenCalledWith('*:tenant-123:*');
    });

    it('should invalidate cache for specific space', async () => {
      redisService.deletePattern.mockResolvedValue(2);

      await service.invalidateCache('tenant-123', 'space-456');

      expect(redisService.deletePattern).toHaveBeenCalledWith('*:tenant-123:space-456*');
    });
  });

  describe('healthCheck', () => {
    it('should return health status of all services', async () => {
      redisService.ping.mockResolvedValue(true);

      // Mock fetch for edge function health check
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
      });

      const health = await service.healthCheck();

      expect(health.redis).toBe(true);
      expect(health.queues).toBeDefined();
    });

    it('should handle Redis being down', async () => {
      redisService.ping.mockResolvedValue(false);

      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const health = await service.healthCheck();

      expect(health.redis).toBe(false);
    });
  });
});
