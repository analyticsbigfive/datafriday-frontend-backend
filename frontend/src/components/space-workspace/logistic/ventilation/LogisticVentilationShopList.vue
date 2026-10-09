<template>
  <div class="lgvs-list">
    <div
      v-for="card in cards.shops"
      :key="card.shopId"
      class="lgvs-card"
      :class="{ 'lgvs-card--expanded': isExpanded(card.shopId) }"
    >
      <button type="button" class="lgvs-trigger" :aria-expanded="isExpanded(card.shopId)" @click="toggle(card.shopId)">
        <span class="lgvs-icon"><v-icon size="18">mdi-storefront-outline</v-icon></span>
        <span class="lgvs-name">{{ card.shopName }}</span>
        <span class="lgvs-mini">{{ depositCount(card) }} {{ t('logiVentilationItemsSuffix') }}</span>
        <v-icon size="16" class="lgvs-chevron">{{ isExpanded(card.shopId) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </button>
      <div v-if="isExpanded(card.shopId)" class="lgvs-detail">
        <LogisticVentilationRow
          v-for="entry in card.items"
          :key="entry.itemKey"
          :row="entry.row"
          :item="entry"
          :label="entry.itemName"
          item-icon
          :can-confirm="canConfirm"
          @confirm="$emit('confirm', { group: entry, row: entry.row })"
        />
      </div>
    </div>

    <!-- Tous les stockages du périmètre, même sans rien à y déposer (maquette
         Bertrand 2026-10-09), avec tous les articles de la feuille. -->
    <template v-if="cards.storages.length">
      <div class="lgvs-section">{{ t('logiVentilationStorageSection') }}</div>
      <div
        v-for="card in cards.storages"
        :key="`storage-${card.shopId}`"
        class="lgvs-card"
        :class="{ 'lgvs-card--expanded': isExpanded(`storage-${card.shopId}`) }"
      >
        <button
          type="button"
          class="lgvs-trigger"
          :aria-expanded="isExpanded(`storage-${card.shopId}`)"
          @click="toggle(`storage-${card.shopId}`)"
        >
          <span class="lgvs-icon"><v-icon size="18">mdi-warehouse</v-icon></span>
          <span class="lgvs-name">{{ card.shopName }}</span>
          <span v-if="depositCount(card)" class="lgvs-mini">{{ depositCount(card) }} {{ t('logiVentilationItemsSuffix') }}</span>
          <v-icon size="16" class="lgvs-chevron">{{ isExpanded(`storage-${card.shopId}`) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>
        <div v-if="isExpanded(`storage-${card.shopId}`)" class="lgvs-detail">
          <LogisticVentilationRow
            v-for="entry in card.items"
            :key="entry.itemKey"
            :row="entry.row"
            :item="entry"
            :label="entry.itemName"
            item-icon
            :can-confirm="canConfirm"
            @confirm="$emit('confirm', { group: entry, row: entry.row })"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { groupDepositGroupsByShop } from '@/utils/ventilationViews'
import LogisticVentilationRow from './LogisticVentilationRow.vue'

const { t } = useI18n()

const props = defineProps({
  /** Groupes par article (groupDepositLinesByItem), déjà filtrés. */
  groups: { type: Array, default: () => [] },
  /** Stockages du périmètre `{ id, name }`. */
  storages: { type: Array, default: () => [] },
  canConfirm: { type: Boolean, default: false },
})
defineEmits(['confirm'])

const cards = computed(() => groupDepositGroupsByShop(props.groups, props.storages))

const expanded = reactive({})
function isExpanded(key) { return !!expanded[key] }
function toggle(key) { expanded[key] = !expanded[key] }

/** Articles ayant quelque chose à déposer dans cette destination. */
function depositCount(card) {
  return card.items.filter((i) => i.row.quantity > 0).length
}
</script>

<style scoped>
.lgvs-list { display: flex; flex-direction: column; gap: 10px; }
.lgvs-card { border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; background: var(--fb-surface, #fff); box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05)); overflow: hidden; }
.lgvs-card--expanded { border-color: rgba(255, 49, 49, 0.28); box-shadow: var(--fb-shadow-hover, 0 6px 20px rgba(15, 23, 42, 0.08)); }
.lgvs-trigger { appearance: none; width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 18px; align-items: center; gap: 12px; padding: 12px 16px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.lgvs-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--fb-subtle, #f7f7f8); color: var(--fb-muted, #6b7280); display: flex; align-items: center; justify-content: center; }
.lgvs-name { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.lgvs-mini { font-size: var(--fs-xs); font-weight: var(--fw-bold); border-radius: 999px; padding: 3px 9px; white-space: nowrap; background: var(--fb-warning-soft, #fffbeb); color: #B45309; }
.lgvs-chevron { color: var(--fb-faint, #9ca3af); }
.lgvs-detail { border-top: 1px solid var(--fb-subtle, #f3f4f6); padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.lgvs-section { margin: 8px 2px 0; font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--fb-muted, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; }
</style>
