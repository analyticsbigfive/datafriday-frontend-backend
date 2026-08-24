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

          <!-- Body -->
          <div class="rsk-body">
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
              <v-icon size="20">mdi-plus</v-icon>
            </button>

            <div v-if="tasks.length" class="rsk-queue">
              <div class="rsk-queue-title">{{ t('restockTasksCount') }} : {{ tasks.length }}</div>
              <div v-for="(task, i) in tasks" :key="task._localId" class="rsk-queue-line">
                <span class="rsk-queue-line__text">
                  {{ i + 1 }} - {{ task.assignedToName }} : {{ taskQtyLabel(task) }} {{ task.itemLabel }} {{ t('restockFrom') }} {{ task.sourceElementName }} {{ t('restockTo') }} {{ task.destinationElementName }}
                </span>
                <button type="button" class="rsk-queue-line__remove" :title="t('restockRemoveTask')" @click="$emit('remove-task', task._localId)">
                  <v-icon size="14">mdi-close</v-icon>
                </button>
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

/**
 * Drawer "Restocker" (Live inventory, mockups 08/2026) : crée une ou plusieurs
 * tâches de transfert assignées à un staff, empilées localement ("Tâches : N",
 * possédées par le parent via `tasks`/évènements) puis envoyées en un lot au clic
 * sur Confirmer. Même patron Teleport+Transition que LogisticTransferConfirmDrawer.
 * L'origine est résolue via le store `logistics` (mêmes données que l'écran
 * Logistic) — le parent (LiveInventoryPanel) n'a besoin de connaître ni le stock
 * détaillé ni les floors, seulement l'élément/l'item ouverts.
 */
export default {
  name: 'RestockerDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    spaceId: { type: String, default: '' },
    /** PDV en cours de réapprovisionnement (destination) { id, name } */
    element: { type: Object, default: null },
    itemKey: { type: String, default: '' },
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
    originCandidates() {
      const shops = this.store.getters['logistics/shopElements'] || []
      const storages = this.store.getters['logistics/storageElements'] || []
      return [...shops, ...storages]
        .filter((e) => e.id !== this.element?.id)
        .map((e) => {
          const expected = this.store.getters['logistics/expectedFor'](e.id, this.itemKey) || { packed: 0, loose: 0 }
          return { id: e.id, name: e.name, packed: expected.packed, loose: expected.loose, floorGroupId: e.floorGroupId ?? null }
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
      if (this.spaceId) this.fetchStaff(this.spaceId)
      this.ensureStock()
    },
  },
  methods: {
    async ensureStock() {
      const state = this.store.state.logistics
      if (state?.spaceId === this.spaceId && (state?.elements || []).length) return
      await this.store.dispatch('logistics/loadStock', { spaceId: this.spaceId })
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
    close() {
      this.$emit('update:modelValue', false)
    },
    addTask() {
      if (!this.isValid) return
      const origin = this.sortedOrigins.find((o) => o.id === this.form.sourceElementId)
      const staff = this.staffList.find((s) => s.id === this.form.assignedToUserId)
      this.$emit('add-task', {
        itemKey: this.itemKey,
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
  width: 440px;
  max-width: 100vw;
  height: 100%;
  background: rgb(var(--v-theme-surface));
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
}
.rsk-header { display: flex; align-items: center; gap: 10px; padding: 16px; }
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

.rsk-body { padding: 16px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
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
  align-self: flex-end; width: 44px; height: 44px; border-radius: 12px; border: none;
  background: #ff3131; color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: opacity .15s;
}
.rsk-add-btn:disabled { opacity: 0.4; cursor: default; }

.rsk-queue { border-top: 1px solid rgba(0, 0, 0, 0.08); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.rsk-queue-title { font-size: 12px; font-weight: 700; opacity: 0.7; }
.rsk-queue-line {
  display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: 8px; background: rgba(0, 0, 0, 0.03); font-size: 12.5px;
}
.rsk-queue-line__text { flex: 1; }
.rsk-queue-line__remove {
  border: none; background: transparent; cursor: pointer; opacity: 0.5; padding: 2px; flex-shrink: 0;
}
.rsk-queue-line__remove:hover { opacity: 1; }

.rsk-alert { margin: 0 16px 12px; }

.rsk-footer {
  display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.rsk-footer :deep(.v-btn) { border-radius: 20px; text-transform: none; font-weight: 600; padding: 0 18px; }
.rsk-confirm-btn { background: #ff3131 !important; color: #fff !important; }

.rsk-enter-active, .rsk-leave-active { transition: opacity 0.18s ease; }
.rsk-enter-from, .rsk-leave-to { opacity: 0; }
</style>
