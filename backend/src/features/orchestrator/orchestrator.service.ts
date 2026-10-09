import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../core/redis/redis.service';
import { QueueService } from '../../core/queue/queue.service';

/**
 * HEOS - Hybrid Event-driven Orchestrated System
 * 
 * This service acts as the central orchestrator for the DataFriday platform,
 * implementing intelligent routing between:
 * - Synchronous processing (fast, simple queries)
 * - Queue-based async processing (heavy operations)
 * - Supabase Edge Functions (CPU-intensive tasks)
 * 
 * Decision criteria:
 * - Data volume < 1000 items: Synchronous
 * - Data volume 1000-50000 items: Queue-based
 * - Data volume > 50000 items or CPU-intensive: Edge Functions
 */

export interface ProcessingContext {
  tenantId: string;
  userId?: string;
  spaceId?: string;
  estimatedItems?: number;
  operation: 'sync' | 'analytics' | 'export' | 'report';
  priority?: 'high' | 'normal' | 'low';
}

export interface ProcessingDecision {
  strategy: 'sync' | 'queue' | 'edge';
  reason: string;
  estimatedDuration: number; // in ms
  cacheKey?: string;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  
  // Thresholds for routing decisions
  private readonly SYNC_THRESHOLD = 1000; // Items below this: sync
  private readonly QUEUE_THRESHOLD = 50000; // Items below this: queue, above: edge
  
  // Supabase Edge Function URL
  private readonly edgeFunctionUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1`;
  }

  /**
   * Decide the best processing strategy based on context
   */
  decideStrategy(context: ProcessingContext): ProcessingDecision {
    const { estimatedItems = 0, priority } = context;

    // High priority always goes sync if possible
    if (priority === 'high' && estimatedItems < this.SYNC_THRESHOLD) {
      return {
        strategy: 'sync',
        reason: 'High priority with small dataset',
        estimatedDuration: estimatedItems * 2, // ~2ms per item
      };
    }

    // Route based on data volume
    if (estimatedItems < this.SYNC_THRESHOLD) {
      return {
        strategy: 'sync',
        reason: `Small dataset (${estimatedItems} items)`,
        estimatedDuration: estimatedItems * 2,
        cacheKey: this.buildCacheKey(context),
      };
    }

    if (estimatedItems < this.QUEUE_THRESHOLD) {
      return {
        strategy: 'queue',
        reason: `Medium dataset (${estimatedItems} items) - using job queue`,
        estimatedDuration: estimatedItems * 0.5, // ~0.5ms per item with parallel processing
      };
    }

    // Large datasets or CPU-intensive operations go to Edge Functions
    return {
      strategy: 'edge',
      reason: `Large dataset (${estimatedItems} items) - offloading to Edge Function`,
      estimatedDuration: estimatedItems * 0.2, // ~0.2ms per item with edge computing
    };
  }

  /**
   * Invalidate cache for a tenant/space
   */
  async invalidateCache(tenantId: string, spaceId?: string): Promise<void> {
    const pattern = spaceId 
      ? `*:${tenantId}:${spaceId}*`
      : `*:${tenantId}:*`;
    
    await this.redisService.deletePattern(pattern);
    this.logger.log(`[HEOS] Cache invalidated for pattern: ${pattern}`);
  }

  // ==================== PRIVATE METHODS ====================

  private buildCacheKey(context: ProcessingContext): string {
    const parts = [context.operation, context.tenantId];
    if (context.spaceId) parts.push(context.spaceId);
    return parts.join(':');
  }

  /**
   * Health check for all processing backends
   */
  async healthCheck(): Promise<{
    redis: boolean;
    queues: Record<string, any>;
    edgeFunction: boolean;
  }> {
    const [redisOk, queueStats] = await Promise.all([
      this.redisService.ping(),
      this.queueService.getAllQueueStats(),
    ]);

    // Check edge function
    let edgeOk = false;
    try {
      const response = await fetch(`${this.edgeFunctionUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.configService.get('SUPABASE_ANON_KEY')}`,
        },
      });
      edgeOk = response.ok;
    } catch {
      edgeOk = false;
    }

    return {
      redis: redisOk,
      queues: queueStats,
      edgeFunction: edgeOk,
    };
  }
}
