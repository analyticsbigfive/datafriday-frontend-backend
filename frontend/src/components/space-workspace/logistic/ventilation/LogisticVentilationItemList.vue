<template>
  <div class="lgvl-list">
    <div
      v-for="group in groups"
      :key="group.itemKey"
      class="lgvl-card"
      :class="{ 'lgvl-card--expanded': isExpanded(group.itemKey) }"
    >
      <button
        type="button"
        class="lgvl-trigger"
        :aria-expanded="isExpanded(group.itemKey)"
        @click="toggle(group.itemKey)"
      >
        <span class="lgvl-icon"><v-icon size="18">mdi-package-variant-closed</v-icon></span>
        <span class="lgvl-copy">
          <span class="lgvl-name">{{ group.itemName }}</span>
          <span v-if="packSizeLabel(group)" class="lgvl-meta">{{ packSizeLabel(group) }}</span>
        </span>
        <span class="lgvl-summary">
          <span class="lgvl-mini lgvl-mini--deposit">{{ quantityLabel(group, group.totalQuantity, group.totalPacks) }}</span>
          <span v-if="pdvCount(group)" class="lgvl-mini lgvl-mini--muted">{{ pdvCount(group) }} {{ t('logiByItemShopsSuffix') }}</span>
          <span v-if="storageCount(group)" class="lgvl-mini lgvl-mini--muted">{{ storageCount(group) }} {{ t('logiVentilationStoragesSuffix') }}</span>
        </span>
        <v-icon size="16" class="lgvl-chevron">{{ isExpanded(group.itemKey) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </button>

      <div v-if="isExpanded(group.itemKey)" class="lgvl-detail">
        <LogisticVentilationRow
          v-for="row in split(group).shops"
          :key="row.rowKey || row.shopId"
          :row="row"
          :item="group"
          :label="row.shopName"
          :can-confirm="canConfirm"
          @confirm="$emit('confirm', { group, row })"
        />
        <!-- Tous les stockages du périmètre, même sans rien à y déposer (maquette
             Bertrand 2026-10-09), avec le même bouton « + ». -->
        <template v-if="split(group).storages.length">
          <div class="lgvl-section">{{ t('logiVentilationStorageSection') }}</div>
          <LogisticVentilationRow
            v-for="row in split(group).storages"
            :key="row.rowKey || `storage-${row.shopId}`"
            :row="row"
            :item="group"
            :label="row.shopName"
            :can-confirm="canConfirm"
            @confirm="$emit('confirm', { group, row })"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useVentilationLabels } from '@/composables/useVentilationLabels'
import { splitGroupRows } from '@/utils/ventilationViews'
import LogisticVentilationRow from './LogisticVentilationRow.vue'

const { t } = useI18n()
const { quantityLabel, packSizeLabel } = useVentilationLabels()

const props = defineProps({
  /** Groupes par article (groupDepositLinesByItem), déjà filtrés. */
  groups: { type: Array, default: () => [] },
  /** Stockages du périmètre `{ id, name }`. */
  storages: { type: Array, default: () => [] },
  canConfirm: { type: Boolean, default: false },
})
defineEmits(['confirm'])

const expanded = reactive({})
function isExpanded(key) { return !!expanded[key] }
function toggle(key) { expanded[key] = !expanded[key] }

function split(group) {
  return splitGroupRows(group, props.storages)
}
/** Destinations ayant quelque chose à déposer (« N PDV concernés »). */
function pdvCount(group) {
  return group.rows.filter((r) => r.elementType !== 'storage' && r.quantity > 0).length
}
function storageCount(group) {
  return group.rows.filter((r) => r.elementType === 'storage' && r.quantity > 0).length
}
</script>

<style scoped>
.lgvl-list { display: flex; flex-direction: column; gap: 10px; }
.lgvl-card { border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; background: var(--fb-surface, #fff); box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05)); overflow: hidden; }
.lgvl-card--expanded { border-color: rgba(255, 49, 49, 0.28); box-shadow: var(--fb-shadow-hover, 0 6px 20px rgba(15, 23, 42, 0.08)); }
.lgvl-trigger { appearance: none; width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 18px; align-items: center; gap: 12px; padding: 12px 16px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.lgvl-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--fb-subtle, #f7f7f8); color: var(--fb-muted, #6b7280); display: flex; align-items: center; justify-content: center; }
.lgvl-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lgvl-name { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgvl-meta { font-size: var(--fs-sm); color: var(--fb-faint, #9ca3af); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgvl-summary { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; flex-shrink: 0; }
.lgvl-chevron { color: var(--fb-faint, #9ca3af); }
.lgvl-mini { font-size: var(--fs-xs); font-weight: var(--fw-bold); border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
.lgvl-mini--muted { background: var(--fb-subtle, #f3f4f6); color: var(--fb-muted, #6b7280); }
/* Même accent que le besoin prédit / à déposer de LogisticItemCard. */
.lgvl-mini--deposit { background: var(--fb-warning-soft, #fffbeb); color: #B45309; }
.lgvl-detail { border-top: 1px solid var(--fb-subtle, #f3f4f6); padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.lgvl-section { margin: 8px 2px 0; font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--fb-muted, #6b7280); }

@media (max-width: 760px) {
  /* Téléphone du logisticien : à déposer et PDV concernés restent visibles,
     passés sous le nom de l'article. */
  .lgvl-trigger { grid-template-columns: 36px minmax(0, 1fr) 18px; gap: 4px 8px; padding: 10px 12px; }
  .lgvl-icon { grid-row: span 2; }
  .lgvl-chevron { grid-column: 3; grid-row: 1; }
  .lgvl-summary { grid-column: 2; grid-row: 2; justify-content: flex-start; }
}
</style>
