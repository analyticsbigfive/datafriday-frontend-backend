import { computed } from 'vue'
import store from '@/store'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import { reconcileRecord } from '@/utils/analyseReconciliation'
import { useReconciliationContext } from '@/composables/useReconciliationContext'

/**
 * Source item-level (grain PdV × article) pour le nouveau Live (`components/live/`),
 * scopée au seul event live — utilisée pour les filtres (PdV/Zones/Types/Menu items),
 * la marge/per-cap (KPI), les donuts de répartition et les tables articles.
 *
 * PAS de second appel réseau : dérivée des lignes MINUTE déjà chargées par
 * `useLiveData` (event-timeline, une seule fois par tick). On enlève la clé
 * temporelle avant `preprocessTimelineRecords` — `aggregateTimeline` regroupe alors
 * en UNE ligne par shop × article (grain summary), exactement la forme que produirait
 * un second appel `granularity=summary` : même scan SQL côté backend
 * (`spaces.service.ts` — les deux granularités partagent la même requête `dedup`,
 * seule la GROUP BY finale diffère), donc rien de différent à recalculer, juste un
 * aller-retour réseau + DB économisé À CHAQUE tick live (audit perf 2026-09-03).
 *
 * Réutilise `reconcileRecord`/`useReconciliationContext` : composables déjà store-free
 * en pratique (ils ne lisent que le catalogue STATIQUE d'espace — `menuItemCostMap`,
 * `menuItems`, `productCategoriesList`… peuplé par `analyse/loadSpace`, cf. LiveView.vue).
 * Rien ici ne touche `filteredEvents`/`activeFilterChips`/`isLiveRoute`, l'état
 * mutable Live-scoped qui causait BUG-304-02/305-02.
 *
 * @param {import('vue').Ref<Array<object>>} timelineRows  lignes minute d'`useLiveData`
 */
export function useLiveItemRecords(timelineRows) {
  const reconciliationCtx = useReconciliationContext()
  const menuItemCostMap = computed(() => store.state.analyse?.menuItemCostMap || {})

  const itemRecords = computed(() => {
    const stripped = timelineRows.value.map((r) => ({ ...r, minute: null, minuteLocal: null }))
    const summary = preprocessTimelineRecords(stripped, { menuItemCostMap: menuItemCostMap.value })
    return summary.map((r) => reconcileRecord(r, reconciliationCtx.value))
  })

  return { itemRecords, menuItemCostMap }
}
