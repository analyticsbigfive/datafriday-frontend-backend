/**
 * useRestockReturnRefresh : revalidation silencieuse de la page Commandes au
 * retour (keepAlive, `mounted` ne se rejoue pas).
 *
 * Ne touche jamais au travail en cours (plan, brouillon, sélections, scénarios)
 * et n'affiche aucun squelette : seules les données de référence sont relues,
 * et chaque étape est indépendante (un échec n'arrête pas les autres).
 */
import { getCurrentInstance } from 'vue'
import * as localDb from '@/data/localDb'
import { useRefreshOnReturn } from '@/composables/useRefreshOnReturn'
import { getSuppliers } from '@/api/endpoints/menu.api'
import { getMenuItemRecipes } from '@/api/endpoints/menu-item.api'
import { normalizeRecipeFromBatch } from '@/utils/bomPlanning'
import { mergeSubComponentsFromCatalog } from '@/utils/componentCatalog'
import { resolvePredictedEventIds } from '@/utils/restockPredictedIds'

/**
 * Catalogue composants : le store frais gagne, la copie hydratée ne sert qu'à
 * compléter les recettes absentes de la liste fraîche.
 */
export function mergeFreshComponents(fresh, hydrated) {
  if (!hydrated?.length) return fresh
  return mergeSubComponentsFromCatalog(fresh, hydrated)
}

const quiet = (promise) => Promise.resolve(promise).catch((e) => {
  console.warn('[restock] revalidation au retour:', e?.message)
})

async function refreshSuppliers(host) {
  const res = await getSuppliers()
  const list = Array.isArray(res) ? res : res?.data || []
  if (list.length) host.bomSuppliers = list
}

async function refreshPredictedEvents(host) {
  const hasLocal = (id) => localDb.getEventPredictVersions(id).length > 0 || host.hasSavedPrediction(id)
  const ids = await resolvePredictedEventIds(host.futureEvents.map((e) => e.id), hasLocal)
  host.predictedEventIds = ids
  await host.syncBddVersions(ids)
  host.refreshSelectedPredictions()
}

/** Relit en bloc les recettes déjà chargées ; remplace d'un coup, sans vider avant. */
async function refreshRecipes(host) {
  const ids = Object.keys(host.recipeByMenuItemId || {})
  // ids vide = tout le tenant côté backend : garde indispensable.
  if (!ids.length) return
  const res = await getMenuItemRecipes(ids)
  const payload = res?.data || res
  const items = Array.isArray(payload?.items) ? payload.items : []
  if (!items.length) return
  const next = { ...host.recipeByMenuItemId }
  items.forEach((dto) => {
    if (dto?.id) next[dto.id] = normalizeRecipeFromBatch(dto)
  })
  host.mergeBomSuppliers(payload?.suppliers)
  host.recipeByMenuItemId = next
}

export function useRestockReturnRefresh(store) {
  const instance = getCurrentInstance()

  async function refresh() {
    const host = instance?.proxy
    // Chargement initial en cours : il lit déjà des données fraîches.
    if (!host || host.loading) return
    const spaceId = host.currentSpace?.id || host.route?.params?.spaceId
    if (!spaceId) return

    // Catalogue (menus, composants, ingrédients, coûts) : revalidation de fond,
    // les listes fraîches remplacent les anciennes sans squelette.
    const sameSpace = String(store.state.analyse?.space?.id) === String(spaceId)
    await Promise.allSettled([
      sameSpace ? quiet(store.dispatch('analyse/useSpaceDataFetch', { spaceId })) : null,
      quiet(store.dispatch('inventory/loadMarketPrices', { forceRefresh: true })),
      quiet(store.dispatch('inventory/loadPackagingTypes', { forceRefresh: true })),
      quiet(host.loadStorageInventory(spaceId, { force: true })),
      quiet(refreshSuppliers(host)),
      quiet(refreshPredictedEvents(host)),
      quiet(host.loadRestockShopAssignment({ force: true })),
      quiet(refreshRecipes(host)),
    ])
    // Recettes des composants : le watcher `components` relance l'hydratation
    // quand le catalogue du store est renouvelé. L'inventaire précédent est
    // relu par `activated()` de la vue.
  }

  useRefreshOnReturn(refresh)
  return { refresh }
}
