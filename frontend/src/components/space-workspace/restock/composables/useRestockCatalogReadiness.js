/**
 * useRestockCatalogReadiness — état « catalogue prêt » de la page Commandes.
 *
 * Remplace l'ancienne coupure à 6 s (`waitForMenuItems`) qui affichait la page
 * « finie » avec un catalogue partiel quand le backend était lent (cold start
 * Render, jusqu'à ~60 s). Le squelette reste tant que menuItems, composants et
 * coûts Market Price ne sont NI arrivés NI en échec définitif (après les essais
 * de `utils/retryRequest`).
 *
 * Signaux lus dans le store :
 *  - analyse.recipeCatalogLoaded : la vague 2b (composants) a livré son résultat ;
 *  - analyse.catalogLoadErrors   : échec définitif par ressource catalogue ;
 *  - inventory.marketPricesCachedAt / marketPricesError ;
 *  - marketPriceTypes.loadError / marketPriceCategories.loadError (filtres).
 */
import { computed, watch } from 'vue'

/** Garde-fou : au-delà, on rend la main (le bandeau d'erreur prend le relais). */
export const CATALOG_WAIT_MAX_MS = 150000

const ANALYSE_KEYS = ['menuItems', 'ingredients', 'components', 'packagings']
// Ressources de la vague 2b (catalogue recette).
const RECIPE_KEYS = ['ingredients', 'components', 'packagings']

/** Pure : { ready, failures[] } depuis un snapshot de state (testable sans Vue). */
export function computeCatalogReadiness(state) {
  const analyse = state?.analyse || {}
  const errors = analyse.catalogLoadErrors || {}
  const items = analyse.menuItems || []
  const catalogLoaded = !!analyse.recipeCatalogLoaded
  const inventory = state?.inventory || {}

  const failures = ANALYSE_KEYS.filter((k) => errors[k])
  if (inventory.marketPricesError) failures.push('marketPrices')
  if (state?.marketPriceTypes?.loadError) failures.push('marketPriceTypes')
  if (state?.marketPriceCategories?.loadError) failures.push('marketPriceCategories')

  const menuSettled = items.length > 0 || !!errors.menuItems || catalogLoaded
  // Composants : la vague 2b a livré (recipeCatalogLoaded) ou une de ses ressources
  // a échoué (recipeCatalogLoaded reste alors faux, il ne faut pas attendre en vain).
  const componentsSettled = catalogLoaded || RECIPE_KEYS.some((k) => errors[k])
  const pricesSettled = inventory.marketPricesCachedAt != null || !!inventory.marketPricesError

  return { ready: menuSettled && componentsSettled && pricesSettled, failures }
}

export function useRestockCatalogReadiness(store) {
  const readiness = computed(() => computeCatalogReadiness(store.state))
  const catalogReady = computed(() => readiness.value.ready)
  const catalogFailures = computed(() => readiness.value.failures)
  const hasCatalogFailure = computed(() => catalogFailures.value.length > 0)

  /** Résout true quand le catalogue est prêt, false si le garde-fou expire. */
  function waitUntilReady(timeoutMs = CATALOG_WAIT_MAX_MS) {
    return new Promise((resolve) => {
      if (catalogReady.value) { resolve(true); return }
      let stop = null
      const timer = setTimeout(() => { if (stop) stop(); resolve(false) }, timeoutMs)
      stop = watch(catalogReady, (ready) => {
        if (!ready) return
        clearTimeout(timer)
        stop()
        resolve(true)
      })
    })
  }

  /** Relance UNIQUEMENT les ressources en échec. */
  async function retryFailed(spaceId) {
    const failed = catalogFailures.value
    const jobs = []
    if (failed.some((k) => ANALYSE_KEYS.includes(k)) && spaceId) {
      // loadSpace forcé : recharge le catalogue (menuItems, composants, ingrédients, packagings).
      jobs.push(store.dispatch('analyse/loadSpace', { spaceId, force: true }))
    }
    if (failed.includes('marketPrices')) {
      jobs.push(store.dispatch('inventory/loadMarketPrices', { forceRefresh: true }))
    }
    if (failed.includes('marketPriceTypes')) {
      jobs.push(store.dispatch('marketPriceTypes/fetchMarketPriceTypes', { forceRefresh: true }).catch(() => {}))
    }
    if (failed.includes('marketPriceCategories')) {
      jobs.push(store.dispatch('marketPriceCategories/fetchMarketPriceCategories', { forceRefresh: true }).catch(() => {}))
    }
    await Promise.all(jobs)
  }

  return { catalogReady, catalogFailures, hasCatalogFailure, waitUntilReady, retryFailed }
}
