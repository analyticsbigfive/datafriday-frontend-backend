<template>
  <div class="lgv-root">
    <div class="lgv-toolbar">
      <span class="lgv-count">
        {{ filteredGroups.length }} {{ t('logiVentilationCountSuffix') }}
        <template v-if="planName"> · {{ planName }}</template>
      </span>
      <div class="lgv-actions">
        <!-- Recherche propre à la page des logisticiens ; l'écran Logistique passe
             celle de la barre collée sous le bandeau (`search`). -->
        <div v-if="showSearch" class="lgv-search">
          <v-icon size="14">mdi-magnify</v-icon>
          <input
            v-model="localSearch"
            type="text"
            :placeholder="t('logiByItemSearchPlaceholder')"
            class="lgv-search-input"
          />
        </div>
        <!-- Filtre Fournisseur, à gauche de la bascule (maquette Bertrand 2026-10-09). -->
        <LogisticSupplierSelect
          v-if="supplierOptions.length"
          :options="supplierOptions"
          :model-value="supplierFilter"
          @update:model-value="$emit('update:supplierFilter', $event)"
        />
        <!-- Bascule Par PdV / Par article (maquette Bertrand 2026-10-09). -->
        <div class="lgv-toggle" role="group" :aria-label="t('logiVentilationViewLabel')">
          <button
            type="button"
            class="lgv-toggle-btn"
            :class="{ 'lgv-toggle-btn--active': mode === VENTILATION_VIEW_BY_SHOP }"
            :aria-pressed="mode === VENTILATION_VIEW_BY_SHOP"
            @click="$emit('update:mode', VENTILATION_VIEW_BY_SHOP)"
          >{{ t('logiVentilationByShop') }}</button>
          <button
            type="button"
            class="lgv-toggle-btn"
            :class="{ 'lgv-toggle-btn--active': mode === VENTILATION_VIEW_BY_ITEM }"
            :aria-pressed="mode === VENTILATION_VIEW_BY_ITEM"
            @click="$emit('update:mode', VENTILATION_VIEW_BY_ITEM)"
          >{{ t('logiVentilationByItem') }}</button>
        </div>
        <button
          v-if="showPrint"
          type="button"
          class="lgv-icon-btn"
          :title="t('logiPrintTitle')"
          :aria-label="t('logiPrintTitle')"
          @click="$emit('print')"
        >
          <v-icon size="20">mdi-printer-outline</v-icon>
        </button>
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

    <LogisticVentilationShopList
      v-else-if="mode === VENTILATION_VIEW_BY_SHOP"
      :groups="filteredGroups"
      :storages="storages"
      :can-confirm="canConfirm"
      @confirm="$emit('confirm', $event)"
    />
    <LogisticVentilationItemList
      v-else
      :groups="filteredGroups"
      :storages="storages"
      :can-confirm="canConfirm"
      @confirm="$emit('confirm', $event)"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import {
  VENTILATION_VIEW_BY_ITEM,
  VENTILATION_VIEW_BY_SHOP,
  filterGroupsBySearch,
} from '@/utils/ventilationViews'
import LogisticVentilationItemList from './ventilation/LogisticVentilationItemList.vue'
import LogisticVentilationShopList from './ventilation/LogisticVentilationShopList.vue'
import LogisticSupplierSelect from './ventilation/LogisticSupplierSelect.vue'

const { t } = useI18n()

const props = defineProps({
  /** Groupes par article (groupDepositLinesByItem), filtre fournisseur appliqué. */
  groups: { type: Array, default: () => [] },
  /** Stockages du périmètre `{ id, name }` : section « Espaces de stockage ». */
  storages: { type: Array, default: () => [] },
  /** Vue affichée : 'shop' (Par PdV) ou 'item' (Par article). */
  mode: { type: String, default: VENTILATION_VIEW_BY_ITEM },
  /** Nom de la feuille de réarmement source. */
  planName: { type: String, default: null },
  /** 'restock' | 'forecast' | null : sans feuille de réarmement, rien n'est « à déposer ». */
  source: { type: String, default: null },
  loading: { type: Boolean, default: false },
  /** Route Event Predict du match (utilisateurs connectés) ; null = pas de lien (accès QR). */
  eventPredictRoute: { type: Object, default: null },
  /** Affiche le bouton de confirmation de dépôt sur chaque ligne. */
  canConfirm: { type: Boolean, default: false },
  /** Recherche fournie par l'écran hôte (barre sous le bandeau). */
  search: { type: String, default: '' },
  /** Recherche intégrée (page des logisticiens, sans barre sous un bandeau). */
  showSearch: { type: Boolean, default: false },
  /** Bouton imprimer (fenêtre Excel / PDF / Impression). */
  showPrint: { type: Boolean, default: false },
  /** Options du filtre Fournisseur ; vide = filtre masqué. */
  supplierOptions: { type: Array, default: () => [] },
  /** Fournisseurs choisis (vide = tous). */
  supplierFilter: { type: Array, default: () => [] },
})
defineEmits(['confirm', 'print', 'update:mode', 'update:supplierFilter'])

const localSearch = ref('')
const filteredGroups = computed(() =>
  filterGroupsBySearch(props.groups, props.showSearch ? localSearch.value : props.search),
)
</script>

<style scoped>
.lgv-root { display: flex; flex-direction: column; gap: 12px; }
.lgv-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 2px; }
.lgv-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
/* Bascule segmentée (maquette : pilule claire, segment actif gris). */
.lgv-toggle { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 999px; background: var(--fb-surface, #fff); }
.lgv-toggle-btn { border: 0; background: transparent; border-radius: 999px; padding: 5px 12px; font-size: var(--fs-sm); font-weight: var(--fw-semibold, 600); color: var(--fb-muted, #6b7280); cursor: pointer; white-space: nowrap; }
.lgv-toggle-btn--active { background: var(--fb-subtle-strong, #e5e7eb); color: var(--fb-text, #212121); font-weight: var(--fw-bold); }
.lgv-icon-btn { width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; color: var(--fb-text, #212121); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.lgv-icon-btn:hover { background: var(--fb-subtle, #f3f4f6); }
.lgv-count { font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--fb-muted, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgv-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--fb-border, #e5e7eb); background: var(--fb-surface, #fff); border-radius: 999px; padding: 7px 14px; width: 240px; flex-shrink: 0; color: var(--fb-faint, #9ca3af); }
.lgv-search-input { border: 0; outline: none; background: transparent; font-size: var(--fs-base); color: var(--fb-text, #212121); width: 100%; }
.lgv-empty { color: var(--fb-faint, #9ca3af); font-size: var(--fs-md); padding: 24px 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lgv-link { display: inline-flex; align-items: center; gap: 4px; color: #ff3131; font-weight: var(--fw-bold); text-decoration: none; }
.lgv-link:hover { text-decoration: underline; }


@media (max-width: 760px) {
  .lgv-toolbar { flex-wrap: wrap; }
  .lgv-actions { width: 100%; flex-wrap: wrap; }
  .lgv-search { width: 100%; }
}
</style>
