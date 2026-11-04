/**
 * Aides pures de rafraichissement du store analyse (revalidation d'un espace
 * deja charge). Extraites d'analyse.js pour ne pas l'alourdir.
 */

/**
 * Carte de couts apres revalidation : l'entree fraiche gagne toujours sur
 * l'ancienne ; l'ancienne ne sert que de repli le temps que la fraiche arrive.
 * Au changement d'espace, aucune entree ancienne n'est reprise.
 */
export function mergeFreshCostMap(fresh, previous, { sameSpace }) {
  return { ...(sameSpace ? previous || {} : {}), ...(fresh || {}) }
}

/** Remplacement integral par la carte fraiche, completee par la phase 1 (prioritaire). */
export function replaceCostMap(enrichmentMap, phase1Map) {
  return { ...(enrichmentMap || {}), ...(phase1Map || {}) }
}

/**
 * Invalide les caches session timeline/paniers (module space.api). Import dynamique :
 * un import statique tirerait axios dans les specs Jest du store.
 */
export function invalidateEventSessionCaches(spaceId, eventId = null) {
  if (!spaceId) return Promise.resolve()
  return import('@/api/endpoints/space.api')
    .then(({ invalidateSpaceEventCaches }) => invalidateSpaceEventCaches(spaceId, eventId))
    .catch(() => {})
}
