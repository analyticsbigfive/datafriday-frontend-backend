/**
 * Regroupement des paniers par COMBINAISON (catégories ou articles).
 *
 * Extrait de `TransactionCategoryMixChart.vue` pour être testable seul : c'est le
 * calcul dont dépendent tous les pourcentages affichés, et il a trois pièges —
 * l'égalité de combinaison, le bucket « Autres » non drillable, et les lignes non
 * résolues qui doivent rester comptées.
 */

/**
 * Séparateur de clé : U+001F (unit separator), un caractère de contrôle qui
 * n'apparaît pas dans un libellé produit. Surtout PAS `', '` — un nom d'article
 * contient légitimement des virgules (« Pichet Biere 1,5l »), ce qui ferait
 * fusionner deux combinaisons distinctes.
 */
export const COMBO_KEY_SEP = '\u001f'

/** Clé du bucket d'agrégation. `null` = non drillable (combinaisons hétérogènes). */
export const OTHERS_COMBO_KEY = null

/**
 * Clé canonique d'une combinaison. Porte les valeurs BRUTES (`null` compris) et
 * non les libellés traduits : deux paniers non résolus doivent tomber dans le
 * même bucket quelle que soit la langue d'affichage.
 */
export function comboKey(combo) {
  return (combo || []).map((c) => (c == null ? '' : String(c))).join(COMBO_KEY_SEP)
}

/**
 * Libellé affichable d'une combinaison. `unmatchedLabel` est injecté par
 * l'appelant (i18n) plutôt qu'importé ici, pour garder cet util sans dépendance.
 */
export function comboLabel(combo, unmatchedLabel) {
  const parts = (combo || []).map((c) => (c == null || c === '' ? unmatchedLabel : c))
  return parts.length ? parts.join(', ') : unmatchedLabel
}

/**
 * Groupe les records par combinaison, trie par nombre de TRANSACTIONS décroissant,
 * garde le top N et agrège la queue dans un bucket « Autres ».
 *
 * @param {Array<object>} records          BasketComboRecord[]
 * @param {(r: object) => Array<string|null>} comboOf  extrait categoryCombo ou itemCombo
 * @param {object} opts
 * @param {number} opts.topN               parts nommées avant « Autres »
 * @param {string} opts.unmatchedLabel     libellé des entrées non résolues
 * @param {string} opts.othersLabel        libellé du bucket d'agrégation
 * @param {Array<string>} opts.palette     couleurs, cyclées
 * @returns {{keys: Array<string|null>, labels: string[], values: number[], colors: string[]}}
 */
export function groupBasketsByCombo(records, comboOf, { topN, unmatchedLabel, othersLabel, palette }) {
  const map = new Map()
  for (const r of records || []) {
    const combo = comboOf(r) || []
    const key = comboKey(combo)
    const prev = map.get(key)
    if (prev) prev.count += r.transactionCount || 0
    else map.set(key, { combo, count: r.transactionCount || 0 })
  }

  const entries = [...map.entries()].sort((a, b) => b[1].count - a[1].count)
  const head = entries.slice(0, topN)
  const tail = entries.slice(topN)

  const keys = head.map(([key]) => key)
  const labels = head.map(([, v]) => comboLabel(v.combo, unmatchedLabel))
  const values = head.map(([, v]) => v.count)

  if (tail.length) {
    keys.push(OTHERS_COMBO_KEY)
    labels.push(othersLabel)
    values.push(tail.reduce((sum, [, v]) => sum + v.count, 0))
  }

  return {
    keys,
    labels,
    values,
    colors: values.map((_, i) => palette[i % palette.length]),
  }
}
