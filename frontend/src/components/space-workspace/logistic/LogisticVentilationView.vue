<template>
  <div class="lgv-root">
    <div class="lgv-toolbar">
      <span class="lgv-count">
        {{ filteredGroups.length }} {{ t('logiVentilationCountSuffix') }}
        <template v-if="planName"> · {{ planName }}</template>
      </span>
      <div class="lgv-search">
        <v-icon size="14">mdi-magnify</v-icon>
        <input
          v-model="search"
          type="text"
          :placeholder="t('logiByItemSearchPlaceholder')"
          class="lgv-search-input"
        />
      </div>
    </div>

    <div v-if="loading" class="lgv-empty">
      <v-progress-circular size="20" width="2" indeterminate />
    </div>
    <div v-else-if="source !== 'restock'" class="lgv-empty">
      {{ t('logiVentilationNoPlan') }}
      <router-link v-if="eventPredictRoute" :to="eventPredictRoute" class="lgv-link">
        {{ t('logiVentilationOpenEventPredict') }}
        <v-icon size="14">mdi-arrow-right</v-icon>
      </router-link>
    </div>
    <div v-else-if="!groups.length" class="lgv-empty">{{ t('logiVentilationAllDone') }}</div>
    <div v-else-if="!filteredGroups.length" class="lgv-empty">{{ t('logiAggEmpty') }}</div>

    <div v-else class="lgv-list">
      <div
        v-for="group in filteredGroups"
        :key="group.itemKey"
        class="lgv-card"
        :class="{ 'lgv-card--expanded': isExpanded(group.itemKey) }"
      >
        <button
          type="button"
          class="lgv-trigger"
          :aria-expanded="isExpanded(group.itemKey)"
          @click="toggle(group.itemKey)"
        >
          <span class="lgv-icon"><v-icon size="18">mdi-package-variant-closed</v-icon></span>
          <span class="lgv-copy">
            <span class="lgv-name">{{ group.itemName }}</span>
            <span v-if="group.unitsPerPack" class="lgv-meta">
              {{ formatUnits(group.unitsPerPack) }} {{ group.unit || t('logiUnits') }}/{{ packagingWord(group, 1) }}
            </span>
          </span>
          <span class="lgv-summary">
            <span class="lgv-mini lgv-mini--deposit">{{ quantityLabel(group, group.totalQuantity, group.totalPacks) }}</span>
            <span v-if="pdvCount(group)" class="lgv-mini lgv-mini--muted">{{ pdvCount(group) }} {{ t('logiByItemShopsSuffix') }}</span>
            <span v-if="storageCount(group)" class="lgv-mini lgv-mini--muted">{{ storageCount(group) }} {{ t('logiVentilationStoragesSuffix') }}</span>
          </span>
          <v-icon size="16" class="lgv-chevron">{{ isExpanded(group.itemKey) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>

        <div v-show="isExpanded(group.itemKey)" class="lgv-detail">
          <div v-for="row in group.rows" :key="row.rowKey" class="lgv-row">
            <span class="lgv-row-icon"><v-icon size="14">{{ row.elementType === 'storage' ? 'mdi-warehouse' : 'mdi-storefront-outline' }}</v-icon></span>
            <span class="lgv-row-name">{{ row.shopName }}</span>
            <span class="lgv-row-qty">{{ quantityLabel(group, row.quantity, row.packs) }}</span>
            <button
              v-if="canConfirm"
              type="button"
              class="lgv-confirm-btn"
              :title="t('logiDepositConfirmTitle')"
              @click="$emit('confirm', { group, row })"
            >
              <v-icon size="14">mdi-plus</v-icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'

const { t, locale } = useI18n()

const props = defineProps({
  /** Sortie de groupDepositLinesByItem (utils/restockDepositSheet.js). */
  groups: { type: Array, default: () => [] },
  /** Nom de la feuille de réarmement source. */
  planName: { type: String, default: null },
  /** 'restock' | 'forecast' | null : sans feuille de réarmement, rien n'est « à déposer ». */
  source: { type: String, default: null },
  loading: { type: Boolean, default: false },
  /** Route Event Predict du match (utilisateurs connectés) ; null = pas de lien (accès QR). */
  eventPredictRoute: { type: Object, default: null },
  /** Affiche le bouton de confirmation de dépôt sur chaque ligne. */
  canConfirm: { type: Boolean, default: false },
})
defineEmits(['confirm'])

const search = ref('')
const expanded = reactive({})

function isExpanded(key) { return !!expanded[key] }
function toggle(key) { expanded[key] = !expanded[key] }

const filteredGroups = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.groups
  return props.groups.filter((g) => g.itemName.toLowerCase().includes(q))
})

/** Destinations PDV (les stockages sont comptés à part, demande « N PDV concernés »). */
function pdvCount(group) {
  return group.rows.filter((r) => r.elementType !== 'storage').length
}
function storageCount(group) {
  return group.rows.filter((r) => r.elementType === 'storage').length
}

/** Type de conditionnement traduit (« Carton », « Fût »), repli sur « pack ». */
function packagingWord(group, count) {
  const type = translatePackagingType(group.packagingType, locale.value)
  if (!type) return t('logiPacksShort')
  return count > 1 ? pluralize(type) : type
}

/** Packs décidés au réarmement en priorité, sinon la quantité dans l'unité de l'article. */
function quantityLabel(group, quantity, packs) {
  if (packs != null) return `${formatUnits(packs)} ${packagingWord(group, packs)}`
  return `${formatUnits(quantity)}${group.unit ? ` ${group.unit}` : ''}`
}
</script>

<style scoped>
.lgv-root { display: flex; flex-direction: column; gap: 12px; }
.lgv-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 2px; }
.lgv-count { font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--fb-muted, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgv-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--fb-border, #e5e7eb); background: var(--fb-surface, #fff); border-radius: 999px; padding: 7px 14px; width: 240px; flex-shrink: 0; color: var(--fb-faint, #9ca3af); }
.lgv-search-input { border: 0; outline: none; background: transparent; font-size: var(--fs-base); color: var(--fb-text, #212121); width: 100%; }
.lgv-empty { color: var(--fb-faint, #9ca3af); font-size: var(--fs-md); padding: 24px 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lgv-link { display: inline-flex; align-items: center; gap: 4px; color: #ff3131; font-weight: var(--fw-bold); text-decoration: none; }
.lgv-link:hover { text-decoration: underline; }

.lgv-list { display: flex; flex-direction: column; gap: 10px; }
.lgv-card { border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; background: var(--fb-surface, #fff); box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05)); overflow: hidden; }
.lgv-card--expanded { border-color: rgba(255, 49, 49, 0.28); box-shadow: var(--fb-shadow-hover, 0 6px 20px rgba(15, 23, 42, 0.08)); }
.lgv-trigger { appearance: none; width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 18px; align-items: center; gap: 12px; padding: 12px 16px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.lgv-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--fb-subtle, #f7f7f8); color: var(--fb-muted, #6b7280); display: flex; align-items: center; justify-content: center; }
.lgv-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lgv-name { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgv-meta { font-size: var(--fs-sm); color: var(--fb-faint, #9ca3af); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgv-summary { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; flex-shrink: 0; }
.lgv-chevron { color: var(--fb-faint, #9ca3af); }
.lgv-mini { font-size: var(--fs-xs); font-weight: var(--fw-bold); border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
.lgv-mini--muted { background: var(--fb-subtle, #f3f4f6); color: var(--fb-muted, #6b7280); }
/* Même accent que le besoin prédit / à déposer de LogisticItemCard. */
.lgv-mini--deposit { background: var(--fb-warning-soft, #fffbeb); color: #B45309; }

.lgv-detail { border-top: 1px solid var(--fb-subtle, #f3f4f6); padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.lgv-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgv-row-icon { width: 26px; height: 26px; border-radius: 7px; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); display: flex; align-items: center; justify-content: center; color: var(--fb-muted, #6b7280); }
.lgv-row-name { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgv-row-qty { font-size: var(--fs-base); font-weight: var(--fw-bold); color: #B45309; white-space: nowrap; }
.lgv-confirm-btn { width: 26px; height: 26px; border-radius: 7px; border: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--fb-success-soft, #f0fdf4); color: var(--fb-success, #16a34a); }

@media (max-width: 760px) {
  .lgv-toolbar { flex-wrap: wrap; }
  .lgv-search { width: 100%; }
  /* Téléphone du logisticien : les deux colonnes demandées (à déposer, PDV
     concernés) restent visibles, passées sous le nom de l'article. */
  .lgv-trigger { grid-template-columns: 36px minmax(0, 1fr) 18px; gap: 4px 8px; padding: 10px 12px; }
  .lgv-icon { grid-row: span 2; }
  .lgv-chevron { grid-column: 3; grid-row: 1; }
  .lgv-summary { grid-column: 2; grid-row: 2; justify-content: flex-start; }
}
</style>
