import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';
import { eventBatchCachePatterns } from '../../../shared/constants/event-batch-cache';

/**
 * Clés, durées et invalidation du cache Redis des espaces (liste, détail, PdV, timeline...).
 */
@Injectable()
export class SpaceCacheService {
  constructor(
    private readonly redis: RedisService,
  ) {}

  readonly SPACES_CACHE_TTL = 60; // 60 seconds
  readonly SPACE_DETAIL_CACHE_TTL = 120; // 2 minutes for individual space
  readonly SPACE_SHOPS_CACHE_TTL = 30; // 30 seconds — lecture chaude pour SpaceMenuView
  readonly SPACE_CONFIGS_CACHE_TTL = 30;
  readonly SPACES_LIST_CACHE_KEY = (tenantId: string) =>
    `spaces:list:${tenantId}`;
  readonly SPACES_LIGHT_CACHE_KEY = (tenantId: string) =>
    `spaces:light:${tenantId}`;
  readonly SPACE_DETAIL_CACHE_KEY = (spaceId: string) =>
    `spaces:detail:${spaceId}`;
  // Clé composite tenantId+spaceId : une entrée en cache ne peut être lue que par le
  // tenant qui l'a écrite, ce qui préserve l'isolation multi-tenant même en cas de hit
  // (pas besoin de revérifier l'ownership DB sur un hit — cf. incident cross-tenant
  // déjà documenté sur /tenants, on ne veut pas répéter ce pattern de fuite).
  readonly SPACE_SHOPS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:shops:${tenantId}:${spaceId}`;
  readonly SPACE_CONFIGS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:configs:${tenantId}:${spaceId}`;
  // RPC get_space_shop_details ≈ 300ms à elle seule (cf. commentaire getShopDetails) et
  // sur le chemin critique du premier rendu /analyse (phase 1 de useSpaceData) — cachée
  // 60s. Données alimentées par sync/agrégation (pas d'écriture utilisateur directe),
  // invalidées avec les autres clés spaces:* dans invalidateSpaceCache.
  readonly SPACE_SHOPDETAILS_CACHE_TTL = 60;
  readonly SPACE_SHOPDETAILS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:shopdetails:${tenantId}:${spaceId}`;
  // BUG-143-01 : les endpoints batch de l'Analyse (event-timeline, transaction-baskets)
  // relisaient la pré-agrégat + le JOIN d'affichage à CHAQUE chargement de page — 7 à 27 s
  // par paquet de 15 events sur Stade Jean Bouin (275k lignes d'agrégat) — alors que
  // l'historique d'un event PASSÉ est immuable. Cache par (tenant, space, event) : TTL long
  // quand la fenêtre de ventes de l'event est terminée, court sinon (event du jour : le
  // module Live re-poll toutes les 15 s et doit voir les ventes fraîches).
  // analyse-unmapped N'EST PAS caché (BUG-137-01 : un re-mapping doit se voir au prochain
  // chargement). Invalidation : invalidateSpaceCache + fin de re-agrégation (voir
  // EVENT_BATCH_CACHE_PREFIXES, purgé aussi par AggregationService.executeProcessEvents).
  readonly EVENT_TIMELINE_CACHE_KEY = (tenantId: string, spaceId: string, eventId: string) =>
    `spaces:evtimeline:${tenantId}:${spaceId}:${eventId}`;
  readonly EVENT_BASKETS_CACHE_KEY = (tenantId: string, spaceId: string, eventId: string) =>
    `spaces:baskets:${tenantId}:${spaceId}:${eventId}`;
  readonly EVENT_BATCH_CACHE_TTL_PAST = 6 * 3600; // 6 h — event terminé, données immuables
  readonly EVENT_BATCH_CACHE_TTL_LIVE = 60; // event du jour/futur ou sans fenêtre résolue
  // BUG-144-01 : volume non mappé, caché comme les deux autres depuis le 25/08 — REMPLACE
  // la décision BUG-137-01 (« jamais caché ») : l'invalidation à l'écriture de mapping
  // (MappingsService) garantit qu'un re-mapping se voit au chargement suivant, sans payer
  // le re-scan brut des 786k lignes à CHAQUE visite.
  readonly EVENT_UNMAPPED_CACHE_KEY = (tenantId: string, spaceId: string, eventId: string) =>
    `spaces:unmapped:${tenantId}:${spaceId}:${eventId}`;
  // BUG-144-01 : entrées STABLES de resolveEventSalesScope (events de l'espace, intégrations,
  // timezone) — recalculées à chaque appel batch alors qu'elles ne varient pas par event.
  readonly SPACE_SALESSCOPE_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:salesscope:${tenantId}:${spaceId}`;
  readonly SPACE_SALESSCOPE_CACHE_TTL = 60;

  /** Invalidate all space list caches for a tenant (public : réutilisé par BuilderV2Service) */
  async invalidateSpaceCache(tenantId: string, spaceId?: string) {
    const keys = [
      this.redis.delete(this.SPACES_LIST_CACHE_KEY(tenantId)),
      this.redis.delete(this.SPACES_LIGHT_CACHE_KEY(tenantId)),
    ];
    if (spaceId) {
      keys.push(this.redis.delete(this.SPACE_DETAIL_CACHE_KEY(spaceId)));
      // deletePattern car getSpaceShops écrit aussi des clés suffixées ":${configId}"
      // (scoping par configuration) en plus de la clé "toutes configs".
      keys.push(this.redis.deletePattern(`${this.SPACE_SHOPS_CACHE_KEY(tenantId, spaceId)}*`) as unknown as Promise<void>);
      keys.push(this.redis.delete(this.SPACE_CONFIGS_CACHE_KEY(tenantId, spaceId)));
      keys.push(this.redis.delete(this.SPACE_SHOPIDS_CACHE_KEY(tenantId, spaceId)));
      // deletePattern : getShopDetails écrit des clés suffixées ":page:limit:granular"
      keys.push(this.redis.deletePattern(`${this.SPACE_SHOPDETAILS_CACHE_KEY(tenantId, spaceId)}*`) as unknown as Promise<void>);
      // BUG-143-01 : caches par event des endpoints batch Analyse (clés suffixées ":eventId").
      // Motifs partagés avec AggregationService.executeProcessEvents (fin de re-agrégation).
      for (const pattern of eventBatchCachePatterns(tenantId, spaceId)) {
        keys.push(this.redis.deletePattern(pattern) as unknown as Promise<void>);
      }
      // BUG-144-01 : entrées stables de resolveEventSalesScope.
      keys.push(this.redis.delete(this.SPACE_SALESSCOPE_CACHE_KEY(tenantId, spaceId)));
    }
    await Promise.all(keys);
  }

  readonly SPACE_SHOPIDS_CACHE_TTL = 30; // seconds — même durée que SPACE_SHOPS_CACHE_TTL
  readonly SPACE_SHOPIDS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:shopids:${tenantId}:${spaceId}`;
}
