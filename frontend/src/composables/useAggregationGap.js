import { computed, unref } from 'vue'
import { findEventsMissingSalesDetail } from '@/utils/analyseAggregationGap'

/**
 * Events au CA enregistré mais sans détail de vente (voir `findEventsMissingSalesDetail`).
 *
 * Ne publie rien tant que la source item-level n'est pas terminale, ni quand son chargement a
 * échoué : un batch KO pose `[]` pour chaque event, ce qui ressemblerait à tort à des agrégats
 * manquants. Inactif en mode Predict (le détail y vient d'une autre source).
 *
 * @returns {{ gapEvents: import('vue').ComputedRef<Array<object>> }}
 */
export function useAggregationGap({ events, itemRecords, loadedEventIds, sourceState, fetchError, isPredict }) {
  const gapEvents = computed(() => {
    if (unref(isPredict)) return []
    if (unref(fetchError)) return []
    if (unref(sourceState) === 'loading') return []
    return findEventsMissingSalesDetail({
      events: unref(events),
      itemRecords: unref(itemRecords),
      loadedEventIds: unref(loadedEventIds),
    })
  })
  return { gapEvents }
}
