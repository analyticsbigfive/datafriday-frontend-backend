import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.constants';
import { AggregationJobEnqueueData } from '../../core/queue/queue.service';
import { AggregationService } from './aggregation.service';
import { RedisService } from '../../core/redis/redis.service';
import { liveSpaceChannel } from '../../shared/live-channel.util';

/**
 * Worker BullMQ pour les jobs d'agrégation Weezevent.
 * Traite les jobs enqueue par AggregationService.processEvents() et .synchronize().
 *
 * lockDuration: 10 min — permet de traiter ~220 events sans perdre le verrou.
 * concurrency: 1 par defaut — les jobs d'un même space sont séquentiels.
 */
@Processor(QUEUES.AGGREGATION, { lockDuration: 600_000 })
export class AggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(AggregationProcessor.name);

  constructor(
    private readonly aggregationService: AggregationService,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<AggregationJobEnqueueData>): Promise<any> {
    this.logger.log(
      `Processing aggregation-${job.data.type} for space ${job.data.spaceId} (LogId: ${job.data.jobLogId})`,
    );

    switch (job.data.type) {
      case 'process-events':
        return this.aggregationService.executeProcessEvents(job);
      case 'synchronize':
        return this.aggregationService.executeSynchronize(job);
      default:
        throw new Error(`Unknown aggregation job type: ${(job.data as any).type}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AggregationJobEnqueueData>, error: Error) {
    this.logger.error(
      `Aggregation job ${job.id} failed (LogId: ${job.data.jobLogId}): ${error.message}`,
    );
    try {
      await this.aggregationService.markJobLogFailed(job.data.jobLogId, error.message);
    } catch (e) {
      this.logger.error(`Could not update job log status: ${e.message}`);
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<AggregationJobEnqueueData>) {
    this.logger.log(
      `Aggregation job ${job.id} completed for space ${job.data.spaceId}`,
    );
    // Chantier 379 : signal SSE pour l'écran Live v2 — un seul point de publication pour
    // les 3 déclencheurs existants (webhook, simulateSale, cron de secours), qui
    // convergent tous ici via queueAggregationJob({type:'process-events'}). 'synchronize'
    // (resync manuel du wizard d'intégration) volontairement exclu : ne concerne pas un
    // event live en cours, publier dessus réveillerait des abonnés SSE pour rien.
    if (job.data.type === 'process-events') {
      try {
        await this.redisService.publish(liveSpaceChannel(job.data.spaceId), {
          spaceId: job.data.spaceId,
          at: new Date().toISOString(),
        });
      } catch (e) {
        this.logger.warn(`Live SSE publish failed for space ${job.data.spaceId}: ${(e as Error).message}`);
      }
    }
  }
}
