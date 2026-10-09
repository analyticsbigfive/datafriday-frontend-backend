// src/composables/useVentilationLabels.js
//
// Libellés de quantité du mode Ventilation (« 2 Fûts », « 60 L »), partagés par la
// liste par article, la liste par PdV et l'export.

import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

export function useVentilationLabels() {
  const { t, locale } = useI18n()

  /** Type de conditionnement traduit (« Carton », « Fût »), repli sur « pack ». */
  function packagingWord(item, count) {
    const type = translatePackagingType(item?.packagingType, locale.value)
    if (!type) return t('logiPacksShort')
    return count > 1 ? pluralize(type) : type
  }

  /** Packs décidés au réarmement en priorité, sinon la quantité dans l'unité de l'article. */
  function quantityLabel(item, quantity, packs) {
    if (packs != null) return `${formatUnits(packs)} ${packagingWord(item, packs)}`
    return `${formatUnits(quantity)}${item?.unit ? ` ${item.unit}` : ''}`
  }

  /** « 30 L/Fût » sous le nom de l'article. */
  function packSizeLabel(item) {
    if (!item?.unitsPerPack) return ''
    return `${formatUnits(item.unitsPerPack)} ${item.unit || t('logiUnits')}/${packagingWord(item, 1)}`
  }

  return { packagingWord, quantityLabel, packSizeLabel }
}
