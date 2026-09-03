import { computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'

/**
 * Liste unique des outils du workspace espace (parapluie space-workspace) — source unique
 * pour le sélecteur d'outils desktop (WorkspaceToolSelect) ET le drawer mobile
 * (WorkspaceMobileToolDrawer). Remplace les copies locales `TOOLBOX_ITEMS` dupliquées dans
 * chaque vue (Logistic/Inventory/EventPredict/Restock).
 */
export const WORKSPACE_TOOLBOX_ITEMS = [
  { value: 'analyse', labelKey: 'srToolAnalyse', icon: 'mdi-chart-line', permission: 'front.fb.analyse' },
  { value: 'predict', labelKey: 'srToolPredict', icon: 'mdi-trending-up', permission: 'front.fb.predict' },
  { value: 'event-predict', labelKey: 'srToolEventPredict', icon: 'mdi-lightning-bolt', permission: 'front.fb.eventPredict' },
  { value: 'live', labelKey: 'srToolLive', icon: 'mdi-record-circle-outline', permission: 'front.fb.live' },
  { value: 'space-pre-inventory', labelKey: 'invToolPreInventory', icon: 'mdi-clipboard-arrow-up-outline', permission: 'front.fb.spaceInventory' },
  { value: 'space-inventory', labelKey: 'srToolSpaceInventory', icon: 'mdi-package-variant', permission: 'front.fb.spaceInventory' },
  { value: 'logistic', labelKey: 'srToolLogistic', icon: 'mdi-forklift', permission: 'front.fb.logistic' },
  { value: 'restock', labelKey: 'srToolRestock', icon: 'mdi-truck-delivery-outline', permission: ['front.fb.restock', 'front.fb.restockBoard'] },
]

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

  // Filtré par permission (RBAC) + libellé i18n résolu — miroir des computed locaux existants.
  const toolboxItems = computed(() => {
    const can = store.getters['auth/can']
    return WORKSPACE_TOOLBOX_ITEMS
      .filter((tool) => {
        if (typeof can !== 'function' || !tool.permission) return true
        return Array.isArray(tool.permission)
          ? tool.permission.some((permission) => can(permission))
          : can(tool.permission)
      })
      .map((tool) => ({ ...tool, label: t(tool.labelKey) }))
  })

  // Routing identique à navigateToTool() des vues (Live/Inventory = routes dédiées ; predict/
  // event-predict = mode `?toolbox=` d'Analyse).
  function navigateToTool(tool) {
    if (!tool || tool.value === currentValue) return
    const spaceId = route.params.spaceId
    const ev = route.query?.event || null
    if (tool.value === 'analyse') {
      router.push({ name: 'space-analyse', params: { spaceId } })
    } else if (tool.value === 'live') {
      router.push({ name: 'space-live', params: { spaceId } })
    } else if (tool.value === 'space-inventory') {
      router.push({ name: 'space-inventory', params: { spaceId }, query: ev ? { event: ev } : {} })
    } else if (tool.value === 'space-pre-inventory') {
      router.push({ name: 'space-pre-inventory', params: { spaceId }, query: ev ? { event: ev } : {} })
    } else if (tool.value === 'restock') {
      router.push({ name: 'space-restock', params: { spaceId }, query: ev ? { event: ev } : {} })
    } else {
      router.push({ name: 'space-analyse', params: { spaceId }, query: { toolbox: tool.value } })
    }
  }

  function onToolboxSelect(value) {
    const tool = WORKSPACE_TOOLBOX_ITEMS.find((item) => item.value === value)
    if (tool) navigateToTool(tool)
  }

  return { toolboxItems, onToolboxSelect, navigateToTool }
}
