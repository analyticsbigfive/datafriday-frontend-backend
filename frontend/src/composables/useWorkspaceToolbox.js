import { computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import { safePush } from '@/utils/chunkReload'

/**
 * Liste unique des outils du workspace espace (parapluie space-workspace) — source unique
 * pour le sélecteur d'outils desktop (WorkspaceToolSelect) ET le drawer mobile
 * (WorkspaceMobileToolDrawer). Remplace les copies locales `TOOLBOX_ITEMS` dupliquées dans
 * chaque vue (Logistic/Inventory/EventPredict/Restock).
 */
export const WORKSPACE_TOOLBOX_ITEMS = [
  { value: 'analyse', labelKey: 'srToolAnalyse', icon: 'mdi-chart-line', permission: 'front.fb.analyse' },
  { value: 'cost-tracking', labelKey: 'srToolCostTracking', icon: 'mdi-cash-multiple', permission: 'front.fb.costTracking' },
  { value: 'predict', labelKey: 'srToolPredict', icon: 'mdi-trending-up', permission: 'front.fb.predict' },
  { value: 'event-predict', labelKey: 'srToolEventPredict', icon: 'mdi-lightning-bolt', permission: 'front.fb.eventPredict' },
  { value: 'live', labelKey: 'srToolLive', icon: 'mdi-record-circle-outline', permission: 'front.fb.live' },
  { value: 'space-pre-inventory', labelKey: 'invToolPreInventory', icon: 'mdi-clipboard-arrow-up-outline', permission: 'front.fb.spaceInventory' },
  { value: 'space-inventory', labelKey: 'srToolSpaceInventory', icon: 'mdi-package-variant', permission: 'front.fb.spaceInventory' },
  { value: 'logistic', labelKey: 'srToolLogistic', icon: 'mdi-forklift', permission: 'front.fb.logistic' },
  { value: 'restock', labelKey: 'srToolRestock', icon: 'mdi-truck-delivery-outline', permission: ['front.fb.restock', 'front.fb.restockBoard'] },
  { value: 'pos', labelKey: 'srToolPos', icon: 'mdi-point-of-sale', permission: 'front.fb.pos' },
]

/**
 * Destination router d'un outil pour un espace donné. Pure (pas de route courante) : sert
 * aussi au menu d'outils de la carte espace, hors de toute route `/spaces/:spaceId/...`.
 * Live/Inventory/Logistic/... = routes dédiées ; predict/event-predict = mode `?toolbox=`
 * d'Analyse.
 */
export function resolveToolLocation(tool, spaceId, ev = null) {
  const params = { spaceId }
  const query = ev ? { event: ev } : {}
  switch (tool.value) {
    case 'analyse': return { name: 'space-analyse', params }
    case 'cost-tracking': return { name: 'space-cost-tracking', params }
    case 'live': return { name: 'space-live', params }
    case 'logistic': return { name: 'space-logistic', params }
    case 'space-inventory': return { name: 'space-inventory', params, query }
    case 'space-pre-inventory': return { name: 'space-pre-inventory', params, query }
    case 'pos': return { name: 'space-pos', params, query }
    case 'restock': return { name: 'space-restock', params, query }
    default: return { name: 'space-analyse', params, query: { toolbox: tool.value } }
  }
}

/** Outils visibles pour l'utilisateur (permissions RBAC), libellés i18n résolus. */
export function filterToolboxItems(can, t) {
  return WORKSPACE_TOOLBOX_ITEMS
    .filter((tool) => {
      if (typeof can !== 'function' || !tool.permission) return true
      return Array.isArray(tool.permission)
        ? tool.permission.some((permission) => can(permission))
        : can(tool.permission)
    })
    .map((tool) => ({ ...tool, label: t(tool.labelKey) }))
}

/**
 * Composable partagé pour la barre d'outils du workspace (Composition API).
 * @param {string} currentValue - clé de l'outil courant (ex. 'analyse'), pour désactiver
 *   l'auto-navigation et marquer l'entrée active.
 * @returns { toolboxItems, onToolboxSelect, navigateToTool }
 */
export function useWorkspaceToolbox(currentValue) {
  const store = useStore()
  const router = useRouter()
  const route = useRoute()
  const { t } = useI18n()

  // Filtré par permission (RBAC) + libellé i18n résolu.
  const toolboxItems = computed(() => filterToolboxItems(store.getters['auth/can'], t))

  // Routing : voir resolveToolLocation.
  function navigateToTool(tool) {
    if (!tool || tool.value === currentValue) return
    const spaceId = route.params.spaceId
    const ev = route.query?.event || null
    // safePush : une navigation rejetée est journalisée au lieu de disparaître (BUG-389-02).
    safePush(router, resolveToolLocation(tool, spaceId, ev))
  }

  function onToolboxSelect(value) {
    const tool = WORKSPACE_TOOLBOX_ITEMS.find((item) => item.value === value)
    if (tool) navigateToTool(tool)
  }

  return { toolboxItems, onToolboxSelect, navigateToTool }
}
