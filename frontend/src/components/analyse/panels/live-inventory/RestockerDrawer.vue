<template>
  <Teleport to="body">
    <Transition name="rsk">
      <div v-if="modelValue" class="rsk-overlay" @click.self="close">
        <div class="rsk-panel">
          <!-- Header -->
          <div class="rsk-header">
            <div class="rsk-header-icon"><v-icon size="18" color="white">mdi-dolly</v-icon></div>
            <div class="rsk-header-text">
              <div class="rsk-header-title">{{ t('restockDrawerTitle') }}</div>
              <div class="rsk-header-sub">{{ currentItem?.name || itemKey }} · {{ element?.name }}</div>
            </div>
            <button class="rsk-close" type="button" @click="close">
              <v-icon size="18">mdi-close</v-icon>
            </button>
          </div>
          <v-divider />

          <div class="rsk-content">
            <!-- Form pane : jamais compressée par la file, sa propre zone de scroll -->
            <div class="rsk-form-pane">
              <div class="rsk-field">
                <div class="rsk-label">{{ t('restockOrigin') }}</div>
                <v-select
                  v-model="form.sourceElementId"
                  :items="originOptions"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  hide-details
                  :loading="stockLoading"
                  :placeholder="t('restockOriginPlaceholder')"
                  :menu-props="{ zIndex: 3500 }"
                />
              </div>

              <div class="rsk-field-row">
                <div class="rsk-field">
                  <div class="rsk-label">{{ packedFieldLabel }}</div>
                  <v-text-field
                    v-model.number="form.packed"
                    type="number"
                    min="0"
                    step="1"
                    variant="outlined"
                    density="compact"
                    rounded="lg"
                    hide-details
                  />
                </div>
                <div class="rsk-field">
                  <div class="rsk-label">{{ looseFieldLabel }}</div>
                  <v-text-field
                    v-model.number="form.loose"
                    type="number"
                    min="0"
                    step="0.01"
                    variant="outlined"
                    density="compact"
                    rounded="lg"
                    hide-details
                  />
                </div>
              </div>

              <div v-if="availableCap" class="rsk-cap" :class="{ 'rsk-cap-over': exceedsCap }">
                <v-icon size="14" class="mr-1">{{ exceedsCap ? 'mdi-alert-circle-outline' : 'mdi-information-outline' }}</v-icon>
                {{ t('logiAvailable') }} : {{ availableCap.packed }} {{ packedShortLabel }}
                <template v-if="availableCapTotal !== null"> ({{ availableCapTotal }})</template>
                <template v-else> · {{ formatUnits(availableCap.loose) }} {{ looseShortLabel }}</template>
              </div>

              <div class="rsk-field">
                <div class="rsk-label">{{ t('restockAssignTo') }}</div>
                <v-select
                  v-model="form.assignedToUserId"
                  :items="staffOptions"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  hide-details
                  :loading="staffLoading"
                  :placeholder="t('restockStaffPlaceholder')"
                  :no-data-text="t('restockNoStaff')"
                  :menu-props="{ zIndex: 3500 }"
                />
              </div>

              <div class="rsk-field">
                <div class="rsk-label">{{ t('restockPriority') }}</div>
                <div class="rsk-priority-grid">
                  <button
                    v-for="p in priorities"
                    :key="p.value"
                    type="button"
                    class="rsk-priority-btn"
                    :class="[`rsk-priority-btn--${p.value.toLowerCase()}`, { 'rsk-priority-btn--active': form.priority === p.value }]"
                    @click="form.priority = p.value"
                  >{{ p.title }}</button>
                </div>
              </div>

              <button type="button" class="rsk-add-btn" :disabled="!isValid" :title="t('restockAddTask')" @click="addTask">
                <v-icon size="18" class="mr-1">mdi-plus</v-icon>
                {{ t('restockAddTask') }}
              </button>
            </div>

            <!-- Queue pane : regroupable, indépendamment scrollable -->
            <div class="rsk-queue-pane">
              <div class="rsk-queue-head">
                <div class="rsk-queue-title">
                  {{ t('restockTasksCount') }}
                  <span v-if="tasks.length" class="rsk-queue-count">{{ tasks.length }}</span>
                </div>
                <div v-if="tasks.length" class="rsk-view-tabs">
                  <button
                    v-for="v in viewOptions"
                    :key="v.value"
                    type="button"
                    class="rsk-view-tab"
                    :class="{ 'rsk-view-tab--active': viewMode === v.value }"
                    @click="viewMode = v.value"
                  >{{ v.title }}</button>
                </div>
              </div>

              <div class="rsk-queue-scroll">
                <div v-if="!tasks.length" class="rsk-queue-empty">
                  <v-icon size="28" class="mb-2">mdi-clipboard-list-outline</v-icon>
                  <div>{{ t('restockEmptyQueue') }}</div>
                </div>

                <!-- Vue liste : chronologique, numérotée -->
                <div v-else-if="viewMode === 'flat'" class="rsk-flat-list">
                  <div v-for="(task, i) in tasks" :key="task._localId" class="rsk-task-row">
                    <span class="rsk-priority-dot" :style="{ background: priorityColor(task.priority) }" />
                    <span class="rsk-task-row__text">
                      {{ i + 1 }} - {{ task.assignedToName }} : {{ taskQtyLabel(task) }} {{ task.itemLabel }} {{ t('restockFrom') }} {{ task.sourceElementName }} {{ t('restockTo') }} {{ task.destinationElementName }}
                    </span>
                    <button type="button" class="rsk-task-row__remove" :title="t('restockRemoveTask')" @click="$emit('remove-task', task._localId)">
                      <v-icon size="14">mdi-close</v-icon>
                    </button>
                  </div>
                </div>

                <!-- Vue par staff : un groupe par logisticien assigné -->
                <div v-else-if="viewMode === 'staff'" class="rsk-groups">
                  <div v-for="group in groupedByStaff" :key="group.key" class="rsk-group">
                    <button type="button" class="rsk-group-head" @click="toggleGroup(`staff:${group.key}`)">
                      <v-icon size="16" class="rsk-group-chevron" :class="{ 'rsk-group-chevron--open': !isCollapsed(`staff:${group.key}`) }">mdi-chevron-right</v-icon>
                      <v-icon size="15" class="mr-1">mdi-account-outline</v-icon>
                      <span class="rsk-group-label">{{ group.label }}</span>
                      <span class="rsk-queue-count">{{ group.tasks.length }}</span>
                    </button>
                    <div v-show="!isCollapsed(`staff:${group.key}`)" class="rsk-group-body">
                      <div v-for="task in group.tasks" :key="task._localId" class="rsk-task-row">
                        <span class="rsk-priority-dot" :style="{ background: priorityColor(task.priority) }" />
                        <span class="rsk-task-row__text">
                          {{ taskQtyLabel(task) }} {{ task.itemLabel }} {{ t('restockFrom') }} {{ task.sourceElementName }} {{ t('restockTo') }} {{ task.destinationElementName }}
                        </span>
                        <button type="button" class="rsk-task-row__remove" :title="t('restockRemoveTask')" @click="$emit('remove-task', task._localId)">
                          <v-icon size="14">mdi-close</v-icon>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Vue par lieu : un groupe par trajet origine → destination -->
                <div v-else class="rsk-groups">
                  <div v-for="group in groupedByRoute" :key="group.key" class="rsk-group">
                    <button type="button" class="rsk-group-head" @click="toggleGroup(`route:${group.key}`)">
                      <v-icon size="16" class="rsk-group-chevron" :class="{ 'rsk-group-chevron--open': !isCollapsed(`route:${group.key}`) }">mdi-chevron-right</v-icon>
                      <v-icon size="15" class="mr-1">mdi-map-marker-path</v-icon>
                      <span class="rsk-group-label">{{ t('restockFrom') }} {{ group.sourceElementName }} {{ t('restockTo') }} {{ group.destinationElementName }}</span>
                      <span class="rsk-queue-count">{{ group.tasks.length }}</span>
                    </button>
                    <div v-show="!isCollapsed(`route:${group.key}`)" class="rsk-group-body">
                      <div v-for="task in group.tasks" :key="task._localId" class="rsk-task-row">
                        <span class="rsk-priority-dot" :style="{ background: priorityColor(task.priority) }" />
                        <span class="rsk-task-row__text">{{ task.assignedToName }} : {{ taskQtyLabel(task) }} {{ task.itemLabel }}</span>
                        <button type="button" class="rsk-task-row__remove" :title="t('restockRemoveTask')" @click="$emit('remove-task', task._localId)">
                          <v-icon size="14">mdi-close</v-icon>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <v-alert v-if="error" type="error" density="compact" variant="tonal" class="rsk-alert">
            {{ error }}
          </v-alert>

          <!-- Footer -->
          <div class="rsk-footer">
            <v-btn variant="text" @click="close">{{ t('logiCancel') }}</v-btn>
            <v-btn
              class="rsk-confirm-btn"
              variant="flat"
              rounded="lg"
              :loading="confirming"
              :disabled="!tasks.length"
              @click="$emit('confirm')"
            >
              {{ t('restockConfirm') }}
            </v-btn>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { packedLabel, looseUnitLabel, compactQtyLabel } from '@/composables/useLogisticUnitLabels'
import { useAssignableStaff } from '@/composables/useAssignableStaff'
import { sortElementsByFloorAndQuantity } from '@/utils/logisticElementOptions'
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'
import { groupTasksByStaff, groupTasksByRoute } from '@/utils/restockerTaskGrouping'
import { getLogisticTasks } from '@/api/endpoints/logistic-tasks.api'

// Même palette que .rsk-priority-btn--* (style, en bas de fichier), dupliquée ici pour
// le point coloré des lignes de tâches, qui ne peut pas réutiliser une classe CSS pour
// une couleur dynamique par tâche.
const PRIORITY_COLORS = {
  VERY_URGENT: '#7c3aed',
  URGENT: '#ff3131',
  TODO: '#fab219',
  NOT_PRIORITY: '#fde68a',
}

/**
 * Drawer "Restocker" (Live inventory, mockups 08/2026) : crée une ou plusieurs
 * tâches de transfert assignées à un staff, empilées localement ("Tâches : N",
 * possédées par le parent via `tasks`/évènements) puis envoyées en un lot au clic
 * sur Confirmer. Même patron Teleport+Transition que LogisticTransferConfirmDrawer.
 * L'origine est résolue via le store `logistics` (mêmes données que l'écran
 * Logistic) — le parent (LiveInventoryPanel) n'a besoin de connaître ni le stock
 * détaillé ni les floors, seulement l'élément/l'item ouverts.
 *
 * Layout à deux volets (retour utilisateur 08/2026, la 1re version en colonne unique
 * réduisait le formulaire au fur et à mesure que la file grandissait) : le formulaire
 * de gauche ne bouge jamais, la file de droite scrolle indépendamment et se regroupe
 * par staff ou par trajet (groupTasksByStaff/groupTasksByRoute, extraits dans
 * utils/restockerTaskGrouping.js sur le même principe que liveInventoryRows.js).
 */
export default {
  name: 'RestockerDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    spaceId: { type: String, default: '' },
    /** PDV en cours de réapprovisionnement (destination) { id, name } */
    element: { type: Object, default: null },
    itemKey: { type: String, default: '' },
    /** Identité stable de l'article (ADR-0006, chantier 377), optionnelle, transmise
     * telle quelle jusqu'au backend qui la préfère au nom quand fournie. */
    itemKind: { type: String, default: null },
    itemRefId: { type: String, default: null },
    /** File d'attente locale, possédée par le parent (survit à la fermeture du drawer). */
    tasks: { type: Array, default: () => [] },
    confirming: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  emits: ['update:modelValue', 'add-task', 'remove-task', 'confirm'],
  setup() {
    const store = useStore()
    const { t, locale } = useI18n()
    const { staff: staffList, loading: staffLoading, fetchStaff } = useAssignableStaff()
    return { store, t, locale, formatUnits, staffList, staffLoading, fetchStaff }
  },
  data() {
    return {
      form: { sourceElementId: null, packed: 0, loose: 0, assignedToUserId: null, priority: null },
      viewMode: 'flat', // 'flat' | 'staff' | 'location'
      collapsedGroupKeys: {}, // { [`${dimension}:${groupKey}`]: true }, replié seulement si présent et vrai
      // Tâches LogisticTask PENDING de tout l'espace (autres sessions/staff compris),
      // rechargées à chaque ouverture du drawer — voir reservedAtOrigin.
      openTasks: [],
    }
  },
  computed: {
    priorities() {
      return [
        { value: 'VERY_URGENT', title: this.t('restockPriorityVeryUrgent') },
        { value: 'URGENT', title: this.t('restockPriorityUrgent') },
        { value: 'TODO', title: this.t('restockPriorityTodo') },
        { value: 'NOT_PRIORITY', title: this.t('restockPriorityNotPriority') },
      ]
    },
    viewOptions() {
      return [
        { value: 'flat', title: this.t('restockViewFlat') },
        { value: 'staff', title: this.t('restockViewByStaff') },
        { value: 'location', title: this.t('restockViewByLocation') },
      ]
    },
    groupedByStaff() {
      return groupTasksByStaff(this.tasks)
    },
    groupedByRoute() {
      return groupTasksByRoute(this.tasks)
    },
    currentItem() {
      return this.store.getters['logistics/itemByKey'](this.itemKey)
    },
    /** Élément courant enrichi (floorGroupId) — résolu ici, le parent ne le connaît pas. */
    currentElementFull() {
      const all = [...(this.store.getters['logistics/shopElements'] || []), ...(this.store.getters['logistics/storageElements'] || [])]
      return all.find((e) => e.id === this.element?.id) || null
    },
    unitsPerPack() {
      const level = this.store.getters['logistics/levelFor'](this.element?.id, this.itemKey)
      return level?.unitsPerPack || this.currentItem?.unitsPerPack || null
    },
    packedFieldLabel() {
      return packedLabel(this.currentItem, this.unitsPerPack, this.t, this.locale)
    },
    looseFieldLabel() {
      return looseUnitLabel(this.currentItem, this.t)
    },
    packedShortLabel() {
      const type = translatePackagingType(this.currentItem?.packagingType, this.locale)
      return type ? pluralize(type) : this.t('logiPackedShort')
    },
    looseShortLabel() {
      return this.currentItem?.unit || this.t('logiLooseShort')
    },
    /** Identité de l'item courant pour matcher les réservations (id stable prioritaire,
     *  repli sur itemKey nom, même logique que addTask/ADR-0006). */
    currentItemRefId() {
      return this.currentItem?.id ?? this.itemRefId ?? null
    },
    /** Quantité déjà engagée sur une origine pour l'item courant, sans encore avoir
     *  bougé le stock (LogisticTask.PENDING encore là = pas récupérée, cf. schéma) :
     *  file locale (pas envoyée) + tâches PENDING de tout l'espace (déjà envoyées par
     *  cette session ou une autre, cf. openTasks). Les tâches PICKED_UP ne comptent
     *  PAS ici : leur pickup a déjà décrémenté StockLevel (ensureStock rafraîchit à
     *  chaque ouverture), les compter en plus doublerait la réservation. */
    reservedByOriginId() {
      const reserved = {}
      const add = (elementId, packed, loose) => {
        const cur = reserved[elementId] || { packed: 0, loose: 0 }
        cur.packed += Number(packed) || 0
        cur.loose += Number(loose) || 0
        reserved[elementId] = cur
      }
      for (const task of this.tasks) {
        if (this.matchesCurrentItem(task)) add(task.sourceElementId, task.packed, task.loose)
      }
      for (const task of this.openTasks) {
        if (task.status === 'PENDING' && this.matchesCurrentItem(task)) add(task.sourceElementId, task.packedQty, task.looseQty)
      }
      return reserved
    },
    originCandidates() {
      const shops = this.store.getters['logistics/shopElements'] || []
      const storages = this.store.getters['logistics/storageElements'] || []
      const reservedByOriginId = this.reservedByOriginId
      return [...shops, ...storages]
        .filter((e) => e.id !== this.element?.id)
        .map((e) => {
          const expected = this.store.getters['logistics/expectedFor'](e.id, this.itemKey) || { packed: 0, loose: 0 }
          const reserved = reservedByOriginId[e.id] || { packed: 0, loose: 0 }
          return {
            id: e.id,
            name: e.name,
            packed: Math.max(0, (expected.packed ?? 0) - reserved.packed),
            loose: Math.max(0, (expected.loose ?? 0) - reserved.loose),
            floorGroupId: e.floorGroupId ?? null,
          }
        })
    },
    sortedOrigins() {
      const current = { floorGroupId: this.currentElementFull?.floorGroupId ?? null }
      return sortElementsByFloorAndQuantity(this.originCandidates, current, this.unitsPerPack)
    },
    /** Un PDV/storage à 0 (packed ET loose) ne peut rien fournir — grisé plutôt que
     *  proposé au même titre que les autres, pour ne pas laisser choisir une origine vide.
     *  Vuetify (itemProps par défaut = 'props') ne lit PAS un `disabled` à plat sur l'item :
     *  il faut le nicher dans `item.props` pour qu'il soit spread sur le VListItem. */
    originOptions() {
      return this.sortedOrigins.map((o) => ({
        title: this.originLabel(o),
        value: o.id,
        props: { disabled: (Number(o.packed) || 0) <= 0 && (Number(o.loose) || 0) <= 0 },
      }))
    },
    selectedOrigin() {
      return this.sortedOrigins.find((o) => o.id === this.form.sourceElementId) || null
    },
    /** Plafond dispo à l'origine choisie — miroir de LogisticMovementDialog::availableCap. */
    availableCap() {
      return this.selectedOrigin ? { packed: this.selectedOrigin.packed ?? 0, loose: this.selectedOrigin.loose ?? 0 } : null
    },
    /** Quantité totale équivalente (packed×unitsPerPack + loose) — même formule que
     *  LogisticMovementDialog::capTotal, réaffichée en clair dans l'indicatif "Disponible". */
    availableCapTotal() {
      const cap = this.availableCap
      const upp = Number(this.unitsPerPack)
      if (!cap || !upp) return null
      return `${formatUnits(cap.packed * upp + cap.loose)} ${this.currentItem?.unit || ''}`.trim()
    },
    /** Miroir de LogisticMovementDialog::exceedsCap (casse de pack : un manque de vrac
     *  peut être comblé par un pack entier disponible, jamais l'inverse pour les packs). */
    exceedsCap() {
      const cap = this.availableCap
      if (!cap) return false
      const packed = Math.max(0, Math.round(Number(this.form.packed) || 0))
      const loose = Math.max(0, Number(this.form.loose) || 0)
      const upp = Number(this.unitsPerPack)
      if (upp > 0) {
        const availableTotal = (Number(cap.packed) || 0) * upp + (Number(cap.loose) || 0)
        const requestedTotal = packed * upp + loose
        return packed > (cap.packed ?? 0) || requestedTotal > availableTotal + 1e-9
      }
      return packed > (cap.packed ?? 0) || loose > (cap.loose ?? 0)
    },
    /** Tâches déjà en file (pas encore confirmées) prises en compte pour le tri croissant. */
    staffOptions() {
      const localCounts = {}
      for (const task of this.tasks) localCounts[task.assignedToUserId] = (localCounts[task.assignedToUserId] || 0) + 1
      return [...this.staffList]
        .map((s) => ({ ...s, ongoingTaskCount: s.ongoingTaskCount + (localCounts[s.id] || 0) }))
        .sort((a, b) => a.ongoingTaskCount - b.ongoingTaskCount)
        .map((s) => ({ title: `${s.name} (${s.ongoingTaskCount})`, value: s.id }))
    },
    stockLoading() {
      return !!this.store.state.logistics?.loading
    },
    isValid() {
      const packed = Math.max(0, Math.round(Number(this.form.packed) || 0))
      const loose = Math.max(0, Number(this.form.loose) || 0)
      if (packed + loose <= 0) return false
      if (!this.form.sourceElementId || !this.form.assignedToUserId || !this.form.priority) return false
      if (this.exceedsCap) return false
      return true
    },
  },
  watch: {
    modelValue(open) {
      if (!open) return
      this.resetForm()
      if (this.spaceId) {
        this.fetchStaff(this.spaceId)
        this.fetchOpenTasks()
      }
      this.ensureStock()
    },
  },
  methods: {
    /** Rafraîchi à CHAQUE ouverture (pas de cache par espace, contrairement à avant) :
     *  un pickup exécuté ailleurs entre-temps a réellement décrémenté StockLevel, un
     *  cache périmé masquerait ce mouvement dans le select Origine. */
    async ensureStock() {
      await this.store.dispatch('logistics/loadStock', { spaceId: this.spaceId })
    },
    /** Tâches LogisticTask PENDING de tout l'espace : reflètent une quantité déjà
     *  engagée sur une origine mais pas encore décrémentée de StockLevel (pickup pas
     *  encore fait, cf. reservedByOriginId) — silencieuses sinon dans le select Origine. */
    async fetchOpenTasks() {
      try {
        this.openTasks = (await getLogisticTasks(this.spaceId)) || []
      } catch {
        this.openTasks = []
      }
    },
    /** Item d'une tâche (locale ou backend) = item courant du drawer ? Id stable
     *  prioritaire (ADR-0006), repli sur le nom (itemKey) sinon. */
    matchesCurrentItem(task) {
      if (this.currentItemRefId && task.itemRefId) return task.itemRefId === this.currentItemRefId
      const key = String(task.itemKey ?? '').trim().toLowerCase()
      return key === String(this.itemKey ?? '').trim().toLowerCase()
    },
    /** Réinitialise l'item en cours ; garde staff/priorité (par défaut le même
     *  logisticien pour la tâche suivante, cf. mockup). */
    resetForm() {
      const last = this.tasks[this.tasks.length - 1]
      this.form = {
        sourceElementId: null,
        packed: 0,
        loose: 0,
        assignedToUserId: last?.assignedToUserId ?? null,
        priority: last?.priority ?? null,
      }
    },
    originLabel(el) {
      const upp = Number(this.unitsPerPack)
      const total = upp ? `(${formatUnits(el.packed * upp + el.loose)} ${this.currentItem?.unit || ''})`.trim() : null
      const detail = total || `· ${formatUnits(el.loose ?? 0)} ${this.looseShortLabel}`
      return `${el.name} — ${el.packed ?? 0} ${this.packedShortLabel} ${detail}`
    },
    taskQtyLabel(task) {
      return compactQtyLabel(task.packed, task.loose, { unit: task.unit, packagingType: task.packagingType }, task.unitsPerPack, this.t, this.locale, formatUnits)
    },
    priorityColor(priority) {
      return PRIORITY_COLORS[priority] || '#9ca3af'
    },
    isCollapsed(key) {
      return !!this.collapsedGroupKeys[key]
    },
    toggleGroup(key) {
      this.collapsedGroupKeys = { ...this.collapsedGroupKeys, [key]: !this.collapsedGroupKeys[key] }
    },
    close() {
      this.$emit('update:modelValue', false)
    },
    addTask() {
      if (!this.isValid) return
      const origin = this.sortedOrigins.find((o) => o.id === this.form.sourceElementId)
      const staff = this.staffList.find((s) => s.id === this.form.assignedToUserId)
      this.$emit('add-task', {
        itemKey: this.itemKey,
        // ADR-0006 (chantier 377) : identité stable, currentItem (référentiel Logistic,
        // toujours à jour) prioritaire, repli sur les props transmises par le parent.
        itemKind: this.currentItem?.refKind ?? this.itemKind ?? undefined,
        itemRefId: this.currentItem?.id ?? this.itemRefId ?? undefined,
        menuItemId: this.currentItem?.kind === 'product' ? this.currentItem.id : undefined,
        itemLabel: this.currentItem?.name || this.itemKey,
        unit: this.currentItem?.unit || null,
        packagingType: this.currentItem?.packagingType || null,
        unitsPerPack: this.unitsPerPack || null,
        sourceElementId: this.form.sourceElementId,
        sourceElementName: origin?.name || '',
        destinationElementId: this.element?.id,
        destinationElementName: this.element?.name || '',
        packed: Math.max(0, Math.round(Number(this.form.packed) || 0)),
        loose: Math.max(0, Number(this.form.loose) || 0),
        assignedToUserId: this.form.assignedToUserId,
        assignedToName: staff?.name || '',
        priority: this.form.priority,
      })
      this.form.sourceElementId = null
      this.form.packed = 0
      this.form.loose = 0
    },
  },
}
</script>

<style scoped>
.rsk-overlay {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
}
.rsk-panel {
  /* Jusqu'à ~48% de l'écran (retour utilisateur 08/2026 : la file de tâches a besoin
     d'espace pour se regrouper lisiblement), plafonné pour rester raisonnable sur les
     très grands écrans ; sous ~920px de viewport, revient à une colonne unique pleine
     largeur (cf. rsk-content en media query). */
  width: clamp(440px, 48vw, 960px);
  max-width: 100vw;
  height: 100%;
  background: rgb(var(--v-theme-surface));
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
}
.rsk-header { display: flex; align-items: center; gap: 10px; padding: 16px; flex-shrink: 0; }
.rsk-header-icon {
  width: 34px; height: 34px; border-radius: 10px; background: #ff3131;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rsk-header-text { flex: 1; min-width: 0; }
.rsk-header-title { font-weight: 700; font-size: 15px; }
.rsk-header-sub {
  font-size: 12px; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rsk-close {
  border: none; background: transparent; cursor: pointer; padding: 4px; border-radius: 8px; opacity: 0.6;
}
.rsk-close:hover { opacity: 1; background: rgba(0, 0, 0, 0.06); }

/* Deux volets : formulaire (jamais compressé) + file (scroll et regroupement propres) */
.rsk-content { flex: 1; min-height: 0; display: flex; overflow: hidden; }

.rsk-form-pane {
  width: 360px;
  flex-shrink: 0;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
}
.rsk-field { display: flex; flex-direction: column; gap: 6px; }
.rsk-field-row { display: flex; gap: 12px; }
.rsk-field-row .rsk-field { flex: 1; }
.rsk-label { font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.6; }

.rsk-priority-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rsk-priority-btn {
  padding: 8px 10px; border-radius: 10px; border: 1.5px solid transparent; background: rgba(0, 0, 0, 0.04);
  font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .15s, color .15s, border-color .15s;
}
.rsk-priority-btn--very_urgent { color: #7c3aed; border-color: rgba(124, 58, 237, .3); }
.rsk-priority-btn--very_urgent.rsk-priority-btn--active { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.rsk-priority-btn--urgent { color: #ff3131; border-color: rgba(255, 49, 49, .3); }
.rsk-priority-btn--urgent.rsk-priority-btn--active { background: #ff3131; border-color: #ff3131; color: #fff; }
.rsk-priority-btn--todo { color: #b8860b; border-color: rgba(250, 178, 25, .4); }
.rsk-priority-btn--todo.rsk-priority-btn--active { background: #fab219; border-color: #fab219; color: #fff; }
.rsk-priority-btn--not_priority { color: #a16207; border-color: rgba(234, 179, 8, .35); }
.rsk-priority-btn--not_priority.rsk-priority-btn--active { background: #fde68a; border-color: #fde68a; color: #78350f; }

.rsk-cap {
  display: flex;
  align-items: center;
  font-size: 0.76rem;
  color: #6b7280;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 10px;
  margin-top: -6px;
  transition: background .15s, border-color .15s, color .15s;
}
.rsk-cap-over { color: #ff3131; background: #fef2f2; border-color: rgba(255, 49, 49, .3); font-weight: 600; }

.rsk-add-btn {
  width: 100%; height: 42px; border-radius: 12px; border: none;
  background: #ff3131; color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity .15s;
}
.rsk-add-btn:disabled { opacity: 0.4; cursor: default; }

/* Volet file : header fixe (compteur + tabs) + zone scrollable indépendante */
.rsk-queue-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.rsk-queue-head { flex-shrink: 0; padding: 14px 16px 10px; display: flex; flex-direction: column; gap: 10px; }
.rsk-queue-title { font-size: 12px; font-weight: 700; opacity: 0.7; display: flex; align-items: center; gap: 6px; }
.rsk-queue-count {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px;
  padding: 0 5px; border-radius: 9px; background: rgba(0, 0, 0, 0.08); font-size: 11px; font-weight: 700;
}

.rsk-view-tabs { display: flex; gap: 4px; background: rgba(0, 0, 0, 0.04); border-radius: 10px; padding: 3px; align-self: flex-start; }
.rsk-view-tab {
  border: none; background: transparent; padding: 5px 10px; border-radius: 8px; font-size: 11.5px;
  font-weight: 700; cursor: pointer; opacity: 0.6; transition: opacity .15s, background .15s, color .15s;
}
.rsk-view-tab:hover { opacity: 0.9; }
.rsk-view-tab--active { opacity: 1; background: rgb(var(--v-theme-surface)); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }

.rsk-queue-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px; }

.rsk-queue-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 24px; opacity: 0.5; font-size: 12.5px;
}

.rsk-flat-list { display: flex; flex-direction: column; gap: 8px; }

.rsk-task-row {
  display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: 8px;
  background: rgba(0, 0, 0, 0.03); font-size: 12.5px;
}
.rsk-priority-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
.rsk-task-row__text { flex: 1; }
.rsk-task-row__remove {
  border: none; background: transparent; cursor: pointer; opacity: 0.5; padding: 2px; flex-shrink: 0;
}
.rsk-task-row__remove:hover { opacity: 1; }

.rsk-groups { display: flex; flex-direction: column; gap: 6px; }
.rsk-group { border: 1px solid rgba(0, 0, 0, 0.07); border-radius: 10px; overflow: hidden; }
.rsk-group-head {
  width: 100%; display: flex; align-items: center; gap: 4px; padding: 8px 10px; border: none;
  background: rgba(0, 0, 0, 0.03); cursor: pointer; font-size: 12.5px; text-align: left;
}
.rsk-group-chevron { transition: transform .15s; opacity: 0.6; flex-shrink: 0; }
.rsk-group-chevron--open { transform: rotate(90deg); }
.rsk-group-label { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rsk-group-body { display: flex; flex-direction: column; gap: 6px; padding: 8px; }
.rsk-group-body .rsk-task-row { background: transparent; padding: 4px 4px 4px 2px; }

.rsk-alert { margin: 0 16px 12px; flex-shrink: 0; }

.rsk-footer {
  display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}
.rsk-footer :deep(.v-btn) { border-radius: 20px; text-transform: none; font-weight: 600; padding: 0 18px; }
.rsk-confirm-btn { background: #ff3131 !important; color: #fff !important; }

.rsk-enter-active, .rsk-leave-active { transition: opacity 0.18s ease; }
.rsk-enter-from, .rsk-leave-to { opacity: 0; }

/* Sous ~920px de viewport, le panneau reste à sa largeur mini (440px, cf. clamp
   ci-dessus), pas la place pour deux colonnes, on empile formulaire puis file. */
@media (max-width: 920px) {
  .rsk-content { flex-direction: column; }
  .rsk-form-pane {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    max-height: 48vh;
    flex-shrink: 0;
  }
  .rsk-queue-pane { flex: 1; min-height: 0; }
}
</style>
