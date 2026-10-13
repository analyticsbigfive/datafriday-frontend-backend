/**
 * Ventilation des ventes par dimension article « rendement » : marque, industriel,
 * fournisseur (coût), promotion. Fonctions PURES : l'entrée est la liste de records
 * article (menuItemId, quantity, revenue) et l'index des dimensions renvoyé par
 * GET /analyse/article-dimensions (Map menuItemId -> ArticleDimension).
 *
 * Combos : le CA et les quantités d'un combo sont ventilés sur ses enfants au prorata de
 * `comboChildren.weight` (part de prix, somme 1). Le coût fournisseur suit au contraire
 * `comboChildren.quantity` : un menu vendu consomme chaque enfant EN ENTIER (un burger,
 * pas 60 % d'un burger), plus la PROPRE recette du combo (emballage, souvent vide).
 */

/** Clé technique du segment « Non renseigné » (traduite à l'affichage, jamais un nom réel). */
export const NOT_SET_KEY = '__NOT_SET__'
/** Clés du donut « Promotion oui / non ». */
export const PROMO_YES_KEY = 'promo'
export const PROMO_NO_KEY = 'normal'

// Profondeur max de ventilation d'un combo (un combo dans un combo reste borné, jamais de boucle).
const MAX_COMBO_DEPTH = 3

/** Items de l'endpoint A vers Map menuItemId -> dimension. */
export function buildDimensionIndex(items) {
  const index = new Map()
  for (const it of Array.isArray(items) ? items : []) {
    if (it && it.menuItemId != null) index.set(String(it.menuItemId), it)
  }
  return index
}

/** Id article d'un record (le grain article porte menuItemId, les scénarios Predict un id mappé). */
export function recordMenuItemId(record) {
  const id = record?.menuItemId ?? record?.mappedMenuItemId
  return id == null || id === '' ? null : String(id)
}

/** Métrique d'un record selon le mode du toggle Quantité / CA. */
export function recordMetric(mode) {
  return mode === 'quantity'
    ? (r) => Number(r?.quantity) || 0
    : (r) => Number(r?.revenue) || 0
}

/**
 * Ventile un article sur ses feuilles : [{ id, weight, dim, self }].
 * Un article simple donne une seule feuille de poids 1. Un combo donne ses enfants
 * (poids multipliés le long des niveaux) ; avec `includeSelf`, le combo lui-même est
 * ajouté (poids 1, `self: true`) pour que son coût de recette propre ne soit pas perdu.
 * `byQuantity` : le poids d'un enfant devient sa quantité par combo (ventilation du coût).
 */
export function expandToLeaves(menuItemId, index, { includeSelf = false, byQuantity = false } = {}) {
  const out = []
  const walk = (id, weight, depth) => {
    const dim = index?.get(String(id))
    const children = dim?.comboChildren
    if (Array.isArray(children) && children.length && depth < MAX_COMBO_DEPTH) {
      if (includeSelf) out.push({ id, weight, dim, self: true })
      for (const c of children) {
        const w = byQuantity ? Number(c?.quantity ?? 1) : Number(c?.weight)
        if (c?.menuItemId == null || !(w > 0)) continue
        walk(String(c.menuItemId), weight * w, depth + 1)
      }
      return
    }
    out.push({ id, weight, dim, self: false })
  }
  walk(String(menuItemId), 1, 0)
  return out
}

/** Map clé -> valeur vers entrées triées : valeur décroissante, « Non renseigné » en dernier. */
function toSortedEntries(map) {
  const entries = [...map.entries()].filter(([, v]) => Number.isFinite(v) && v > 0)
  entries.sort((a, b) => {
    const aNr = a[0] === NOT_SET_KEY
    const bNr = b[0] === NOT_SET_KEY
    if (aNr !== bNr) return aNr ? 1 : -1
    return b[1] - a[1]
  })
  return entries.map(([key, value]) => ({ key, value }))
}

const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value)

/** Par marque : MenuItem.brandId, sans marque = « Non renseigné ». */
export function brandBreakdown(records, index, metric) {
  const map = new Map()
  for (const r of records || []) {
    const id = recordMenuItemId(r)
    const base = metric(r)
    if (!base) continue
    if (id == null) {
      add(map, NOT_SET_KEY, base)
      continue
    }
    for (const leaf of expandToLeaves(id, index)) {
      add(map, leaf.dim?.brandName || NOT_SET_KEY, base * leaf.weight)
    }
  }
  return toSortedEntries(map)
}

/**
 * Par industriel : parts de la recette (somme 1) ; aucune part = « Non renseigné ».
 */
export function industrialBreakdown(records, index, metric) {
  const map = new Map()
  for (const r of records || []) {
    const id = recordMenuItemId(r)
    const base = metric(r)
    if (!base) continue
    if (id == null) {
      add(map, NOT_SET_KEY, base)
      continue
    }
    for (const leaf of expandToLeaves(id, index)) {
      const shares = leaf.dim?.industrialShares
      if (!Array.isArray(shares) || !shares.length) {
        add(map, NOT_SET_KEY, base * leaf.weight)
        continue
      }
      for (const s of shares) add(map, s?.name || NOT_SET_KEY, base * leaf.weight * (Number(s?.share) || 0))
    }
  }
  return toSortedEntries(map)
}

/**
 * Coût par fournisseur, TOUJOURS en euros : quantité vendue x coût par unité vendue de
 * chaque ligne de recette. Un article sans coût de recette n'apparaît pas (jamais 0 fabriqué).
 */
export function supplierCostBreakdown(records, index) {
  const map = new Map()
  for (const r of records || []) {
    const id = recordMenuItemId(r)
    const qty = Number(r?.quantity) || 0
    if (id == null || !qty) continue
    for (const leaf of expandToLeaves(id, index, { includeSelf: true, byQuantity: true })) {
      const costs = leaf.dim?.supplierCosts
      if (!Array.isArray(costs)) continue
      for (const c of costs) {
        const unit = Number(c?.unitCost)
        if (!(unit > 0)) continue
        add(map, c?.name || NOT_SET_KEY, qty * leaf.weight * unit)
      }
    }
  }
  return toSortedEntries(map)
}

/** Une vente est « promo » quand son article porte une fiche Promotion active. */
export function isPromoRecord(record, index) {
  const id = recordMenuItemId(record)
  return id != null && !!index?.get(id)?.promotion
}

/** Donut « Promotion oui / non » (sur le total des ventes du périmètre). */
export function promotionBreakdown(records, index, metric) {
  const map = new Map()
  for (const r of records || []) {
    const base = metric(r)
    if (!base) continue
    add(map, isPromoRecord(r, index) ? PROMO_YES_KEY : PROMO_NO_KEY, base)
  }
  // Ordre fixe lisible : promo d'abord, puis prix normal (pas de tri par valeur).
  return [PROMO_YES_KEY, PROMO_NO_KEY]
    .filter((k) => (map.get(k) || 0) > 0)
    .map((key) => ({ key, value: map.get(key) }))
}

/** Donut « Type de promotion » : ventes promo seulement, type absent = « Non renseigné ». */
export function promotionTypeBreakdown(records, index, metric) {
  const map = new Map()
  for (const r of records || []) {
    const base = metric(r)
    if (!base || !isPromoRecord(r, index)) continue
    const promo = index.get(recordMenuItemId(r)).promotion
    add(map, promo.typeName || NOT_SET_KEY, base)
  }
  return toSortedEntries(map)
}

/**
 * Remise accordée = Σ (prix du produit de référence - prix de l'article promo) x quantité.
 * Les ventes promo sans prix de référence sont comptées à part (jamais une remise inventée).
 */
export function promotionDiscount(records, index) {
  let amount = 0
  let withoutReference = 0
  for (const r of records || []) {
    const qty = Number(r?.quantity) || 0
    if (!qty || !isPromoRecord(r, index)) continue
    const promo = index.get(recordMenuItemId(r)).promotion
    const ref = promo.referencePrice
    const price = promo.price
    if (ref == null || price == null || !Number.isFinite(Number(ref)) || !Number.isFinite(Number(price))) {
      withoutReference += qty
      continue
    }
    amount += (Number(ref) - Number(price)) * qty
  }
  return { amount, withoutReference }
}

/** Listes d'options des filtres (noms triés, « Non renseigné » en dernier). */
export function listDimensionOptions(index) {
  const brands = new Set()
  const industrials = new Set()
  const suppliers = new Set()
  const promotionTypes = new Set()
  for (const dim of index?.values?.() || []) {
    if (dim.brandName) brands.add(dim.brandName)
    for (const s of dim.industrialShares || []) if (s?.name) industrials.add(s.name)
    for (const c of dim.supplierCosts || []) if (c?.name) suppliers.add(c.name)
    if (dim.promotion?.typeName) promotionTypes.add(dim.promotion.typeName)
  }
  const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b))
  return {
    brands: [...sorted(brands), NOT_SET_KEY],
    industrials: [...sorted(industrials), NOT_SET_KEY],
    suppliers: [...sorted(suppliers), NOT_SET_KEY],
    promotionTypes: [...sorted(promotionTypes), NOT_SET_KEY],
  }
}

/** Couleur du segment « Non renseigné » (gris, jamais pris dans la palette). */
export const NOT_SET_COLOR = '#B0BEC5'

/**
 * Entrées triées -> props de DonutChartCard. `keys` reste la valeur technique (filtre),
 * `labels` le texte affiché (« Non renseigné » traduit par l'appelant via `labelOf`).
 */
export function entriesToDonut(entries, labelOf, palette) {
  const colors = []
  let paletteIndex = 0
  for (const e of entries) {
    if (e.key === NOT_SET_KEY) colors.push(NOT_SET_COLOR)
    else colors.push(palette[paletteIndex++ % palette.length])
  }
  return {
    keys: entries.map((e) => e.key),
    labels: entries.map((e) => labelOf(e.key)),
    values: entries.map((e) => e.value),
    colors,
    total: entries.reduce((sum, e) => sum + e.value, 0),
  }
}
