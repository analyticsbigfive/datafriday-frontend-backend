// Besoin prédit Event Predict, exprimé au grain INVENTAIRE (ingrédients,
// composants, packaging) par PdV × article.
//
// Pourquoi ce module : deux écrans veulent le même nombre pour des raisons
// différentes — Pre-event Inventory l'affiche en regard du total compté (« voilà
// ce qu'il faut avoir en rayon »), Logistic l'affiche en colonne séparée (« voilà
// ce qu'il faut amener »). Le calculer deux fois les ferait diverger.
//
// Source : `EventPredictVersion.predictedRecords` de la version marquée PAR DÉFAUT
// (décision 2026-07-30). L'API fait foi ; le miroir localStorage n'est qu'un repli
// quand elle tombe — sans lui, une coupure réseau effacerait l'indice au lieu de
// le figer. Aucune version par défaut → null, jamais un 0 fabriqué.
//
// Le besoin est BRUT : ventes prédites × `quantityAdjustments`, explosées par
// `buildStockRequirements`. Le netting « besoin − stock restant » reste l'affaire
// du Réarmement (`buildShoppingList`) — le dupliquer ici donnerait deux écrans
// répondant la même question avec deux stocks de référence différents.

import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import * as localDb from '@/data/localDb'
import { buildStockRequirements } from '@/utils/stockPlanning'
import { expectedKey } from '@/utils/preEventExpected'
import { normalizeStr } from '@/utils/predictiveAnalytics'

/**
 * Version de référence d'un event : celle marquée par défaut, et elle seule.
 * « La plus récente » ferait changer le chiffre de référence dès que quelqu'un
 * sauvegarde un scénario de test.
 * @param {Array<object>} rows versions (API ou miroir localStorage)
 * @returns {object|null}
 */
export function pickReferenceVersion(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list.find((v) => v?.isDefault) || null
}

/**
 * Index du besoin prédit, deux entrées par ligne pour absorber l'écart d'identifiant
 * entre référentiels : par `elementId|itemId` (Inventory) et par `elementId|nom
 * normalisé` (Logistic, dont les lignes sont keyées par nom).
 *
 * @param {Object} params
 * @param {Array<{id:string,name:string}>} params.elements PdV affichés par l'écran appelant
 * @param {Array<object>} params.menuItems  catalogue (store analyse)
 * @param {Array<object>} params.components composants (store analyse)
 * @param {object|null} params.version      version Event Predict de référence
 * @returns {{byItemId: Record<string, number>, byItemName: Record<string, number>}|null}
 */
export function buildPredictedNeedIndex({ elements = [], menuItems = [], components = [], version } = {}) {
  const records = Array.isArray(version?.predictedRecords) ? version.predictedRecords : []
  if (!records.length || !elements.length) return null

  // `buildStockRequirements` attend une configuration ; on la synthétise depuis
  // les PdV RÉELLEMENT affichés par l'écran, pour que le besoin et la liste
  // comptée portent exactement sur le même périmètre.
  const configuration = {
    floors: [{ elements: elements.map((el) => ({ id: el.id, name: el.name, type: 'shop' })) }],
  }

  const rows = buildStockRequirements({
    configuration,
    menuItems,
    components,
    predictedRecords: records,
    selectedMenuItems: version?.menuConfig || {},
    quantityAdjustments: version?.quantityAdjustments || {},
  })

  const byItemId = {}
  const byItemName = {}
  for (const row of rows) {
    const elementId = row?.shopId
    const units = Number(row?.totalQuantity) || 0
    if (!elementId || !units) continue
    for (const id of [row.itemId, row.sourceId]) {
      if (id == null) continue
      const k = expectedKey(elementId, id)
      byItemId[k] = (byItemId[k] || 0) + units
    }
    const nk = normalizeStr(row?.itemName)
    if (nk) {
      const k = expectedKey(elementId, nk)
      byItemName[k] = (byItemName[k] || 0) + units
    }
  }
  // Index vide (scénario qui ne couvre aucun des PdV affichés) → null, comme
  // « pas de scénario » : dans les deux cas il n'y a rien à afficher, et un objet
  // vide obligerait chaque appelant à re-tester ses clés.
  if (!Object.keys(byItemId).length && !Object.keys(byItemName).length) return null
  return { byItemId, byItemName }
}

/**
 * Besoin prédit d'un (PdV, article). `itemId` d'abord, repli sur le nom normalisé
 * — les deux référentiels ne keyent pas pareil.
 * @returns {number|null} null = rien de prédit pour cette ligne (« — », pas 0)
 */
export function lookupPredictedNeed(index, elementId, item) {
  if (!index || !elementId || !item) return null
  const byId = item.id != null ? index.byItemId?.[expectedKey(elementId, item.id)] : undefined
  if (Number.isFinite(byId)) return byId
  const nk = normalizeStr(item?.name)
  const byName = nk ? index.byItemName?.[expectedKey(elementId, nk)] : undefined
  return Number.isFinite(byName) ? byName : null
}

/**
 * Index du besoin à partir d'une feuille de réarmement sauvegardée (RestockPlan,
 * `restockLines`, grain shop × article, `restockPlanSnapshot.js`). Retour du PO
 * (2026-08-19) : Logistic doit se calibrer sur la quantité DÉCIDÉE à déposer
 * (`restockQuantity`, réarmement) plutôt que sur la prévision brute Event Predict
 * quand une feuille existe pour l'event visé — cf. `fetchPredictedNeed` (appelant),
 * qui n'utilise cet index qu'en priorité, avant repli sur `loadPredictedNeed`.
 *
 * Expose AUSSI le nombre de packs déjà décidé au réarmement
 * (`line.packaging.packedCount`, `packsByItemId`/`packsByItemName`) : retour
 * utilisateur 2026-08-19, ne pas ré-éclater `restockQuantity / unitsPerPack`
 * soi-même (arrondi différent de la décision réelle prise au réarmement, qui
 * peut nettoyer/arrondir autrement) — utiliser ce nombre de packs natif en
 * priorité, `lookupPredictedNeedPacks` ci-dessous. Absent (undefined) pour une
 * ligne sans conditionnement connu, jamais un 0 fabriqué.
 *
 * Même forme de sortie (byItemId/byItemName) que `buildPredictedNeedIndex` pour
 * rester compatible avec `lookupPredictedNeed` côté consommateur.
 * @param {Array<object>} restockLines lignes figées d'un RestockPlan (grain shop × article)
 * @returns {{byItemId: Record<string, number>, byItemName: Record<string, number>, packsByItemId: Record<string, number>, packsByItemName: Record<string, number>}|null}
 */
export function buildRestockNeedIndex(restockLines) {
  const lines = Array.isArray(restockLines) ? restockLines : []
  if (!lines.length) return null

  const byItemId = {}
  const byItemName = {}
  const packsByItemId = {}
  const packsByItemName = {}
  for (const line of lines) {
    const elementId = line?.shopId
    const units = Number(line?.restockQuantity) || 0
    if (!elementId || !units) continue
    const packs = Number(line?.packaging?.packedCount) || null
    if (line.itemKey != null) {
      const k = expectedKey(elementId, line.itemKey)
      byItemId[k] = (byItemId[k] || 0) + units
      if (packs != null) packsByItemId[k] = (packsByItemId[k] || 0) + packs
    }
    const nk = normalizeStr(line?.itemName)
    if (nk) {
      const k = expectedKey(elementId, nk)
      byItemName[k] = (byItemName[k] || 0) + units
      if (packs != null) packsByItemName[k] = (packsByItemName[k] || 0) + packs
    }
  }
  if (!Object.keys(byItemId).length && !Object.keys(byItemName).length) return null
  return { byItemId, byItemName, packsByItemId, packsByItemName }
}

/**
 * Nombre de packs déjà décidé au réarmement pour ce (PdV, article) — natif
 * (`packaging.packedCount`), PAS recalculé par division. null si l'index ne
 * vient pas d'une feuille de réarmement (repli Event Predict, pas de packs) ou
 * si le conditionnement n'était pas connu sur cette ligne.
 * @returns {number|null}
 */
export function lookupPredictedNeedPacks(index, elementId, item) {
  if (!index || !elementId || !item) return null
  const byId = item.id != null ? index.packsByItemId?.[expectedKey(elementId, item.id)] : undefined
  if (Number.isFinite(byId)) return byId
  const nk = normalizeStr(item?.name)
  const byName = nk ? index.packsByItemName?.[expectedKey(elementId, nk)] : undefined
  return Number.isFinite(byName) ? byName : null
}

/**
 * Charge la version de référence et construit l'index. Ne jette jamais : un
 * indice absent ne doit pas empêcher de compter.
 * @returns {Promise<{index: object|null, reason: null|'no-default-version'}>}
 */
export async function loadPredictedNeed({ eventId, elements, menuItems, components } = {}) {
  if (!eventId) return { index: null, reason: null }

  let rows = []
  try {
    rows = await listEventPredictVersions(eventId)
  } catch (e) {
    // API indisponible → miroir localStorage (écrit par Event Predict / Réarmement).
    console.warn('[predictedNeed] versions API KO, repli miroir local:', e?.message)
    rows = localDb.getEventPredictVersions(eventId)
  }
  if (!Array.isArray(rows) || !rows.length) rows = localDb.getEventPredictVersions(eventId)

  const version = pickReferenceVersion(rows)
  if (!version) return { index: null, reason: 'no-default-version' }

  // Une version existe : si l'index est vide, c'est qu'elle ne couvre pas les PdV
  // affichés — surtout PAS `no-default-version`, qui inviterait à en définir une
  // alors qu'elle existe déjà.
  const index = buildPredictedNeedIndex({ elements, menuItems, components, version })
  return { index, reason: null }
}
