// Lignes de réarmement des ESPACES DE STOCKAGE (chantier logistic_ventilation,
// partie 4 ; réponse #4 de Bertrand du 2026-10-08 : « le réarmement généré devrait
// aussi montrer ce qui doit être ventilé pour les espaces de stockage afin de
// couvrir les stocks tampons »).
//
// Le réassort d'un stockage existait déjà (onglet « Espaces de stockage » de
// l'étape 1, fiche 314-01 : tampon Builder − restant, × %), mais n'alimentait que
// la feuille de course. Ces lignes le rendent visible à l'étape 2, corrigeable
// (« À déposer »), figé dans le plan et lisible par la Ventilation de Logistic.
//
// Une seule voie vers l'achat : ces lignes sont EXCLUES de la feuille de course
// tirée des lignes de réarmement (shoppingSupplierGroups) ; leur achat passe
// toujours par le réassort injecté après netting (storageRefillLines), qui lit
// désormais leur quantité arrondie au colis. Les corrections d'un plan
// enregistré rejoignent ce réassort via `storageRefillCoeffs` (coefficient
// `refill`, cf. recomputeShoppingFromOverrides).

import { coveredQuantityForPackaging, ceilForUnit, computeRestockOutcome } from '@/utils/stockPlanning'
import { normalizeStr } from '@/utils/predictiveAnalytics'

export const STORAGE_ELEMENT_TYPE = 'storage'

export function isStorageRestockLine(line) {
  return line?.elementType === STORAGE_ELEMENT_TYPE
}

/**
 * Lignes d'étape 2 des stockages, une par stockage × article dont le nécessaire
 * est strictement positif.
 * @param {Array} groups sortie de `storageRestockGroups` (SpaceRestockView)
 * @param {Object} [options]
 * @param {(row:object, quantity:number) => object|null} [options.packagingFor]
 *   conditionnement de la ligne pour une quantité (colis entiers), null si inconnu
 * @param {string[]} [options.eventIds] matchs de la feuille : le réassort d'un
 *   stockage sert toute la feuille, il reste visible quel que soit le match filtré
 * @param {string[]} [options.eventNames] libellés de ces matchs
 * @returns {Array<object>} même forme que les lignes PDV, plus `elementType: 'storage'`
 */
export function buildStorageRestockLines(groups, { packagingFor, eventIds = [], eventNames = [] } = {}) {
  const lines = []
  for (const group of groups || []) {
    for (const row of group?.rows || []) {
      const required = Number(row?.required) || 0
      if (!(required > 0)) continue
      const packaging = packagingFor ? packagingFor(row, required) : null
      // Même règle que les PDV : colis entiers quand le conditionnement est connu,
      // sinon arrondi au supérieur (jamais un manque non couvert).
      const covered = packaging ? coveredQuantityForPackaging(packaging) : null
      const restockQuantity = covered > 0 ? covered : ceilForUnit(required, row.unit)
      if (!(restockQuantity > 0)) continue
      const remainingQuantity = Number(row.remaining) || 0
      // Cible après réassort = restant + nécessaire (le % de l'onglet est déjà
      // appliqué au nécessaire).
      const targetQuantity = remainingQuantity + required
      lines.push({
        rowKey: `storage|||${group.elementId}|||${row.key}`,
        elementType: STORAGE_ELEMENT_TYPE,
        shopId: String(group.elementId),
        shopName: group.elementName || '',
        itemKey: row.key,
        itemId: row.menuItemId || null,
        itemName: row.name,
        unit: row.unit || null,
        targetQuantity,
        remainingQuantity,
        restockQuantity,
        packaging,
        ...computeRestockOutcome({ targetQuantity, remainingQuantity, restockQuantity }),
        eventIds: [...eventIds],
        eventNames: [...eventNames],
        sources: [],
        sourceBreakdown: [],
      })
    }
  }
  return lines
}

/**
 * Coefficients figés des lignes stockage : une correction « À déposer » sur une
 * ligne stockage modifie le RÉASSORT de l'article de feuille de course qui l'a
 * reçu (fusionné dans un article déjà acheté, ou ligne propre), jamais le besoin
 * PDV.
 * @param {Array} restockRows lignes d'étape 2 (PDV + stockages)
 * @param {Record<string,string>} refillTargets itemKey de ligne stockage → itemKey
 *   de l'article de feuille de course (nettedShopping().refillTargets)
 */
export function storageRefillCoeffs(restockRows, refillTargets = {}) {
  const coeffs = {}
  for (const row of restockRows || []) {
    if (!isStorageRestockLine(row) || row.itemKey == null || coeffs[row.itemKey]) continue
    coeffs[row.itemKey] = [{ itemKey: String(refillTargets[row.itemKey] ?? row.itemKey), perUnit: 1, refill: true }]
  }
  return coeffs
}

/** Clé de regroupement « par article » d'une ligne à déposer : une ligne stockage
 *  porte une clé propre au stockage, on la regroupe donc par nom d'article. */
export function depositGroupKey(line) {
  if (isStorageRestockLine(line)) return `name|||${normalizeStr(line.itemName)}`
  return String(line?.itemKey ?? line?.itemName ?? '')
}
