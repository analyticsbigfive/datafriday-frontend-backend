// Données d'affichage du circuit de réarmement (étape 1 de la page Commandes).
// Module pur : transforme les flux de computeRestockCircuit (restockCircuitInputs)
// en objets prêts à rendre pour le drawer PDV et la page. Aucun texte codé en dur :
// la vue fournit un formateur de quantité optionnel et les libellés viennent de l'i18n.

const EPS = 1e-9

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Clé de lecture des flux d'un PDV (même format que computeRestockCircuit). */
export function circuitFlowKey(shopId, itemKey) {
  return `${shopId}|||${itemKey}`
}

function packsOf(quantity, packSize) {
  const size = num(packSize)
  return size > 0 ? Math.round(num(quantity) / size) : 0
}

/**
 * Affichage du circuit pour UN article.
 * @param {object} p
 * @param {Array<{shopId:*, shopName:string}>} p.rows lignes PDV de l'article
 * @param {string} p.itemKey
 * @param {Object<string, object>} [p.flowByShopRow] flux par `${shopId}|||${itemKey}`
 * @param {Array<{fromShopId:*, toShopId:*, quantity:number, packs:number}>} [p.transfers]
 * @param {number|null} [p.packSize] taille du colis, unité de la ligne
 * @param {number} [p.toBuy] achat pour les PDV (orderByItem)
 * @param {(quantity:number) => string} [p.format] formateur : ajoute des champs `...Label`
 * @returns {{
 *   header: { coveredBySurplus, coveredBySurplusPacks, coveredByStorage,
 *             coveredByStoragePacks, toBuy },
 *   byShop: Object<string, { role, ceded, received, fromStorage, packs,
 *             storagePacks, counterparts: Array<{shopName, packs}> }>
 * }}
 */
export function buildItemCircuitDisplay({
  rows = [],
  itemKey,
  flowByShopRow = {},
  transfers = [],
  packSize = null,
  toBuy = 0,
  format = null,
} = {}) {
  const nameById = new Map((rows || []).map((r) => [String(r.shopId), r.shopName]))
  const list = Array.isArray(transfers) ? transfers : []
  const byShop = {}
  let coveredBySurplus = 0
  let coveredByStorage = 0
  let coveredByStoragePacks = 0

  for (const row of rows || []) {
    const flow = (flowByShopRow || {})[circuitFlowKey(row.shopId, itemKey)] || {}
    const ceded = num(flow.ceded)
    const received = num(flow.received)
    const fromStorage = num(flow.fromStorage)
    const id = String(row.shopId)

    let role = 'both-none'
    if (ceded > EPS) role = 'donor'
    else if (received > EPS) role = 'receiver'
    else if (fromStorage > EPS) role = 'storage'

    // Donneur : à qui il cède ; receveur : de qui il reçoit.
    const counterparts = []
    let packs = 0
    for (const tr of list) {
      const isFrom = String(tr.fromShopId) === id
      const isTo = String(tr.toShopId) === id
      if (!isFrom && !isTo) continue
      const otherId = String(isFrom ? tr.toShopId : tr.fromShopId)
      if (role === 'donor' && isFrom) packs += num(tr.packs)
      else if (role !== 'donor' && isTo) packs += num(tr.packs)
      else continue
      counterparts.push({ shopName: nameById.get(otherId) || '', packs: num(tr.packs) })
    }

    const storagePacks = packsOf(fromStorage, packSize)
    coveredBySurplus += received
    coveredByStorage += fromStorage
    coveredByStoragePacks += storagePacks
    byShop[id] = { role, ceded, received, fromStorage, packs, storagePacks, counterparts }
    if (format) {
      byShop[id].fromStorageLabel = fromStorage > EPS ? format(fromStorage) : ''
    }
  }

  const coveredBySurplusPacks = list.reduce((s, tr) => s + num(tr.packs), 0)
  const header = {
    coveredBySurplus,
    coveredBySurplusPacks,
    coveredByStorage,
    coveredByStoragePacks,
    toBuy: num(toBuy),
  }
  if (format) {
    header.coveredBySurplusLabel = format(coveredBySurplus)
    header.coveredByStorageLabel = format(coveredByStorage)
  }
  return { header, byShop }
}

/** Nombre de colis transférés entre PDV pour un article (0 si aucun transfert). */
export function transferPacksOf(transfers) {
  return (Array.isArray(transfers) ? transfers : []).reduce((s, tr) => s + num(tr && tr.packs), 0)
}
