// Unité et conditionnement des lignes de réconciliation (demande Ulrich 2026-09-11).
//
// Une quantité nue (« 840 ») ne dit ni son unité ni ce qu'elle représente en
// colis. Chaque ligne archive désormais { unit, unitsPerPack, packaging } au
// moment de la génération (photo figée : le référentiel peut changer ensuite),
// et l'affichage rend « 840 L (28 Fut de 30 L) ».
//
// Source : l'article COMPTÉ d'abord (`unit`, `inventoryQuantityPackaged`,
// `inventoryPackaging` de buildConsolidatedInventory, la même convention que le
// total compté = packed × inventoryQuantityPackaged + loose), le catalogue
// Market Price en repli pour une ligne vendue mais non comptée.
//
// Fonctions PURES.

const positive = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {object} params
 * @param {Array<{id:string, unit?:string, inventoryQuantityPackaged?:number, inventoryPackaging?:string, marketPriceId?:string}>} params.countedItems
 * @param {Array<{id:string, unit?:string, packedUnits?:number, inventoryPackaging?:string}>} [params.marketPrices]
 * @returns {Record<string, {unit:string|null, unitsPerPack:number|null, packaging:string|null}>}
 */
export function buildUnitInfoByItemId({ countedItems = [], marketPrices = [] } = {}) {
  const mpById = new Map()
  for (const mp of marketPrices || []) {
    if (mp?.id == null) continue
    mpById.set(String(mp.id), {
      unit: mp.unit ? String(mp.unit).trim() : null,
      unitsPerPack: positive(mp.packedUnits),
      packaging: mp.inventoryPackaging ? String(mp.inventoryPackaging).trim() : null,
    })
  }
  const out = {}
  for (const it of countedItems || []) {
    if (it?.id == null) continue
    const id = String(it.id)
    const mp = mpById.get(id) || (it.marketPriceId != null ? mpById.get(String(it.marketPriceId)) : null) || {}
    out[id] = {
      unit: (it.unit ? String(it.unit).trim() : null) || mp.unit || null,
      unitsPerPack: positive(it.inventoryQuantityPackaged) || mp.unitsPerPack || null,
      packaging: (it.inventoryPackaging ? String(it.inventoryPackaging).trim() : null) || mp.packaging || null,
    }
  }
  // Articles du catalogue non comptés (ligne vendue seulement) : repli direct.
  for (const [id, info] of mpById) if (!out[id]) out[id] = info
  return out
}

/**
 * « 840 L (28 Fut de 30 L) ». Sans unité : le nombre seul (documents
 * antérieurs). Sans conditionnement (> 1 unité par colis et nom connu) : pas de
 * parenthèse. Le nombre de colis n'est pas arrondi à l'entier : 2,5 fûts est
 * une information, pas une erreur.
 *
 * @param {number|null|undefined} qty
 * @param {{unit?:string|null, unitsPerPack?:number|null, packaging?:string|null}|null} info
 * @param {object} opts
 * @param {(n:number)=>string} opts.formatNumber   formateur localisé
 * @param {string} [opts.ofWord]                   « de » / « of »
 * @param {boolean} [opts.withPack]                inclure la parenthèse (défaut true)
 * @returns {string}
 */
export function formatQuantityWithPack(qty, info, { formatNumber, ofWord = 'of', withPack = true } = {}) {
  if (qty == null || Number.isNaN(Number(qty))) return '—'
  const n = Number(qty)
  const unit = info?.unit ? String(info.unit).trim() : ''
  let text = unit ? `${formatNumber(n)} ${unit}` : formatNumber(n)
  const upp = positive(info?.unitsPerPack)
  const packaging = info?.packaging ? String(info.packaging).trim() : ''
  if (withPack && upp && upp > 1 && packaging) {
    const packs = Math.round((n / upp) * 10) / 10
    const packSize = unit ? `${formatNumber(upp)} ${unit}` : formatNumber(upp)
    text += ` (${formatNumber(packs)} ${packaging} ${ofWord} ${packSize})`
  }
  return text
}

/**
 * Info d'unité commune à un groupe de lignes : celle des lignes si elles sont
 * toutes identiques, sinon null (un PdV mélange litres et pièces : pas d'unité
 * sur sa ligne de total).
 * @param {Array<{unit?:string|null, unitsPerPack?:number|null, packaging?:string|null}>} lines
 */
export function sharedUnitInfo(lines = []) {
  let ref = null
  for (const l of lines) {
    const cur = { unit: l?.unit ?? null, unitsPerPack: l?.unitsPerPack ?? null, packaging: l?.packaging ?? null }
    if (!ref) {
      ref = cur
      continue
    }
    if (cur.unit !== ref.unit || cur.unitsPerPack !== ref.unitsPerPack || cur.packaging !== ref.packaging) return null
  }
  return ref && ref.unit ? ref : null
}
