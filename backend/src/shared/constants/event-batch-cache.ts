/**
 * BUG-143-01 — motifs Redis des caches par event des endpoints batch de l'Analyse
 * (event-timeline, transaction-baskets, et depuis BUG-144-01 analyse-unmapped). Clés
 * écrites par SpacesService (`spaces:evtimeline:{tenantId}:{spaceId}:{eventId}`,
 * `spaces:baskets:…`, `spaces:unmapped:…`), purgées à DEUX endroits qui doivent rester
 * alignés — d'où cette constante partagée :
 *  - SpacesService.invalidateSpaceCache (écritures espace/builder) ;
 *  - AggregationService.executeProcessEvents (fin de re-agrégation — sans cette purge,
 *    une re-agrégation servirait jusqu'à 6 h de timeline périmée).
 * `spaces:unmapped:*` est EN PLUS purgé à l'écriture de mapping (MappingsService,
 * motif `unmappedCachePattern` ci-dessous) : un re-mapping fait en Data Integration
 * doit se voir au prochain chargement — c'est la condition qui a permis de cacher cet
 * endpoint (remplace la décision BUG-137-01 « jamais caché »).
 */
export const eventBatchCachePatterns = (tenantId: string, spaceId: string): string[] => [
  `spaces:evtimeline:${tenantId}:${spaceId}:*`,
  `spaces:baskets:${tenantId}:${spaceId}:*`,
  `spaces:unmapped:${tenantId}:${spaceId}:*`,
];

/** Purge tenant-wide du volume non mappé (écriture de mapping : le spaceId touché n'est
 *  pas toujours connu du service des mappings — motif large, coût négligeable). */
export const unmappedCachePattern = (tenantId: string): string =>
  `spaces:unmapped:${tenantId}:*`;
