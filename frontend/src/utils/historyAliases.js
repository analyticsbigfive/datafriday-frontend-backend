// Alias « historique emprunté » (Event Predict, maquettes 08/2026) : un nouvel
// article (target) reprend l'historique de ventes d'un ancien (source).
//
// Résolution 100 % FRONTEND, au point unique `EventPredictView.activeTimelineData`
// (events passés ET futurs dans Event Predict) : la page Analyse ne lit jamais
// ces alias — contrainte métier « la page Analyse n'est pas modifiée ».
//
// Conventions de correspondance alignées sur `buildTimelineQuantityIndex`
// (predictedQuantityIndex.js) : id (`menuItemId || mappedMenuItemId`) prime,
// repli sur le nom en minuscules (`itemName || menuItemName`). Après réécriture,
// deux records (source réécrite + cible déjà vendue) peuvent fusionner sous la
// même clé : l'indexation SOMME à la construction et la lecture multi-clés
// prend un MAX (BUG-290-01) — comportement voulu.

/**
 * Tables de correspondance depuis les lignes MenuItemHistoryAlias de l'espace.
 * @param {Array<object>} aliases - [{ sourceMenuItemId?, sourceName, targetMenuItemId }]
 * @returns {{ byId: Map<string, object>, byName: Map<string, object> }}
 */
export function buildAliasLookup(aliases) {
  const byId = new Map()
  const byName = new Map()
  for (const a of aliases || []) {
    if (!a || !a.targetMenuItemId) continue
    if (a.sourceMenuItemId) byId.set(String(a.sourceMenuItemId), a)
    if (a.sourceName) byName.set(String(a.sourceName).toLowerCase(), a)
  }
  return { byId, byName }
}

/**
 * Map cible → nom source, pour le badge « historique emprunté » sur la ligne
 * du nouvel article.
 * @param {Array<object>} aliases
 * @returns {Map<string, string>} targetMenuItemId → sourceName
 */
export function aliasSourceByTargetId(aliases) {
  const map = new Map()
  for (const a of aliases || []) {
    if (a && a.targetMenuItemId && a.sourceName) {
      map.set(String(a.targetMenuItemId), a.sourceName)
    }
  }
  return map
}

/**
 * Réécrit les records de timeline dont l'article matche une SOURCE d'alias :
 * l'id et le nom deviennent ceux de la CIBLE (les prévisions « migrent »).
 * Les records non concernés sont retournés tels quels.
 *
 * STABILITÉ RÉFÉRENTIELLE : sans alias, ou si aucun record ne matche, le
 * TABLEAU D'ENTRÉE est retourné tel quel (même référence) — les watchers en
 * aval (ex. persistPredictedRecordsForRestock) ne doivent pas churner.
 *
 * @param {Array<object>} records - records de timeline (prédite ou réelle)
 * @param {Array<object>} aliases - lignes MenuItemHistoryAlias de l'espace
 * @param {Map<string, string>|null} targetNameById - id catalogue → nom (pour
 *   renommer la ligne réécrite ; sans entrée, le nom d'origine est conservé)
 * @returns {Array<object>} même référence si rien à réécrire, sinon copie
 */
export function applyHistoryAliases(records, aliases, targetNameById) {
  const data = records || []
  if (!data.length || !aliases || !aliases.length) return records
  const { byId, byName } = buildAliasLookup(aliases)
  if (!byId.size && !byName.size) return records
  let changed = false
  const out = data.map((r) => {
    if (!r) return r
    const idKey = r.menuItemId || r.mappedMenuItemId
    const nameKey =
      r.itemName || r.menuItemName
        ? String(r.itemName || r.menuItemName).toLowerCase()
        : null
    // L'id prime sur le nom, comme partout dans l'index timeline.
    const alias = (idKey && byId.get(String(idKey))) || (nameKey && byName.get(nameKey)) || null
    if (!alias) return r
    changed = true
    const targetId = alias.targetMenuItemId
    const targetName =
      (targetNameById && targetNameById.get(String(targetId))) || null
    return {
      ...r,
      menuItemId: targetId,
      mappedMenuItemId: targetId,
      itemName: targetName || r.itemName || r.menuItemName || null,
      // Trace de provenance (badge, debug) — préfixe `_` comme les autres
      // flags transitoires de la grille (_bucket, _ghost…).
      _aliasSourceName: alias.sourceName || null,
    }
  })
  return changed ? out : records
}
