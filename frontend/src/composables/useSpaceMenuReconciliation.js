// Réconciliation SOUPLE menu <-> shop-element-mapping (Règle 1).
//
// Le shop-element-mapping (Weezevent) est une SUGGESTION, jamais une contrainte :
//   - un PDV SANS sélection sauvegardée est pré-rempli depuis le mapping ;
//   - un PDV avec une sélection sauvegardée garde sa sélection telle quelle
//     (les choix utilisateur gagnent toujours, on n'écrase jamais) ;
//   - un badge NON bloquant signale l'écart vs mapping.
//
// Les coeurs de calcul (computeDivergence / seedBlankElements / buildSuggestionsByElement)
// sont des fonctions pures, testables unitairement et réutilisables hors Vue.

import { ref } from 'vue'
import { useStore } from 'vuex'
import { getShopElementMappings } from '@/utils/api'

/** Normalise une sélection en Set<string>. */
function toSet(value) {
  if (value instanceof Set) return value
  if (Array.isArray(value)) return new Set(value)
  return new Set()
}

/**
 * Écart d'un PDV vs sa suggestion mapping.
 * @param {Set<string>|string[]} selected   menu items sélectionnés (choix utilisateur)
 * @param {Set<string>|string[]} suggested  menu items suggérés par le mapping (produits vendus)
 * @returns {{ itemsHorsMapping: string[], produitsNonListes: string[] }}
 *   itemsHorsMapping  = sélectionnés mais hors mapping (selected ∖ suggested)
 *   produitsNonListes = vendus/suggérés mais non listés (suggested ∖ selected)
 */
export function computeDivergence(selected, suggested) {
  const sel = toSet(selected)
  const sug = toSet(suggested)
  const itemsHorsMapping = [...sel].filter((id) => !sug.has(id))
  const produitsNonListes = [...sug].filter((id) => !sel.has(id))
  return { itemsHorsMapping, produitsNonListes }
}

/**
 * Pré-remplit UNIQUEMENT les PDV sans sélection sauvegardée depuis le mapping.
 * Ne touche jamais un PDV déjà configuré (même vidé volontairement) : la présence
 * de la clé dans `savedElementIds` signifie "configuré" -> on ne le re-seed pas.
 *
 * @param {Map<string, Set<string>>} selectedMap        sélection courante (issue du saved)
 * @param {Set<string>|string[]} savedElementIds         elementIds présents dans le saved
 * @param {Map<string, Set<string>>} suggestionsByElement suggestions mapping par element
 * @returns {Map<string, Set<string>>} nouvelle Map (immutable) avec blancs pré-remplis
 */
export function seedBlankElements(selectedMap, savedElementIds, suggestionsByElement) {
  const savedSet = toSet(savedElementIds)
  const out = new Map(selectedMap)
  ;(suggestionsByElement instanceof Map ? suggestionsByElement : new Map()).forEach(
    (suggestedSet, elementId) => {
      // déjà configuré (clé présente dans le saved) -> on respecte le choix utilisateur
      if (savedSet.has(elementId)) return
      // déjà une sélection en mémoire -> on ne l'écrase pas
      if (out.has(elementId) && out.get(elementId)?.size) return
      out.set(elementId, new Set(suggestedSet))
    },
  )
  return out
}

/**
 * Construit suggestionsByElement: Map<elementId, Set<menuItemId>> à partir des
 * shop-element-mappings et d'un résolveur shopId -> rows[] de menu items.
 *
 * Défensif sur la forme des enregistrements de mapping (shopId/shop/shopName)
 * et sur la forme des rows (id/menuItemId). Si le shopId est introuvable ou les
 * menu items inconnus, l'element n'a simplement pas de suggestion (pas de seed).
 *
 * @param {Array} mappings                          [{ elementId, shopId?, shop?, shopName? }]
 * @param {(shopId:string) => Array} getRowsForShop résout les menu items d'un shop
 * @returns {Map<string, Set<string>>}
 */
export function buildSuggestionsByElement(mappings, getRowsForShop) {
  const out = new Map()
  ;(mappings || []).forEach((m) => {
    const elementId = m.elementId || m.spaceElementId || m.element
    const shopId = m.shopId || m.shop?.id || m.shopElementId || m.shop
    if (!elementId || !shopId) return
    const rows = getRowsForShop(shopId) || []
    const ids = rows
      .map((r) => r.id || r.menuItemId || r.menuItemDataId)
      .filter(Boolean)
    if (!ids.length) return
    const existing = out.get(elementId) || new Set()
    ids.forEach((id) => existing.add(id))
    out.set(elementId, existing)
  })
  return out
}

/**
 * Composable réactif : charge les suggestions mapping pour un space et expose
 * les helpers de réconciliation.
 */
export function useSpaceMenuReconciliation() {
  const store = useStore()
  const suggestionsByElement = ref(new Map())
  const mappings = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function loadSuggestions(spaceId) {
    if (!spaceId) {
      suggestionsByElement.value = new Map()
      return new Map()
    }
    loading.value = true
    error.value = null
    try {
      const rawMappings = await getShopElementMappings(spaceId)
      mappings.value = Array.isArray(rawMappings) ? rawMappings : []

      // Précharge les menu items de chaque shop mappé (cache TTL côté store).
      const shopIds = [
        ...new Set(
          mappings.value
            .map((m) => m.shopId || m.shop?.id || m.shopElementId || m.shop)
            .filter(Boolean),
        ),
      ]
      await Promise.all(
        shopIds.map((shopId) =>
          store.dispatch('shopMenuItems/fetchForShop', { shopId }).catch(() => {}),
        ),
      )

      suggestionsByElement.value = buildSuggestionsByElement(
        mappings.value,
        (shopId) => store.getters['shopMenuItems/forShop'](shopId),
      )
      return suggestionsByElement.value
    } catch (e) {
      error.value = e?.message || 'reconciliation-error'
      suggestionsByElement.value = new Map()
      return new Map()
    } finally {
      loading.value = false
    }
  }

  function suggestedForElement(elementId) {
    return suggestionsByElement.value.get(elementId) || new Set()
  }

  function divergenceForElement(elementId, selectedSet) {
    return computeDivergence(selectedSet, suggestedForElement(elementId))
  }

  return {
    suggestionsByElement,
    mappings,
    loading,
    error,
    loadSuggestions,
    suggestedForElement,
    divergenceForElement,
  }
}
