import { RedisService } from '../../core/redis/redis.service';

/**
 * Clés et invalidation du cache des listes d'un tenant pour un espace de noms donné
 * (`<namespace>:<tenantId>:<suffixe>`).
 *
 * `deletePattern` préfixe déjà par `datafriday:` (RedisService.buildKey) : ne jamais passer une
 * clé déjà préfixée, sinon le motif `datafriday:datafriday:...` ne correspond à rien et
 * l'invalidation devient un no-op silencieux (bug constaté le 2026-08-14).
 */
export class TenantListCache {
  constructor(
    private readonly redis: RedisService,
    private readonly namespace: string,
  ) {}

  key(tenantId: string, suffix = 'list'): string {
    return `${this.namespace}:${tenantId}:${suffix}`;
  }

  async invalidate(tenantId: string): Promise<void> {
    await this.redis.deletePattern(`${this.namespace}:${tenantId}:*`);
  }
}
