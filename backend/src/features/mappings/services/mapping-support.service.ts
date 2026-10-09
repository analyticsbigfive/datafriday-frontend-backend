import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';
import { unmappedCachePattern } from '../../../shared/constants/event-batch-cache';

/**
 * Outils communs aux rattachements : purge du cache des ventes non rattachées, clés legacy dans les réponses.
 */
@Injectable()
export class MappingSupportService {
  constructor(
    private redis: RedisService,
  ) {}

  private readonly logger = new Logger(MappingSupportService.name);

  /** BUG-144-01 : un mapping écrit/supprimé change le volume « non mappé » de l'Analyse —
   *  purge du cache par event (spaces:unmapped:{tenantId}:*). Fire-and-forget : une purge
   *  qui échoue ne doit pas faire échouer l'écriture du mapping (TTL court en filet). */
  purgeUnmappedCache(tenantId: string) {
    Promise.resolve(this.redis.deletePattern(unmappedCachePattern(tenantId))).catch((e) =>
      this.logger.warn(`purgeUnmappedCache failed: ${e?.message}`),
    );
  }

  // Compat contrat front : les modèles Prisma renommés portent salesLocationId /
  // salesProductId ; l'API continue de servir les clés historiques weezevent*
  // (les deux clés sont présentes dans les réponses).
  withLegacyLocationKey<T extends { salesLocationId: string }>(m: T) {
    return { ...m, weezeventLocationId: m.salesLocationId };
  }

  withLegacyProductKeys<T extends { salesProductId: string }>(m: T) {
    const legacy: Record<string, unknown> = { ...m, weezeventProductId: m.salesProductId };
    if ('salesProduct' in m) legacy.weezeventProduct = (m as Record<string, unknown>).salesProduct;
    return legacy as T & { weezeventProductId: string; weezeventProduct?: unknown };
  }
}
