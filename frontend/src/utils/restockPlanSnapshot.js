// Photo figée d'un plan de réapprovisionnement (table RestockPlan).
//
// Règle métier (ADR-0005) : un plan sauvegardé est un DOCUMENT FIGÉ — ses lignes
// sont une photo stockée au moment de la sauvegarde, jamais recalculées à la
// relecture. Corriger une quantité « À déposer » sur un plan chargé recalcule la
// feuille de course via les coefficients de recette FIGÉS dans la photo
// (`recipeCoeffs`), jamais depuis le catalogue vivant : un plan validé la
// semaine dernière réaffiche les mêmes chiffres même si prédictions, prix ou
// recettes ont changé depuis.
//
// Tout est pur et testable sans monter SpaceRestockView. Le test discriminant
// (tests/unit/restockPlanSnapshot.spec.js) est l'IDENTITÉ :
// `recomputeShoppingFromOverrides(snapshot, {})` doit renvoyer exactement
// `snapshot.shoppingGroups` — s'il diverge, le grain des coefficients est faux.
//
// Pourquoi le rejeu est possible sans catalogue : `consumeFromPool`
// (utils/stockNetting.js) consomme TOUTES les entrées de pool qui matchent,
// indépendamment de la quantité de besoin — `storageOnHand` et `shopOnHand`
// figés par item sont donc rejouables tels quels quand le besoin change.
// Idem packaging : la formule de `computePackagingForQuantity`
// (utils/stockPlanning.js:481) ne dépend du catalogue que via
// { packagingUnitNumber, purchaseUnitConversion }, figés dans la photo.

import { resolveComponentDef, flattenComponentDef } from '@/utils/inventoryUtils'
import { describeAnchorEvent } from '@/utils/inventoryEventContext'
// BUG-296-01 — formule unique gap/surplus/finalStock (jamais dupliquée ici).
import { computeRestockOutcome } from '@/utils/stockPlanning'

const USED_IN_MAX = 20

function toNumber(v, f = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : f
}

/** Override valide = nombre fini ≥ 0. Tout le reste est ignoré — y compris
 *  null/''/undefined, que Number() convertirait silencieusement en 0. */
function normalizeOverride(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Packaging figé, débarrassé de `source` (objet catalogue vivant, volumineux).
 * `purchaseUnitConversion` est extrait de `source` AVANT de le jeter : c'est le
 * seul champ catalogue dont le rejeu (recomputePackaging) a besoin.
 */
function freezePackaging(packaging) {
  if (!packaging) return null
  return {
    packedCount: toNumber(packaging.packedCount),
    packagingType: packaging.packagingType ?? null,
    packagingUnitNumber: toNumber(packaging.packagingUnitNumber),
    packagingUnit: packaging.packagingUnit ?? null,
    looseQty: toNumber(packaging.looseQty),
    purchaseUnitConversion:
      toNumber(packaging.purchaseUnitConversion, 0) ||
      toNumber(packaging.source?.purchaseUnitConversion, 1) ||
      1,
  }
}

/**
 * Rejoue l'arrondi packaging sur un packaging FIGÉ, pour une nouvelle quantité.
 * ⚠️ Même expression que computePackagingForQuantity (stockPlanning.js:481) —
 * toute divergence casse l'identité photo/rejeu.
 */
export function recomputePackaging(frozenPackaging, quantity) {
  if (!frozenPackaging) return null
  const pun = toNumber(frozenPackaging.packagingUnitNumber)
  if (!pun) return { ...frozenPackaging }
  const puc = toNumber(frozenPackaging.purchaseUnitConversion, 1) || 1
  const packedCount = Math.ceil((toNumber(quantity) / pun) * puc)
  return { ...frozenPackaging, packedCount, looseQty: packedCount * pun }
}

/**
 * Coefficients d'explosion FIGÉS : itemKey de ligne de réarmement →
 * [{ itemKey: <clé d'item de la feuille de course>, perUnit }].
 *
 * Grain ITEM (pas rowKey) : l'explosion d'un composant en ingrédients est
 * catalogue-level (`flattenComponentDef`), identique quel que soit le PDV —
 * vérifié contre buildIngredientRequirements (utils/bomPlanning.js:209-236).
 *
 *  - mode 'finished'  : la feuille de course agrège les MÊMES items que le
 *    réarmement (shoppingSupplierGroups somme row.restockQuantity par itemKey)
 *    → coefficient 1 vers soi-même.
 *  - mode 'ingredients' : un composant explose en feuilles via
 *    flattenComponentDef ; la clé cible réplique l'aggKey de
 *    buildIngredientRequirements : `${key}|||${unit || 'unit'}` avec
 *    key = leaf.id ?? leaf.sourceId ?? leaf.name. Un item sans définition
 *    catalogue mappe vers lui-même (même repli que la feuille de course :
 *    l'item reste une ligne d'achat).
 */
export function buildRecipeCoeffs({ restockRows = [], shoppingMode = 'finished', components = [] } = {}) {
  const coeffs = {}
  for (const row of restockRows) {
    if (!row || row.itemKey == null || coeffs[row.itemKey]) continue
    if (shoppingMode !== 'ingredients') {
      coeffs[row.itemKey] = [{ itemKey: String(row.itemKey), perUnit: 1 }]
      continue
    }
    const def = resolveComponentDef(
      { sourceId: row.sourceId ?? row.itemId ?? null, name: row.itemName },
      components,
    )
    const leaves =
      def && Array.isArray(def.subComponents) && def.subComponents.length
        ? flattenComponentDef(def, components)
        : []
    if (leaves.length) {
      coeffs[row.itemKey] = leaves.map((leaf) => ({
        itemKey: `${leaf.id ?? leaf.sourceId ?? leaf.name}|||${leaf.unit || 'unit'}`,
        perUnit: toNumber(leaf.qtyFactor, 0),
      }))
    } else {
      coeffs[row.itemKey] = [
        {
          itemKey: `${row.itemId ?? row.sourceId ?? row.itemName}|||${row.unit || 'unit'}`,
          perUnit: 1,
        },
      ]
    }
  }
  return coeffs
}

/** Ligne d'étape 1 figée (grain article) — whitelist stricte, rien d'autre.
 *  BUG-296-01 : `outcome` (agrégat stockOutcomeByItem) fige la ventilation
 *  restant/manque/paquets/couvert/vrac/stock final ; absent sur les plans
 *  sauvegardés avant le changement → le bloc ventilation reste masqué.
 *  `orderQuantity` fige la photo « À commander » de l'étape 1 (besoin netté
 *  contre le Storage au moment de la sauvegarde) : `null` = inconnu (plan
 *  ancien ou article exclu → « — »), `0` = « Rien à acheter » — la
 *  distinction compte à l'affichage. */
function freezeStockLine(row, inputs, outcome, orderQuantity) {
  return {
    itemKey: row.itemKey,
    itemName: row.itemName,
    unit: row.unit ?? null,
    totalQuantity: toNumber(row.totalQuantity),
    adjustmentPercent: toNumber(inputs?.stockAdjustments?.[row.itemKey], 100),
    packedMode: !!inputs?.stockPackedModes?.[row.itemKey],
    excluded: !!inputs?.stockExcluded?.[row.itemKey],
    buyQuantity: orderQuantity == null ? null : toNumber(orderQuantity),
    ...(outcome
      ? {
          targetQuantity: toNumber(outcome.targetQuantity),
          remainingQuantity: toNumber(outcome.remainingQuantity),
          gap: toNumber(outcome.gap),
          packedCount: outcome.packedCount == null ? null : toNumber(outcome.packedCount),
          coveredQuantity: toNumber(outcome.coveredQuantity),
          surplusLoose: toNumber(outcome.surplusLoose),
          finalStock: toNumber(outcome.finalStock),
          packagingType: outcome.packagingType ?? null,
          packagingUnitNumber:
            outcome.packagingUnitNumber == null ? null : toNumber(outcome.packagingUnitNumber),
          packagingUnit: outcome.packagingUnit ?? null,
        }
      : {}),
  }
}

/**
 * Ligne d'étape 2 figée (grain shop × article). `eventIds` est CONSERVÉ
 * (restockEventOptions / filteredRestockRows en dépendent sur un plan chargé) ;
 * `sources`, `isExpanded`, `shopType` sont abandonnés (jamais rendus depuis la
 * photo — sourceBreakdown porte déjà le détail « utilisé dans »).
 */
function freezeRestockLine(row) {
  return {
    rowKey: row.rowKey,
    shopId: row.shopId,
    shopName: row.shopName,
    itemKey: row.itemKey,
    itemName: row.itemName,
    unit: row.unit ?? null,
    targetQuantity: toNumber(row.targetQuantity),
    remainingQuantity: toNumber(row.remainingQuantity),
    restockQuantity: toNumber(row.restockQuantity),
    // BUG-296-01 — reste en vrac et stock final prévu, figés avec la ligne.
    surplusLoose: toNumber(row.surplusLoose),
    finalStock: toNumber(row.finalStock),
    packaging: freezePackaging(row.packaging),
    eventIds: Array.isArray(row.eventIds) ? [...row.eventIds] : [],
    eventNames: Array.isArray(row.eventNames) ? [...row.eventNames] : [],
    sourceBreakdown: (row.sourceBreakdown || []).map((s) => ({
      key: s.key,
      name: s.name,
      quantity: toNumber(s.quantity),
      unit: s.unit ?? null,
    })),
  }
}

/** Item d'étape 3 figé (grain article de la feuille de course). */
function freezeShoppingItem(item) {
  return {
    itemKey: item.itemKey,
    itemName: item.itemName,
    itemType: item.itemType ?? null,
    unit: item.unit ?? null,
    quantity: toNumber(item.quantity),
    buyQuantity: toNumber(item.buyQuantity, toNumber(item.quantity)),
    restockNeed: toNumber(item.restockNeed, toNumber(item.quantity)),
    predicted: toNumber(item.predicted),
    shopOnHand: toNumber(item.shopOnHand),
    storageOnHand: toNumber(item.storageOnHand),
    packaging: freezePackaging(item.packaging),
    shopNames: Array.isArray(item.shopNames) ? [...item.shopNames] : [],
    usedIn: Array.isArray(item.usedIn) ? item.usedIn.slice(0, USED_IN_MAX) : [],
  }
}

/** Groupe fournisseur figé (étape 3). */
function freezeShoppingGroup(group) {
  return {
    supplierId: group.supplierId,
    supplierName: group.supplierName ?? '',
    supplierEmail: group.supplierEmail ?? '',
    supplierPhone: group.supplierPhone ?? '',
    items: (group.items || []).map(freezeShoppingItem),
  }
}

/**
 * Construit le payload complet d'un POST/PATCH /restock-plans : entrées
 * rejouables + photo figée des 3 étapes + compteurs dénormalisés.
 *
 * @param {object} params
 * @param {Array}  params.stockRows       stockSettingsRows (étape 1, grain article)
 * @param {Array}  params.restockRows     restockRows (étape 2, grain shop × article)
 * @param {Array}  params.shoppingGroups  shoppingGroups nets (étape 3)
 * @param {Object} params.recipeCoeffs    buildRecipeCoeffs() — figé tel quel
 * @param {Array}  params.unmatchedStorage nettedShopping().unmatchedStorage
 * @param {Object} params.inputs          { objectiveSource, referenceEventId,
 *   selectedEventIds, scenarioByEventId, stockAdjustments, stockPackedModes,
 *   stockExcluded, restockedRows, shoppingMode, snapshotAt?, degradations? }
 * @param {Array}  params.events          évènements sélectionnés (dénormalisés
 *   en eventsSnapshot [{id,name,date}] via describeAnchorEvent)
 * @returns {object} payload RestockPlan (sans `name` — ajouté par l'appelant)
 */
export function buildPlanSnapshot({
  stockRows = [],
  restockRows = [],
  shoppingGroups = [],
  recipeCoeffs = {},
  unmatchedStorage = [],
  inputs = {},
  events = [],
  // BUG-296-01 — ventilation étape 1 (stockOutcomeByItem), keyée itemKey.
  stockOutcomes = {},
  // Photo « À commander » de l'étape 1 (liveStockOrderByItem), keyée itemKey.
  orderQuantities = {},
} = {}) {
  const stockLines = stockRows.map((row) =>
    freezeStockLine(row, inputs, stockOutcomes?.[row.itemKey], orderQuantities?.[row.itemKey]),
  )
  const restockLines = restockRows.map(freezeRestockLine)
  const frozenShopping = shoppingGroups.map(freezeShoppingGroup)
  return {
    objectiveSource: inputs.objectiveSource || 'forecast',
    referenceEventId: inputs.referenceEventId ?? null,
    selectedEventIds: Array.isArray(inputs.selectedEventIds)
      ? inputs.selectedEventIds.map(String)
      : [],
    eventsSnapshot: (events || [])
      .map((event) => describeAnchorEvent(event))
      .filter(Boolean)
      .map(({ id, name, dateISO }) => ({ id, name, date: dateISO })),
    scenarioByEventId: { ...(inputs.scenarioByEventId || {}) },
    stockAdjustments: { ...(inputs.stockAdjustments || {}) },
    stockPackedModes: { ...(inputs.stockPackedModes || {}) },
    stockExcluded: { ...(inputs.stockExcluded || {}) },
    restockedRows: { ...(inputs.restockedRows || {}) },
    stockLines,
    restockLines,
    shoppingMode: inputs.shoppingMode || 'finished',
    shoppingGroups: frozenShopping,
    recipeCoeffs: JSON.parse(JSON.stringify(recipeCoeffs)),
    lineOverrides: {},
    lineCount: restockLines.length,
    // Compte AU MOMENT DE LA PHOTO — métadonnée de liste, jamais recalculée
    // après une correction (le panneau l'étiquette comme tel).
    shoppingItemCount: frozenShopping.reduce((sum, g) => sum + g.items.length, 0),
    meta: {
      snapshotAt: inputs.snapshotAt ?? null,
      unmatchedStorage: (unmatchedStorage || []).map((e) => ({
        itemId: e.itemId ?? null,
        name: e.name ?? null,
        unit: e.unit ?? null,
        qty: toNumber(e.qty),
      })),
      degradations: inputs.degradations ?? undefined,
      // État de l'onglet Espaces de stockage (maquette 14-08). Niché sous
      // `meta` (déjà dans la whitelist WRITABLE_JSON backend) : un champ
      // top-level nouveau serait silencieusement jeté par pickWritable sur un
      // backend non redéployé. Anciens plans sans ce bloc → défauts sains au
      // chargement (percents vides, 100 %, global actif, source auto).
      storage: {
        percents: { ...(inputs.storagePercents || {}) },
        globalPercent: toNumber(inputs.storageGlobalPercent) || 100,
        globalEnabled: inputs.storageGlobalEnabled !== false,
        sourceInventoryEventId: inputs.sourceInventoryEventId ?? null,
      },
    },
  }
}

/**
 * Applique les corrections « À déposer » aux lignes figées. Pur : renvoie de
 * nouvelles lignes, ne mute rien. rowKey inconnu, valeur non numérique ou
 * négative → ignorés (la ligne ressort telle quelle, sans marqueur `edited`).
 */
export function applyPlanEdits(lines = [], overrides = {}) {
  const keys = overrides && typeof overrides === 'object' ? overrides : {}
  return lines.map((line) => {
    const value = normalizeOverride(keys[line.rowKey])
    if (value === null) {
      return { ...line, packaging: line.packaging ? { ...line.packaging } : null }
    }
    // BUG-296-01 — surplus/stock final recalculés depuis les valeurs FIGÉES
    // (target/remaining de la photo), via la formule unique de stockPlanning.
    const { surplusLoose, finalStock } = computeRestockOutcome({
      targetQuantity: line.targetQuantity,
      remainingQuantity: line.remainingQuantity,
      restockQuantity: value,
    })
    return {
      ...line,
      restockQuantity: value,
      surplusLoose,
      finalStock,
      packaging: recomputePackaging(line.packaging, value),
      edited: true,
    }
  })
}

/**
 * Rejoue la feuille de course d'un plan à partir des corrections : les deltas
 * de lignes passent par les coefficients FIGÉS (`recipeCoeffs`), puis le
 * netting Storage et l'arrondi packaging sont rejoués sur les valeurs figées
 * (`storageOnHand` par item — rejouable car consumeFromPool est indépendant du
 * besoin). Jamais de lecture du catalogue vivant.
 *
 * Sans correction (overrides vides), le résultat est STRICTEMENT identique à
 * `snapshot.shoppingGroups` (test d'identité). Un item entièrement couvert
 * après correction (buy = 0) sort de la liste, comme en mode live ; un item
 * absent de la photo (buy = 0 au moment de la sauvegarde) ne peut pas
 * réapparaître — limite documentée du document figé.
 */
export function recomputeShoppingFromOverrides(snapshot, overrides = {}) {
  const restockLines = snapshot?.restockLines || []
  const shoppingGroups = snapshot?.shoppingGroups || []
  const coeffs = snapshot?.recipeCoeffs || {}

  // Deltas agrégés par clé d'item de feuille de course.
  const deltaByItemKey = {}
  for (const line of restockLines) {
    const value = normalizeOverride(overrides?.[line.rowKey])
    if (value === null) continue
    const delta = value - toNumber(line.restockQuantity)
    if (!delta) continue
    for (const c of coeffs[line.itemKey] || []) {
      deltaByItemKey[c.itemKey] = (deltaByItemKey[c.itemKey] || 0) + delta * toNumber(c.perUnit)
    }
  }

  return shoppingGroups
    .map((group) => ({
      ...group,
      items: (group.items || [])
        .map((item) => {
          const delta = deltaByItemKey[item.itemKey] || 0
          if (!delta) {
            // Clone profond de l'item figé — aucune valeur recalculée.
            return {
              ...item,
              packaging: item.packaging ? { ...item.packaging } : null,
              shopNames: [...(item.shopNames || [])],
              usedIn: [...(item.usedIn || [])],
            }
          }
          const restockNeed = Math.max(0, toNumber(item.restockNeed) + delta)
          const buyQuantity = Math.max(0, restockNeed - toNumber(item.storageOnHand))
          return {
            ...item,
            restockNeed,
            buyQuantity,
            quantity: buyQuantity,
            packaging: recomputePackaging(item.packaging, buyQuantity),
            shopNames: [...(item.shopNames || [])],
            usedIn: [...(item.usedIn || [])],
          }
        })
        .filter((item) => item.buyQuantity > 0),
    }))
    .filter((group) => group.items.length > 0)
}

/** Compteurs dénormalisés d'un payload/plan (liste, bandeau). */
export function planCounters(plan) {
  const restockLines = plan?.restockLines || []
  const shoppingGroups = plan?.shoppingGroups || []
  return {
    lineCount: restockLines.length,
    shoppingItemCount: shoppingGroups.reduce((sum, g) => sum + (g.items?.length || 0), 0),
  }
}

/**
 * Taille approximative du payload (garde-fou AVANT le POST). Même métrique que
 * le backend (restock-plans.service.ts assertPayloadSize compare
 * JSON.stringify(body).length) — volontairement en CARACTÈRES, pas en octets
 * UTF-8, pour rejeter côté client exactement ce que le serveur rejetterait.
 */
export function estimateSnapshotBytes(payload) {
  try {
    return JSON.stringify(payload).length
  } catch {
    return 0
  }
}

/**
 * Unités ATTENDUES par élément depuis les lignes `restockLines` d'un plan
 * sauvegardé : { elementId: [{ unit, total }] }. Somme des `targetQuantity`
 * (cible de stock après réarmement — ce que l'inventaire pré-event devrait
 * retrouver ; décision JLH 13/08, pas `restockQuantity`). Un élément peut
 * mélanger Pc/Kg/L → un segment par unité ; unité vide regroupée sous
 * `fallbackUnit`. Consommé par le badge « Attendu » du Pre-event Inventory.
 */
export function aggregateExpectedUnitsByElement(restockLines, { fallbackUnit = 'pc' } = {}) {
  if (!Array.isArray(restockLines) || !restockLines.length) return {}
  const byElement = {}
  for (const r of restockLines) {
    const elId = r?.shopId != null ? String(r.shopId) : ''
    if (!elId) continue
    const qty = Number(r.targetQuantity) || 0
    if (!(qty > 0)) continue
    const unit = String(r.unit || fallbackUnit).trim() || fallbackUnit
    const units = (byElement[elId] = byElement[elId] || {})
    units[unit] = (units[unit] || 0) + qty
  }
  const out = {}
  for (const [elId, units] of Object.entries(byElement)) {
    out[elId] = Object.entries(units).map(([unit, total]) => ({ unit, total }))
  }
  return out
}
