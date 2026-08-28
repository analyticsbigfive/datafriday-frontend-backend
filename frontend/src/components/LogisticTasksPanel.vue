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

    <!-- Regroupement au choix (retour utilisateur 08/2026) : par staff (défaut), par
         article (quantité totale visible d'un coup), ou par lieu (retrait/dépôt) pour
         organiser une tournée physique plutôt que par personne. -->
    <div class="lgt-groupby">
      <span class="lgt-groupby-label">{{ t('lgTasksGroupBy') }}</span>
      <select v-model="groupBy" class="lgt-groupby-select">
        <option value="staff">{{ t('lgTasksGroupStaff') }}</option>
        <option value="item">{{ t('lgTasksGroupItem') }}</option>
        <option value="source">{{ t('lgTasksGroupSource') }}</option>
        <option value="destination">{{ t('lgTasksGroupDestination') }}</option>
      </select>
    </div>

    <!-- Recherche + "mes tâches" (retour utilisateur 08/2026) : utile dès que la liste
         dépasse quelques tâches, notamment pour un logisticien qui veut isoler les siennes. -->
    <div class="lgt-filters-row">
      <div class="lgt-search">
        <v-icon size="14" class="lgt-search-icon">mdi-magnify</v-icon>
        <input v-model="searchQuery" type="text" class="lgt-search-input" :placeholder="t('lgTasksSearchPlaceholder')" />
      </div>
      <button
        type="button"
        class="lgt-mine-toggle"
        :class="{ 'lgt-mine-toggle--active': onlyMine }"
        :disabled="!currentUserId"
        @click="onlyMine = !onlyMine"
      >
        {{ t('lgTasksOnlyMine') }}
      </button>
    </div>

    <div class="lgt-scroll">
      <div v-if="!loading && !activeGroups.length" class="lgt-empty">
        <v-icon size="26" class="mb-2">mdi-clipboard-text-off-outline</v-icon>
        <div>{{ t('lgTasksEmpty') }}</div>
      </div>

      <div v-for="group in activeGroups" :key="group.key" class="lgt-group">
        <div class="lgt-group-head">
          <v-icon size="14" class="mr-1">{{ groupIcon }}</v-icon>
          <span class="lgt-group-label">{{ group.label }}</span>
          <span class="lgt-group-total">{{ groupTotalLabel(group) }}</span>
        </div>

        <button
          v-if="showBulkButton(group)"
          type="button"
          class="lgt-bulk-btn"
          :disabled="!!bulkActingKeys[group.key]"
          @click="onBulk(group)"
        >
          <v-progress-circular v-if="bulkActingKeys[group.key]" size="12" width="2" indeterminate class="mr-1" />
          {{ bulkLabel }} ({{ group.tasks.length }})
        </button>

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
                :disabled="isActing(task.id)"
                @change="onTogglePickup(task)"
              />
              <span>{{ t('lgTasksPickup') }} {{ taskQtyLabel(task) }} {{ itemNameLabel(task) }} {{ t('lgTasksAt') }} {{ task.sourceElementName }}</span>
              <v-progress-circular v-if="isActing(task.id)" size="14" width="2" indeterminate class="ml-1" />
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
import { getLogisticTasks, pickupLogisticTask, dropLogisticTask, undoPickupLogisticTask } from '@/api/endpoints/logistic-tasks.api'
import { groupTasksByDimension } from '@/utils/logisticTaskBoard'
import { priorityColor } from '@/utils/logisticTaskPriority'

const GROUP_ICONS = {
  staff: 'mdi-account-circle-outline',
  item: 'mdi-package-variant',
  source: 'mdi-map-marker-outline',
  destination: 'mdi-map-marker-check-outline',
}

const POLL_MS = 20000

/**
 * Panneau "Tasks" (mockup "Déclenchement d'un restockage dans Logistique", 08/2026) :
 * exécution des LogisticTask créées par le drawer Restocker (Live inventory). Statut
 * d'abord (onglets Pending/Ongoing/Closed = PENDING/PICKED_UP/COMPLETED), puis
 * regroupement au choix (staff/article/lieu, groupTasksByDimension) avec quantité
 * totale par article et action groupée (Tout récupérer/déposer) quand un groupe compte
 * plusieurs tâches. Deux checkboxes par tâche ouverte (Récupérer/Déposer) qui délèguent
 * directement au ledger StockMovement déjà en place (LogisticTasksService.pickup/drop),
 * ce composant ne recalcule ni ne duplique aucune règle de stock, il déclenche et affiche.
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
      groupBy: 'staff', // 'staff' | 'item' | 'source' | 'destination'
      searchQuery: '',
      onlyMine: false,
      actingTaskIds: {},
      bulkActingKeys: {},
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
    currentUserId() {
      return this.store.getters['auth/userId']
    },
    /** Recherche + "mes tâches" appliquées à TOUS les statuts (pas seulement l'onglet
     *  actif) : les compteurs des onglets (countByStatus) doivent refléter le filtre
     *  actif, sinon chercher "Badiane" laisserait "Pending 12" alors qu'une seule tâche
     *  matche réellement. */
    visibleTasksAllStatuses() {
      let list = this.tasks
      if (this.onlyMine && this.currentUserId) {
        list = list.filter((t) => t.assignedToUserId === this.currentUserId)
      }
      const q = this.searchQuery.trim().toLowerCase()
      if (q) {
        list = list.filter(
          (t) =>
            this.itemNameLabel(t).toLowerCase().includes(q) ||
            (t.assignedToName || '').toLowerCase().includes(q) ||
            (t.sourceElementName || '').toLowerCase().includes(q) ||
            (t.destinationElementName || '').toLowerCase().includes(q),
        )
      }
      return list
    },
    /** Filtrage par statut ENSUITE (onglet actif), le groupBy choisi ne s'applique
     *  qu'après, sommer des quantités PENDING+COMPLETED n'aurait aucun sens. */
    filteredTasks() {
      return this.visibleTasksAllStatuses.filter((t) => t.status === this.activeStatus)
    },
    activeGroups() {
      return groupTasksByDimension(this.filteredTasks, this.groupBy)
    },
    groupIcon() {
      return GROUP_ICONS[this.groupBy] || GROUP_ICONS.staff
    },
    bulkLabel() {
      return this.activeStatus === 'PENDING' ? this.t('lgTasksBulkPickup') : this.t('lgTasksBulkDrop')
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
      return this.visibleTasksAllStatuses.filter((t) => t.status === status).length
    },
    /** Quantité totale sommée pour un groupe par ARTICLE (mêmes unités garanties) ;
     *  simple compte de tâches pour les autres dimensions (staff/lieu mélangent des
     *  denrées différentes, sommer leurs quantités n'aurait pas de sens). */
    groupTotalLabel(group) {
      if (this.groupBy === 'item') {
        const item = this.store.getters['logistics/itemByKey'](group.itemKey)
        const qty = compactQtyLabel(group.totalPacked, group.totalLoose, item, item?.unitsPerPack, this.t, this.locale, formatUnits)
        return `${this.t('lgTasksTotal')} : ${qty}`
      }
      return `${group.tasks.length} ${this.t('lgTasksTaskCount')}`
    },
    /** Action groupée visible seulement si utile (2+ tâches) et sur un statut actionnable
     *  (rien à faire en masse dans Closed). */
    showBulkButton(group) {
      return this.activeStatus !== 'COMPLETED' && group.tasks.length >= 2
    },
    isActing(id) {
      return !!this.actingTaskIds[id]
    },
    /** Rafraîchit aussi le stock Logistic (store `logistics`) : le pickup/drop décrémente
     *  StockLevel côté backend, sans ça les cartes items de l'écran principal resteraient
     *  périmées jusqu'à un reload manuel (même défaut que corrigé sur RestockerDrawer).
     *  `silent` : ne touche pas `state.loading` (retour utilisateur 08/2026, ce flag est
     *  partagé par toute la page, cocher une case ici faisait clignoter en skeleton la
     *  liste PDV de la colonne centre, sans rapport avec ce qu'on regarde). */
    async refreshStock() {
      await this.store.dispatch('logistics/loadStock', { spaceId: this.spaceId, silent: true })
    },
    /** La case "Récupérer" est cochable ET décochable (retour utilisateur 08/2026) :
     *  cochée depuis PENDING → pickup ; décochée depuis PICKED_UP → annule (undoPickup).
     *  Jamais rendue pour une tâche COMPLETED (branche read-only du template). */
    onTogglePickup(task) {
      if (task.status === 'PENDING') return this.onPickup(task)
      if (task.status === 'PICKED_UP') return this.onUndoPickup(task)
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
    /** Annule un pickup (mouvement pas encore confirmé, cf. LogisticsService.reverseMovement) :
     *  la tâche redevient PENDING. Volontairement pas de symétrique pour "Déposer" décoché
     *  (COMPLETED → PICKED_UP) : à ce stade le mouvement est confirmé, une contrepartie a
     *  déjà été créditée, défaire ça touche à l'historique confirmé, hors scope ici. */
    async onUndoPickup(task) {
      if (task.status !== 'PICKED_UP' || this.isActing(task.id)) return
      this.actingTaskIds = { ...this.actingTaskIds, [task.id]: true }
      try {
        await undoPickupLogisticTask(task.id)
        await Promise.all([this.fetchTasks(), this.refreshStock()])
      } catch (e) {
        this.error = e?.userMessage || e?.message || this.t('lgTasksErrorUndoPickup')
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
    /** "Tout récupérer"/"Tout déposer" : le groupe est déjà filtré au statut de l'onglet
     *  actif (activeGroups), donc toutes ses tâches sont éligibles à LA MÊME action.
     *  Promise.allSettled : un échec isolé (ex. stock insuffisant sur une seule tâche)
     *  ne doit jamais bloquer les autres. */
    async onBulk(group) {
      const kind = this.activeStatus === 'PENDING' ? 'pickup' : 'drop'
      const targets = group.tasks.filter((t) => !this.isActing(t.id))
      if (!targets.length) return
      this.bulkActingKeys = { ...this.bulkActingKeys, [group.key]: true }
      const marks = {}
      targets.forEach((t) => { marks[t.id] = true })
      this.actingTaskIds = { ...this.actingTaskIds, ...marks }
      const call = kind === 'pickup' ? pickupLogisticTask : dropLogisticTask
      const results = await Promise.allSettled(targets.map((t) => call(t.id)))
      const failedCount = results.filter((r) => r.status === 'rejected').length
      if (failedCount) {
        this.error = kind === 'pickup' ? this.t('lgTasksErrorBulkPickup') : this.t('lgTasksErrorBulkDrop')
      }
      await Promise.all([this.fetchTasks(), this.refreshStock()])
      const nextActing = { ...this.actingTaskIds }
      targets.forEach((t) => delete nextActing[t.id])
      this.actingTaskIds = nextActing
      const nextBulk = { ...this.bulkActingKeys }
      delete nextBulk[group.key]
      this.bulkActingKeys = nextBulk
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

/* Regroupement au choix : select compact, la file de 4 options segmentées serait trop
   à l'étroit dans les ~300px utiles de la colonne. */
.lgt-groupby { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.lgt-groupby-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.55; flex-shrink: 0; }
.lgt-groupby-select {
  flex: 1; min-width: 0; font-size: 11.5px; font-weight: 600; padding: 4px 6px; border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, 0.12); background: transparent; color: inherit; cursor: pointer;
}

.lgt-filters-row { display: flex; gap: 6px; flex-shrink: 0; }
.lgt-search {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.lgt-search-icon { opacity: 0.5; flex-shrink: 0; }
.lgt-search-input { flex: 1; min-width: 0; border: none; background: transparent; font-size: 11.5px; color: inherit; outline: none; }
.lgt-mine-toggle {
  flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.12); background: transparent; color: inherit; opacity: 0.7;
}
.lgt-mine-toggle:hover { opacity: 1; }
.lgt-mine-toggle--active { opacity: 1; background: #ff3131; border-color: #ff3131; color: #fff; }
.lgt-mine-toggle:disabled { opacity: 0.35; cursor: default; }

/* Plafond fixe, indépendant des sections voisines (même principe que LogisticAggregateView) :
   une longue liste scrolle sur elle-même sans jamais forcer la hauteur des autres sections. */
.lgt-scroll { max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 2px; }

.lgt-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; opacity: 0.5; font-size: 12px; padding: 20px; }

.lgt-group { display: flex; flex-direction: column; gap: 6px; }
.lgt-group-head { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.7; }
.lgt-group-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgt-group-total { margin-left: auto; flex-shrink: 0; font-weight: 700; font-variant-numeric: tabular-nums; opacity: 0.8; text-transform: none; letter-spacing: normal; }

.lgt-bulk-btn {
  display: flex; align-items: center; justify-content: center; align-self: flex-start; gap: 4px;
  border: 1px solid rgba(255, 49, 49, 0.35); color: #ff3131; background: rgba(255, 49, 49, 0.06);
  border-radius: 8px; padding: 4px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
}
.lgt-bulk-btn:hover { background: rgba(255, 49, 49, 0.12); }
.lgt-bulk-btn:disabled { opacity: 0.55; cursor: default; }

.lgt-task { display: flex; flex-direction: column; gap: 4px; padding: 8px 9px; border-radius: 8px; background: rgba(0, 0, 0, 0.03); }
.lgt-task-summary { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
.lgt-priority-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

.lgt-check { display: flex; align-items: center; gap: 6px; font-size: 11.5px; padding-left: 13px; cursor: pointer; }
.lgt-check input[type='checkbox'] { flex-shrink: 0; cursor: pointer; }
.lgt-check input[type='checkbox']:disabled { cursor: default; }
.lgt-check--done span { opacity: 0.55; text-decoration: line-through; }

.lgt-task-done { display: flex; align-items: center; font-size: 11.5px; padding-left: 13px; opacity: 0.7; }
</style>
