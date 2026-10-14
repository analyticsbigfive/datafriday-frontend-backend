import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { RedisService } from '../../../core/redis/redis.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { EventWeatherFillService } from './event-weather-fill.service';

/** Events traités par passage de nuit (le rattrapage de l'historique passe par le script). */
export const NIGHTLY_WEATHER_BATCH = 100;
const LOCK_KEY = 'event-weather:nightly';
/** Le verrou expire seul si l'instance qui le tient plante en cours de passage. */
const LOCK_TTL_SEC = 30 * 60;

/**
 * Job de nuit de la météo des events (filtres Analyse « Météo / Température à l'heure du show »).
 * Chaque nuit à 4h (heure de Paris), remplit les events passés sans météo, par lot borné ; la
 * règle de sélection et de nouvelle tentative est documentée dans EventWeatherFillService.
 * Un verrou Redis évite la double exécution quand plusieurs instances tournent.
 */
@Injectable()
export class EventWeatherCronService {
  private readonly logger = new Logger(EventWeatherCronService.name);
  private running = false;

  constructor(
    private readonly fill: EventWeatherFillService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron('0 4 * * *', { name: 'event-weather-nightly', timeZone: 'Europe/Paris' })
  async nightly(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const lockValue = randomUUID();
    let locked = false;
    try {
      try {
        locked = await this.redis.acquireLock(LOCK_KEY, lockValue, LOCK_TTL_SEC);
      } catch (error) {
        // Redis indisponible : le travail est idempotent, on continue plutôt que de sauter la nuit.
        this.logger.warn(`Verrou Redis indisponible, passage sans verrou : ${(error as Error)?.message}`);
        locked = true;
      }
      if (!locked) return;
      // Events de tous les tenants : transverse par construction.
      const result = await this.tenantContext.runWithoutTenantScope(() => this.fill.fillBatch(NIGHTLY_WEATHER_BATCH));
      this.logger.log(
        `Météo des events : ${result.filled} remplis, ${result.missing} introuvables, ${result.failed} en échec (${result.scanned} examinés)`,
      );
    } catch (error) {
      this.logger.warn(`Météo des events en échec : ${(error as Error)?.message}`);
    } finally {
      if (locked) await this.redis.releaseLock(LOCK_KEY, lockValue).catch(() => undefined);
      this.running = false;
    }
  }
}
