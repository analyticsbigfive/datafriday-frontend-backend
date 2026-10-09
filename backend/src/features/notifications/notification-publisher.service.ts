import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';
import { notificationUserChannel } from '../../shared/live-channel.util';

/**
 * Signale aux sessions ouvertes qu'une notification vient d'être créée pour ces utilisateurs.
 * Remplace le poll toutes les 30 s de la cloche : le flux SSE global (LiveController) relaie le
 * signal et le client recharge sa liste. Best-effort : la notification est déjà écrite en base,
 * un signal perdu est rattrapé au prochain chargement de la liste.
 */
@Injectable()
export class NotificationPublisherService {
  private readonly logger = new Logger(NotificationPublisherService.name);

  constructor(private readonly redis: RedisService) {}

  async signal(tenantId: string, userIds: Iterable<string>): Promise<void> {
    const at = new Date().toISOString();
    await Promise.all(
      [...new Set(userIds)].filter(Boolean).map(async (userId) => {
        try {
          await this.redis.publish(notificationUserChannel(tenantId, userId), { at });
        } catch (e) {
          this.logger.warn(`Signal de notification non publié (${userId}) : ${(e as Error).message}`);
        }
      }),
    );
  }
}
