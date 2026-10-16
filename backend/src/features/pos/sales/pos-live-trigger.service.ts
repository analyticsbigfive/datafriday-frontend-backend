import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { QueueService } from '../../../core/queue/queue.service';
import { RedisService } from '../../../core/redis/redis.service';
import { LIVE_PENDING_TTL_SEC, livePendingKey } from '../../../shared/constants/live-aggregation';

export interface PosLiveTarget {
  tenantId: string;
  spaceId: string;
  /** Intégration POS de l'espace (jamais celle d'une autre source : BUG-365, jobs mono-intégration). */
  integrationId: string;
  eventId: string;
  eventDate: Date;
}

/**
 * Déclenchement du Live après une vente, une annulation ou un rétablissement (interface 5 du PLAN §5 bis).
 * Même mécanique que `LiveAggregationTriggerService.queueMinuteAggregation` : au plus UN job
 * `process-event-minutes` en attente par (espace, intégration), les ventes arrivées entre-temps sont
 * couvertes par ce job. Copié ici (QueueService + Redis directement) plutôt qu'importé : le module
 * Weezevent tirerait un cycle de modules, même raison que `WebhookEventHandler`.
 * Best-effort : ne fait JAMAIS échouer la vente (déjà committée), le cron de réconciliation rattrape.
 */
@Injectable()
export class PosLiveTriggerService {
  private readonly logger = new Logger(PosLiveTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly redis: RedisService,
  ) {}

  /** Retourne true si un job a été mis en file, false s'il en attendait déjà un (ou en cas d'échec avalé). */
  async trigger(target: PosLiveTarget, reason: 'pos-sale' | 'pos-cancel' | 'pos-restore'): Promise<boolean> {
    const pendingKey = livePendingKey(target.spaceId, target.integrationId);
    try {
      if (await this.redis.has(pendingKey)) return false;
      await this.redis.set(pendingKey, new Date().toISOString(), { ttl: LIVE_PENDING_TTL_SEC });
    } catch (err) {
      this.logger.warn(`[${reason}] verrou de coalescence indisponible : ${(err as Error).message}`);
      return false;
    }

    try {
      const jobLog = await this.prisma.aggregationJobLog.create({
        data: {
          tenantId: target.tenantId,
          spaceId: target.spaceId,
          jobType: 'incremental',
          status: 'pending',
          fromDate: target.eventDate,
          toDate: target.eventDate,
          metadata: { eventIds: [target.eventId], integrationId: target.integrationId, trigger: reason },
        },
      });
      await this.queueService.queueAggregationJob({
        type: 'process-event-minutes',
        tenantId: target.tenantId,
        spaceId: target.spaceId,
        jobLogId: jobLog.id,
        eventIds: [target.eventId],
        integrationId: target.integrationId,
      });
      return true;
    } catch (err) {
      await this.redis.delete(pendingKey).catch(() => undefined);
      this.logger.warn(`[${reason}] agrégation live non déclenchée : ${(err as Error).message}`);
      return false;
    }
  }
}
