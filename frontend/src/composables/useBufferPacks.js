import { computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import {
  marketPriceOf, unitsToPacks, packsToUnits, packLabelOf, bufferPacksText,
} from '@/utils/bufferPackaging'

/**
 * Stock tampon en colis : résout le Market Price d'une référence { name, marketPriceId } dans le
 * catalogue du store (chargé à l'ouverture si besoin) et convertit unités de base <-> colis.
 * Sans Market Price trouvé, contenance 1 et libellé = unité de la ligne.
 *
 * @param {{ autoLoad?: boolean }} [opts] autoLoad (défaut true) : charge le catalogue au montage.
 */
export function useBufferPacks({ autoLoad = true } = {}) {
  const store = useStore()
  const { t, locale } = useI18n()
  const marketPrices = computed(() => store.getters['marketPrices/rows'] || [])

  onMounted(() => {
    if (autoLoad && !marketPrices.value.length) store.dispatch('marketPrices/fetchRows').catch(() => {})
  })

  const mpFor = (ref_) => marketPriceOf(ref_, marketPrices.value)
  return {
    marketPrices,
    mpFor,
    /** Quantité stockée (unités) -> valeur affichée en colis. */
    toPacks: (ref_, units) => unitsToPacks(units, mpFor(ref_)),
    /** Colis saisis -> unités à persister. */
    toUnits: (ref_, packs) => packsToUnits(packs, mpFor(ref_)),
    /** Libellé court du colis (pluriel), ex. « fûts de 20 L ». */
    labelFor: (ref_, plural = true) => packLabelOf(mpFor(ref_), t, locale.value, { plural }),
    /** Texte complet, ex. « 12 fûts de 20 L ». */
    textFor: (ref_, units) => bufferPacksText(units, mpFor(ref_), t, locale.value),
  }
}
