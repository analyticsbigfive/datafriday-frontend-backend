import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { QUEUES } from './queue.constants';

// Job types for type safety
export type WeezeventSyncType =
  | 'transactions'
  | 'events'
  | 'products'
  | 'orders'
  | 'prices'
  | 'attendees';

export interface DataSyncJobData {
  /** Synchro Weezevent d'un seul type de données (seul type de job produit). */
  type: 'weezevent-partial';
  tenantId: string;
  userId?: string;
  integrationId: string;
  syncType: WeezeventSyncType;
  options?: {
    fullSync?: boolean;
    startDate?: string;
    endDate?: string;
    /** Required for orders/attendees */
    eventId?: string;
  };
}

export interface AggregationJobEnqueueData {
  /**
   * 'process-events' = agréger une sélection d'events ; 'synchronize' = full rebuild ;
   * 'process-event-minutes' = live, uniquement les minutes touchées depuis le dernier passage (BUG-379-02)
   */
  type: 'process-events' | 'synchronize' | 'process-event-minutes';
  tenantId: string;
  spaceId: string;
  /** ID de l'AggregationJobLog pré-créé en DB (utilisé par getJobProgress) */
  jobLogId: string;
  eventIds?: string[];
  integrationId?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUES.DATA_SYNC) private dataSyncQueue: Queue<DataSyncJobData>,
    @InjectQueue(QUEUES.AGGREGATION) private aggregationQueue: Queue<AggregationJobEnqueueData>,
    // Pour les stats génériques (getQueueStats/getAllQueueStats).
    @InjectQueue(QUEUES.SIMULATION) private simulationQueue: Queue,
  ) {}

  // ==================== DATA SYNC JOBS ====================

  /**
   * Queue a granular Weezevent sync (single data type, e.g. transactions only)
   * Jobs survive server restarts, retry automatically on failure (3×, exponential backoff).
   */
  async queueWeezeventSyncType(
    tenantId: string,
    syncType: WeezeventSyncType,
    integrationId: string,
    options?: DataSyncJobData['options'],
  ): Promise<Job<DataSyncJobData>> {
    // Priority: events first (FK dependency), then transactions, then rest
    const priorityMap: Record<WeezeventSyncType, number> = {
      events: 1,
      transactions: 2,
      products: 3,
      orders: 4,
      prices: 5,
      attendees: 5,
    };

    const job = await this.dataSyncQueue.add(
      `weezevent-${syncType}`,
      {
        type: 'weezevent-partial',
        tenantId,
        syncType,
        options,
        integrationId,
      },
      {
        priority: options?.fullSync
          ? priorityMap[syncType] + 10  // full syncs are low priority
          : priorityMap[syncType],
        // 60-second dedup window: prevents double-queuing from rapid re-clicks,
        // but allows re-running after a minute (unlike static jobId which blocks forever once in completed set).
        // L'intégration et l'event font partie de la clé : deux events distincts dans la même
        // minute ne doivent pas être fusionnés en un seul job.
        jobId: [tenantId, integrationId, syncType, options?.eventId ?? 'all', Math.floor(Date.now() / 60000)].join('-'),
        delay: 0,
      },
    );

    this.logger.log(
      `Queued weezevent-${syncType} for tenant ${tenantId} (Job: ${job.id}, full=${options?.fullSync ?? false})`,
    );
    return job;
  }

  // ==================== AGGREGATION JOBS ====================

  /**
   * Enqueue un job d'agrégation (process-events ou synchronize).
   * Le jobLogId doit être pré-créé en DB pour que getJobProgress puisse suivre l'avancement.
   * `attempts`/`backoff` hérités du défaut global (3 tentatives, backoff exponentiel) —
   * l'opération est idempotente (delete-then-insert par event dans executeProcessEvents), donc
   * un retry après un échec transitoire (timeout DB) est sûr et souhaitable (BUG-019).
   */
  async queueAggregationJob(data: AggregationJobEnqueueData): Promise<Job<AggregationJobEnqueueData>> {
    const job = await this.aggregationQueue.add(
      `aggregation-${data.type}`,
      data,
      {
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Queued aggregation-${data.type} for space ${data.spaceId} (BullJob: ${job.id}, LogId: ${data.jobLogId})`,
    );
    return job;
  }

  // ==================== JOB MANAGEMENT ====================

  private queueByName(queueName: string): Queue | undefined {
    const queues: Record<string, Queue> = {
      [QUEUES.DATA_SYNC]: this.dataSyncQueue,
      [QUEUES.AGGREGATION]: this.aggregationQueue,
      [QUEUES.SIMULATION]: this.simulationQueue,
    };
    return queues[queueName];
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const queue = this.queueByName(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Get progress of active jobs on a queue, keyed by syncType.
   * Returns e.g. { transactions: 45, events: 10, products: 0 }
   */
  async getActiveJobsProgress(queueName: string): Promise<Record<string, number>> {
    const queue = this.queueByName(queueName);
    if (!queue) return {};

    const activeJobs = await queue.getActive();
    const result: Record<string, number> = {};
    for (const job of activeJobs) {
      if (job.data?.syncType) {
        result[job.data.syncType] = typeof job.progress === 'number' ? job.progress : 0;
      }
    }
    return result;
  }

  /**
   * Get all queue stats
   */
  async getAllQueueStats(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const queueName of Object.values(QUEUES)) {
      results[queueName] = await this.getQueueStats(queueName);
    }

    return results;
  }
}
