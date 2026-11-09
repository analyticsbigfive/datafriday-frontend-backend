// src/composables/useVentilationLabels.js
//
// Libellés de quantité du mode Ventilation (« 2 fûts de 30 L », « 60 L »), partagés par la
// liste par article, la liste par PdV et l'export. Toujours en conditionnement, jamais de mot vague.

import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { conditionnementText, packSizeText } from '@/utils/packQuantityText'

export function useVentilationLabels() {
  const { t, locale } = useI18n()

  /** Colis décidés au réarmement en priorité, sinon la quantité dans l'unité de l'article. */
  function quantityLabel(item, quantity, packs) {
    if (packs != null) {
      return conditionnementText(
        { count: packs, packagingType: item?.packagingType, unitsPerPack: item?.unitsPerPack, unit: item?.unit },
        t,
        locale.value,
      )
    }
    return `${formatUnits(quantity)}${item?.unit ? ` ${item.unit}` : ''}`
  }

  /** « 30 L/fût » sous le nom de l'article (« 30 L » sans type de conditionnement). */
  function packSizeLabel(item) {
    return packSizeText(item, locale.value)
  }

  return { quantityLabel, packSizeLabel }
}
