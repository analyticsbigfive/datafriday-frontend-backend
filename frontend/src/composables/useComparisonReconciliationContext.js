/**
 * useComparisonReconciliationContext : contexte de réconciliation du rapport de COMPARAISON.
 *
 * Le contexte partagé du principal (useReconciliationContext) ne connaît que les PdV de la
 * configuration choisie sur le principal. Quand la comparaison charge un event rattaché à une
 * AUTRE configuration, le type et la zone de ses PdV ne se résoudraient pas (PdV « non
 * rattachés »). Ce composable construit donc un contexte dont les PdV sont l'UNION de ceux du
 * principal et de ceux des configurations des events chargés.
 *
 * Lecture seule : les contextes PdV des autres configurations sont construits par
 * buildConfigShopEntryReadOnly (aucun commit, cache propre) ; configShopContext du principal
 * n'est jamais écrit et loadAllConfigsShopContext n'est jamais déclenché.
 *
 * Approximations assumées :
 *  - tant que les PdV d'une autre configuration sont en cours de chargement, ou si leur
 *    chargement échoue, ces PdV restent sans type / zone (le reste de la réconciliation est
 *    identique) ; le contexte se complète dès que le chargement aboutit ;
 *  - un event sans lien de configuration (ni configurationId, ni listé dans eventIds) ne peut
 *    pas être rattaché à une configuration : ses PdV hors config du principal restent non résolus.
 */
import { computed, ref, unref, watch } from 'vue'
import defaultStore from '@/store'
import { useReconciliationContext } from '@/composables/useReconciliationContext'
import { buildReconciliationContext } from '@/utils/analyseReconciliation'
import { buildConfigShopEntryReadOnly, mergeShopEntries } from '@/store/modules/analyse'

/** Identifiants de configuration auxquels un event est rattaché. */
export function configIdsOfEvent(event, configurations = []) {
  const ids = new Set()
  if (event?.configurationId) ids.add(String(event.configurationId))
  for (const c of configurations) {
    if (c?.id && c.id !== 'cfg-all' && (c.eventIds || []).includes(event?.id)) ids.add(String(c.id))
  }
  return ids
}

/**
 * Configurations à ajouter au contexte du principal : celles des events chargés, moins celle
 * déjà couverte par le principal. Principal sur « Toutes les configurations » : déjà l'union.
 */
export function missingConfigIds(events, configurations, principalConfigId, coveredConfigId) {
  if (!principalConfigId || principalConfigId === 'cfg-all') return []
  const known = new Set((configurations || []).filter((c) => c?.id).map((c) => String(c.id)))
  const out = new Set()
  for (const e of events || []) {
    for (const id of configIdsOfEvent(e, configurations)) {
      if (id !== String(principalConfigId) && id !== String(coveredConfigId || '') && known.has(id)) out.add(id)
    }
  }
  return [...out].sort()
}

/**
 * @param {Object} p
 * @param {import('vue').Ref<Array>} p.events  events chargés par la comparaison
 * @param {object} [p.store]
 * @returns {import('vue').ComputedRef<object>} contexte de réconciliation (le partagé si rien à ajouter)
 */
export function useComparisonReconciliationContext({ events, store = defaultStore }) {
  const shared = store === defaultStore ? useReconciliationContext() : null
  const entries = ref({}) // configId -> entrée PdV (lecture seule)

  const state = () => store.state.analyse || {}
  const ids = computed(() => missingConfigIds(
    unref(events),
    state().configurations || [],
    state().filters?.selectedConfigurationId || null,
    state().configShopContext?.configId || null,
  ))

  async function load(configIds) {
    const spaceId = state().spaceId || state().space?.id
    if (!spaceId) return
    for (const id of configIds) {
      if (entries.value[id]) continue
      try {
        const entry = await buildConfigShopEntryReadOnly(spaceId, id, {
          state: state(), dispatch: store.dispatch, rootGetters: store.getters,
        })
        entries.value = { ...entries.value, [id]: entry }
      } catch (_) {
        /* PdV de cette config sans type ni zone : approximation documentée plus haut */
      }
    }
  }
  watch(ids, (list) => { if (list.length) load(list) }, { immediate: true })

  return computed(() => {
    const extra = ids.value.map((id) => entries.value[id]).filter(Boolean)
    if (!extra.length && shared) return shared.value
    const a = state()
    const base = { floorElements: a.configShopContext?.floorElements || [] }
    return buildReconciliationContext({
      menuItems: a.menuItems || [],
      productCategories: a.productCategoriesList || [],
      productTypes: a.productTypesList || [],
      floorElements: mergeShopEntries([base, ...extra]).floorElements,
      weezeventProducts: a.weezeventProducts || [],
    })
  })
}
