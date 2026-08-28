<template>
  <div class="lgt-content">
    <v-alert v-if="error" type="error" density="compact" variant="tonal" class="lgt-alert">{{ error }}</v-alert>

    <!-- Statut d'abord (retour utilisateur 08/2026) : un onglet PAR statut, au-dessus
         du détail par staff, plus de compteurs inertes nichés dans un bloc staff replié,
         cliquer un onglet montre TOUT le monde à ce statut. -->
    <div class="lgt-tabs" role="tablist">
      <button
        v-for="tab in statusTabs"
        :key="tab.status"
        type="button"
        role="tab"
        class="lgt-tab"
        :aria-selected="activeStatus === tab.status"
        @click="activeStatus = tab.status"
      >
        {{ tab.label }} <span class="lgt-tab-count">{{ countByStatus(tab.status) }}</span>
      </button>
    </div>

    <div class="lgt-scroll">
      <div v-if="!loading && !activeStaffGroups.length" class="lgt-empty">
        <v-icon size="26" class="mb-2">mdi-clipboard-text-off-outline</v-icon>
        <div>{{ t('lgTasksEmpty') }}</div>
      </div>

      <div v-for="group in activeStaffGroups" :key="group.key" class="lgt-staff-group">
        <div class="lgt-staff-label">
          <v-icon size="14" class="mr-1">mdi-account-circle-outline</v-icon>
          {{ group.name }}
        </div>

        <div v-for="task in group.tasks" :key="task.id" class="lgt-task">
          <div class="lgt-task-summary">
            <span class="lgt-priority-dot" :style="{ background: priorityColor(task.priority) }" />
            <span>{{ taskQtyLabel(task) }} {{ itemNameLabel(task) }}</span>
          </div>

          <template v-if="task.status === 'COMPLETED'">
            <div class="lgt-task-done">
              <v-icon size="14" color="success" class="mr-1">mdi-check-circle</v-icon>
              {{ t('restockFrom') }} {{ task.sourceElementName }} {{ t('restockTo') }} {{ task.destinationElementName }}
            </div>
          </template>
          <template v-else>
            <label class="lgt-check" :class="{ 'lgt-check--done': task.status !== 'PENDING' }">
              <input
                type="checkbox"
                :checked="task.status !== 'PENDING'"
                :disabled="task.status !== 'PENDING' || isActing(task.id)"
                @change="onPickup(task)"
              />
              <span>{{ t('lgTasksPickup') }} {{ taskQtyLabel(task) }} {{ itemNameLabel(task) }} {{ t('lgTasksAt') }} {{ task.sourceElementName }}</span>
              <v-progress-circular v-if="isActing(task.id) && task.status === 'PENDING'" size="14" width="2" indeterminate class="ml-1" />
            </label>
            <label class="lgt-check" :class="{ 'lgt-check--done': task.status === 'COMPLETED' }">
              <input
                type="checkbox"
                :checked="task.status === 'COMPLETED'"
                :disabled="task.status !== 'PICKED_UP' || isActing(task.id)"
                @change="onDrop(task)"
              />
              <span>{{ t('lgTasksDrop') }} {{ taskQtyLabel(task) }} {{ itemNameLabel(task) }} {{ t('lgTasksAt') }} {{ task.destinationElementName }}</span>
              <v-progress-circular v-if="isActing(task.id) && task.status === 'PICKED_UP'" size="14" width="2" indeterminate class="ml-1" />
            </label>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { compactQtyLabel } from '@/composables/useLogisticUnitLabels'
import { getLogisticTasks, pickupLogisticTask, dropLogisticTask } from '@/api/endpoints/logistic-tasks.api'
import { groupLogisticTasksByStaff } from '@/utils/logisticTaskBoard'
import { priorityColor } from '@/utils/logisticTaskPriority'

const POLL_MS = 20000

/**
 * Panneau "Tasks" (mockup "Déclenchement d'un restockage dans Logistique", 08/2026) :
 * exécution des LogisticTask créées par le drawer Restocker (Live inventory). Un
 * groupe par staff assigné (Pending/Ongoing/Closed = PENDING/PICKED_UP/COMPLETED),
 * deux checkboxes par tâche ouverte (Récupérer/Déposer) qui délèguent directement au
 * ledger StockMovement déjà en place (LogisticTasksService.pickup/drop), ce composant
 * ne recalcule ni ne duplique aucune règle de stock, il déclenche et affiche.
 *
 * Emplacement : 3e colonne de SpaceLogisticView.vue (grid déjà réservée à 340px,
 * `.lg-layout`), visible dès qu'on n'est pas en vue détail (`!drillElement`).
 */
export default {
  name: 'LogisticTasksPanel',
  props: {
    spaceId: { type: String, required: true },
  },
  setup() {
    const store = useStore()
    const { t, locale } = useI18n()
    return { store, t, locale, formatUnits, priorityColor }
  },
  data() {
    return {
      tasks: [],
      loading: false,
      error: null,
      activeStatus: 'PENDING', // 'PENDING' | 'PICKED_UP' | 'COMPLETED'
      actingTaskIds: {},
      pollTimer: null,
      _reqId: 0,
    }
  },
  computed: {
    statusTabs() {
      return [
        { status: 'PENDING', label: this.t('lgTasksPending') },
        { status: 'PICKED_UP', label: this.t('lgTasksOngoing') },
        { status: 'COMPLETED', label: this.t('lgTasksClosed') },
      ]
    },
    groups() {
      return groupLogisticTasksByStaff(this.tasks)
    },
    /** Groupes staff réduits au statut de l'onglet actif, le staff n'est plus qu'un
     *  sous-libellé de regroupement, jamais un conteneur replié qui cache le reste. */
    activeStaffGroups() {
      const arrayKey = { PENDING: 'pending', PICKED_UP: 'ongoing', COMPLETED: 'closed' }[this.activeStatus]
      return this.groups
        .map((g) => ({ key: g.key, name: g.name, tasks: g[arrayKey] }))
        .filter((g) => g.tasks.length)
    },
  },
  watch: {
    spaceId() {
      this.fetchTasks()
    },
  },
  mounted() {
    this.fetchTasks()
    this.pollTimer = setInterval(this.fetchTasks, POLL_MS)
  },
  beforeUnmount() {
    if (this.pollTimer) clearInterval(this.pollTimer)
  },
  methods: {
    async fetchTasks() {
      if (!this.spaceId) return
      const reqId = ++this._reqId
      this.loading = true
      try {
        const res = (await getLogisticTasks(this.spaceId)) || []
        if (reqId !== this._reqId) return // réponse obsolète (changement d'espace pendant le vol)
        this.tasks = res
        this.error = null
      } catch (e) {
        if (reqId !== this._reqId) return
        this.error = e?.userMessage || e?.message || this.t('lgTasksErrorLoad')
      } finally {
        if (reqId === this._reqId) this.loading = false
      }
    },
    resolveItem(task) {
      return this.store.getters['logistics/itemByKey'](task.itemKey)
    },
    taskQtyLabel(task) {
      const item = this.resolveItem(task)
      return compactQtyLabel(task.packedQty, task.looseQty, item, item?.unitsPerPack, this.t, this.locale, formatUnits)
    },
    itemNameLabel(task) {
      return this.resolveItem(task)?.name || task.itemKey
    },
    countByStatus(status) {
      return this.tasks.filter((t) => t.status === status).length
    },
    isActing(id) {
      return !!this.actingTaskIds[id]
    },
    /** Rafraîchit aussi le stock Logistic (store `logistics`) : le pickup/drop décrémente
     *  StockLevel côté backend, sans ça les cartes items de l'écran principal resteraient
     *  périmées jusqu'à un reload manuel (même défaut que corrigé sur RestockerDrawer). */
    async refreshStock() {
      await this.store.dispatch('logistics/loadStock', { spaceId: this.spaceId })
    },
    async onPickup(task) {
      if (task.status !== 'PENDING' || this.isActing(task.id)) return
      this.actingTaskIds = { ...this.actingTaskIds, [task.id]: true }
      try {
        await pickupLogisticTask(task.id)
        await Promise.all([this.fetchTasks(), this.refreshStock()])
      } catch (e) {
        this.error = e?.userMessage || e?.message || this.t('lgTasksErrorPickup')
      } finally {
        const next = { ...this.actingTaskIds }
        delete next[task.id]
        this.actingTaskIds = next
      }
    },
    async onDrop(task) {
      if (task.status !== 'PICKED_UP' || this.isActing(task.id)) return
      this.actingTaskIds = { ...this.actingTaskIds, [task.id]: true }
      try {
        await dropLogisticTask(task.id)
        await Promise.all([this.fetchTasks(), this.refreshStock()])
      } catch (e) {
        this.error = e?.userMessage || e?.message || this.t('lgTasksErrorDrop')
      } finally {
        const next = { ...this.actingTaskIds }
        delete next[task.id]
        this.actingTaskIds = next
      }
    },
  },
}
</script>

<style scoped>
/* Carte/en-tête retirés (08/2026) : contenu affiché dans un SidebarPanel, qui
   possède désormais la carte, le titre et le chevron d'ouverture/fermeture. */
.lgt-content { display: flex; flex-direction: column; gap: 10px; }

.lgt-alert { margin: 0; }

/* Statut d'abord : un onglet par statut, au-dessus du détail par staff. */
.lgt-tabs { display: flex; gap: 4px; background: rgba(0, 0, 0, 0.04); border-radius: 10px; padding: 3px; flex-shrink: 0; }
.lgt-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; background: transparent;
  padding: 7px 6px; border-radius: 8px; font-size: 11.5px; font-weight: 700; color: inherit; opacity: 0.65; cursor: pointer;
}
.lgt-tab:hover { opacity: 0.9; }
.lgt-tab[aria-selected="true"] { opacity: 1; background: rgb(var(--v-theme-surface)); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.lgt-tab-count { font-size: 10.5px; padding: 1px 6px; border-radius: 8px; background: rgba(0, 0, 0, 0.08); }

/* Plafond fixe, indépendant des sections voisines (même principe que LogisticAggregateView) :
   une longue liste scrolle sur elle-même sans jamais forcer la hauteur des autres sections. */
.lgt-scroll { max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 2px; }

.lgt-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; opacity: 0.5; font-size: 12px; padding: 20px; }

.lgt-staff-group { display: flex; flex-direction: column; gap: 6px; }
.lgt-staff-label { display: flex; align-items: center; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.55; }

.lgt-task { display: flex; flex-direction: column; gap: 4px; padding: 8px 9px; border-radius: 8px; background: rgba(0, 0, 0, 0.03); }
.lgt-task-summary { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
.lgt-priority-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

.lgt-check { display: flex; align-items: center; gap: 6px; font-size: 11.5px; padding-left: 13px; cursor: pointer; }
.lgt-check input[type='checkbox'] { flex-shrink: 0; cursor: pointer; }
.lgt-check input[type='checkbox']:disabled { cursor: default; }
.lgt-check--done span { opacity: 0.55; text-decoration: line-through; }

.lgt-task-done { display: flex; align-items: center; font-size: 11.5px; padding-left: 13px; opacity: 0.7; }
</style>
