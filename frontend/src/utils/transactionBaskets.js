/**
 * Regroupement et filtrage des paniers par COMBINAISON (catégories ou articles).
 *
 * Extrait de `TransactionCategoryMixChart.vue` pour être testable seul : c'est le
 * calcul dont dépendent tous les pourcentages affichés, et il a trois pièges —
 * l'égalité de combinaison, le bucket « Autres » non drillable, et les lignes non
 * résolues qui doivent rester comptées.
 */
import { buildItemFilterPredicate } from '@/utils/analyseDimensions'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'
import { normalizeStr } from '@/utils/predictiveAnalytics'

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
 * @param {string|((n:number)=>string)} opts.othersLabel  libellé du bucket d'agrégation ;
 *   reçoit le NOMBRE de combinaisons agrégées quand c'est une fonction
 * @param {Array<string>} opts.palette     couleurs, cyclées
 * @returns {{keys: Array<string|null>, labels: string[], values: number[], colors: string[], othersCount: number}}
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
    // Le libellé PORTE le nombre de combinaisons agrégées. Sans ça, « Autres »
    // est un trou noir : sur un référentiel riche il peut devenir la plus grosse
    // part du donut sans que rien n'indique s'il cache 3 combinaisons ou 300.
    labels.push(typeof othersLabel === 'function' ? othersLabel(tail.length) : othersLabel)
    values.push(tail.reduce((sum, [, v]) => sum + v.count, 0))
  }

  return {
    keys,
    labels,
    values,
    othersCount: tail.length,
    colors: values.map((_, i) => palette[i % palette.length]),
  }
}

/**
 * Un panier satisfait-il une sélection de la page ?
 *
 * Sémantique **« CONTIENT »**, tranchée par l'owner (JLH) le 2026-07-29 :
 * filtrer sur « Bières » garde les tickets qui contiennent de la bière, y
 * compris les paniers MIXTES (« Bières, Boissons Soft »), et non les seuls
 * tickets 100 % bière. Cf. question #42 du tracker.
 *
 * Multi-sélection = OU, comme partout ailleurs dans la page (un record passe
 * `itemCats.includes(resolveItemCategory(r))` dès que SA catégorie figure dans
 * la liste). Généralisé au panier : il passe dès qu'UNE de ses entrées figure
 * dans la sélection.
 *
 * Les entrées non résolues (`null` renvoyé par le backend) sont comparées à la
 * sentinelle `UNATTACHED_ITEM_KEY` — c'est elle que le donut « Non rattachés »
 * émet, et sans cette équivalence cliquer la part grise ne matcherait rien.
 */
function comboMatchesAny(combo, selected, { normalize = false } = {}) {
  if (!selected.length) return true
  const wanted = new Set(normalize ? selected.map(normalizeStr) : selected)
  for (const entry of combo || []) {
    const key = entry == null || entry === '' ? UNATTACHED_ITEM_KEY : entry
    if (wanted.has(normalize ? normalizeStr(key) : key)) return true
  }
  return false
}

/**
 * Prédicat complet pour les records de panier : dimensions PdV + horaire via le
 * prédicat PARTAGÉ de la page (une seule implémentation, cf. BUG-244-01), puis
 * dimensions article en « contient » sur les combinaisons.
 *
 * Le record DOIT être réconcilié en amont (`reconcileRecord`) : les donuts PdV
 * émettent des clés réconciliées, filtrer sur les champs bruts du SQL viderait
 * le graphique au clic.
 *
 * @param {object} f  l'objet `filters` du store
 */
export function buildBasketFilterPredicate(f = {}) {
  // Les 3 filtres article sont neutralisés côté prédicat partagé : celui-ci lit
  // `menuItemCategory`/`menuItemType`/`menuItemName`, champs qu'un panier n'a
  // PAS (il porte des combinaisons). On les applique nous-mêmes juste après.
  const shopAndTime = buildItemFilterPredicate({
    ...f,
    selectedMenuItemIds: [],
    selectedMenuItemTypes: [],
    selectedMenuItemCategories: [],
  })
  const cats = f.selectedMenuItemCategories || []
  const types = f.selectedMenuItemTypes || []
  const items = f.selectedMenuItemIds || []

  return (r) => {
    if (!shopAndTime(r)) return false
    if (!comboMatchesAny(r.categoryCombo, cats)) return false
    if (!comboMatchesAny(r.typeCombo, types)) return false
    // `selectedMenuItemIds` contient des NOMS d'article : comparaison normalisée
    // des deux côtés, comme dans le prédicat partagé.
    if (!comboMatchesAny(r.itemCombo, items, { normalize: true })) return false
    return true
  }
}
