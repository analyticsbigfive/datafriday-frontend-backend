// src/composables/useLogisticUnitLabels.js
// Libellés "3 Sacs de 0.5 Kg" / "Nombre de vrac Kg" partagés entre les écrans
// Logistique (LogisticItemCard, LogisticMovementDialog, LogisticTransferConfirmDrawer,
// LogisticLossesDrawer) : une denrée sans unité affichée ne dit rien de ce qui a
// réellement été transféré/perdu (juste "3", 3 quoi ?).

import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

/** Libellé du champ "Packed" : type de conditionnement + capacité si connu
 *  (ex. "Nombre de Sacs de 0.5 Kg"), sinon le mot générique "Packed"/"Emballé". */
export function packedLabel(item, unitsPerPack, t, locale) {
  const type = translatePackagingType(item?.packagingType, locale)
  if (type && unitsPerPack) {
    return `${t('logiNumberOf')} ${pluralize(type)} ${t('logiPackagingOf')} ${unitsPerPack} ${item?.unit || ''}`.trim()
  }
  return t('logiPacked')
}

/** Libellé du champ "Loose" : porte l'unité réelle de la denrée si connue. */
export function looseUnitLabel(item, t) {
  const unit = item?.unit
  return unit ? `${t('logiNumberOf')} ${t('logiLooseShort')} ${unit}` : t('logiLoose')
}

/**
 * Résumé compact "3 Sacs (0.5 Kg) + 1,2 Kg vrac" pour une quantité packed/loose
 * donnée, utilisé partout où l'espace est trop restreint pour les deux champs
 * détaillés (lignes de liste : transferts en attente, pertes).
 */
export function compactQtyLabel(packed, loose, item, unitsPerPack, t, locale, formatUnits) {
  const parts = []
  const type = translatePackagingType(item?.packagingType, locale)
  const unit = item?.unit || ''
  if (packed) {
    const packWord = type ? pluralize(type) : t('logiPacked')
    const size = unitsPerPack ? ` (${unitsPerPack} ${unit})`.trim() : ''
    parts.push(`${packed} ${packWord}${size}`)
  }
  if (loose) {
    parts.push(`${formatUnits(loose)} ${unit} ${t('logiLooseShort')}`.trim())
  }
  return parts.join(' + ') || `0 ${unit}`.trim()
}
