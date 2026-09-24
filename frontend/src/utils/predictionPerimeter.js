// Périmètre PdV d'un scénario Event Predict.
//
// Les prévisions d'Event Predict partent des ventes passées de TOUS les PdV qui
// ont vendu pendant les matchs de référence, y compris ceux qui ne sont pas dans
// le Space Menu de la configuration du match. Event Predict n'affiche que les PdV
// de sa `menuConfig` (PdV de la config → articles cochés) ; sans ce filtre, le
// réarmement réintégrait les autres (constaté PAUC/CAEN 2026-09-25 : 1664 à 94,1 L
// sur 5 PdV au lieu de 72,8 L sur les 2 PdV ouverts). Fonctions PURES.

const recordShopId = (r) => String(r?.shopId ?? r?.elementId ?? '')

/** PdV du scénario : les clés de sa `menuConfig` (PdV de la config du match). */
export function perimeterShopIds(menuConfig) {
  return new Set(Object.keys(menuConfig || {}).filter(Boolean).map(String))
}

/**
 * Records restreints aux PdV du périmètre. Une ligne saisie à la main (`isManual`)
 * est toujours gardée : Event Predict ne la crée que sur un PdV de la config.
 * Pas de périmètre connu (menuConfig vide), ou aucun record identifiable par id de
 * PdV (records reconstruits, keyés par nom) : records inchangés, plutôt que de
 * vider le réarmement.
 */
export function restrictRecordsToShops(records, shopIds) {
  const list = Array.isArray(records) ? records : []
  if (!shopIds?.size) return list
  const kept = list.filter((r) => r?.isManual === true || shopIds.has(recordShopId(r)))
  return kept.length ? kept : list
}

/** Raccourci : records d'un scénario restreints aux PdV de sa `menuConfig`. */
export function restrictRecordsToMenuConfig(records, menuConfig) {
  return restrictRecordsToShops(records, perimeterShopIds(menuConfig))
}
