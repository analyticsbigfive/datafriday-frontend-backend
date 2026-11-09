// src/composables/useLogisticUnitLabels.js
// Libellés "3 Sacs de 0.5 Kg" / "Nombre de vrac Kg" partagés entre les écrans
// Logistique (LogisticItemCard, LogisticMovementDialog, LogisticTransferConfirmDrawer,
// LogisticLossesDrawer) : une denrée sans unité affichée ne dit rien de ce qui a
// réellement été transféré/perdu (juste "3", 3 quoi ?).

import { conditionnementText, packFieldLabel } from '@/utils/packQuantityText'

/** Libellé du champ du nombre de colis : « Nombre de Sacs de 0.5 Kg » (type + contenance),
 *  « Nombre de Sacs » sans contenance, « Nombre de conditionnements de 30 L » sans type. */
export function packedLabel(item, unitsPerPack, t, locale) {
  return packFieldLabel({ packagingType: item?.packagingType, unitsPerPack, unit: item?.unit }, t, locale)
}

/** Libellé du champ "Loose" : porte l'unité réelle de la denrée si connue. */
export function looseUnitLabel(item, t) {
  const unit = item?.unit
  return unit ? `${t('logiNumberOf')} ${t('logiLooseShort')} ${unit}` : t('logiLoose')
}

/**
 * Résumé compact "3 Sacs de 0.5 Kg + 1,2 Kg vrac" pour une quantité packed/loose
 * donnée, utilisé partout où l'espace est trop restreint pour les deux champs
 * détaillés (lignes de liste : transferts en attente, pertes).
 */
export function compactQtyLabel(packed, loose, item, unitsPerPack, t, locale, formatUnits) {
  const parts = []
  const unit = item?.unit || ''
  if (packed) {
    parts.push(conditionnementText({ count: packed, packagingType: item?.packagingType, unitsPerPack, unit }, t, locale))
  }
  if (loose) {
    parts.push(`${formatUnits(loose)} ${unit} ${t('logiLooseShort')}`.trim())
  }
  return parts.join(' + ') || `0 ${unit}`.trim()
}

/**
 * Variation signée "+3 fûts de 30 L · -1,2 L vrac" (historique des mouvements) : mêmes règles que
 * compactQtyLabel, avec "+" devant les entrées. Sans variation : "0".
 */
export function deltaQtyLabel(packedDelta, looseDelta, item, unitsPerPack, t, locale, formatUnits) {
  const sign = (n) => (n > 0 ? '+' : '')
  const unit = item?.unit || ''
  const parts = []
  if (packedDelta) {
    const text = conditionnementText({ count: packedDelta, packagingType: item?.packagingType, unitsPerPack, unit }, t, locale)
    parts.push(`${sign(packedDelta)}${text}`)
  }
  if (looseDelta) {
    parts.push(`${sign(looseDelta)}${formatUnits(looseDelta)} ${unit} ${t('logiLooseShort')}`.replace(/\s+/g, ' ').trim())
  }
  return parts.join(' · ') || '0'
}
