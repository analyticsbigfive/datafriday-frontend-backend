<template>
  <div class="lgbi-root">
    <div class="lgbi-toolbar">
      <span class="lgbi-count">{{ t('logiByItemCount', { count: groupedItems.length }) }}</span>
      <div class="lgbi-search">
        <v-icon size="14">mdi-magnify</v-icon>
        <input
          v-model="search"
          type="text"
          :placeholder="t('logiByItemSearchPlaceholder')"
          class="lgbi-search-input"
        />
      </div>
    </div>

    <div v-if="!groupedItems.length" class="lgbi-empty">{{ t('logiAggEmpty') }}</div>

    <div v-else class="lgbi-list">
      <div
        v-for="group in groupedItems"
        :key="group.itemName"
        class="lgbi-card"
        :class="{ 'lgbi-card--expanded': isExpanded(group.itemName) }"
      >
        <button
          type="button"
          class="lgbi-trigger"
          :aria-expanded="isExpanded(group.itemName)"
          @click="toggle(group.itemName)"
        >
          <span class="lgbi-icon">
            <img v-if="group.picture && !failedPictures.has(group.itemName)" :src="group.picture" :alt="group.itemName" @error="failedPictures.add(group.itemName)" />
            <v-icon v-else size="18">mdi-package-variant-closed</v-icon>
          </span>
          <span class="lgbi-copy">
            <span class="lgbi-name">
              {{ group.itemName }}
              <span class="lgbi-kind">{{ t(kindLabelKey(group.kind)) }}</span>
            </span>
            <span class="lgbi-meta">{{ t('logiByItemShopsSuffix', { count: group.rows.length }) }}</span>
          </span>
          <span class="lgbi-summary">
            <span v-if="group.bad" class="lgbi-mini lgbi-mini--bad">{{ group.bad }} {{ t('logiAggStatRuptures') }}</span>
            <span v-if="group.warn" class="lgbi-mini lgbi-mini--warn">{{ group.warn }} {{ t('logiAggStatLow') }}</span>
            <span v-if="group.ok" class="lgbi-mini lgbi-mini--ok">{{ group.ok }} {{ t('logiByItemStatusOk') }}</span>
            <span v-if="group.uncounted" class="lgbi-mini lgbi-mini--muted">{{ group.uncounted }} {{ t('logiByItemStatusNeverCounted') }}</span>
          </span>
          <v-icon size="16" class="lgbi-chevron">{{ isExpanded(group.itemName) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>

        <div v-show="isExpanded(group.itemName)" class="lgbi-detail">
          <button
            v-for="row in group.rows"
            :key="`${row.elementId}::${group.itemName}`"
            type="button"
            class="lgbi-shop-row"
            :class="`lgbi-shop-row--${row.status}`"
            @click="$emit('go', { elementId: row.elementId, itemName: group.itemName })"
          >
            <span class="lgbi-shop-icon"><v-icon size="14">mdi-storefront-outline</v-icon></span>
            <span class="lgbi-shop-copy">
              <span class="lgbi-shop-name">
                {{ row.elementName }}
                <span v-if="row.configNames.length" class="lgbi-cfg-tag" :title="row.configNames.join(', ')">{{ row.configNames.join(', ') }}</span>
              </span>
            </span>
            <span class="lgbi-shop-stats">
              {{ row.packed }} <small>{{ t('logiPackedShort') }}</small> · {{ formatUnits(row.loose) }} <small>{{ t('logiLooseShort') }}</small>
            </span>
            <span class="lgbi-mini" :class="statusMiniClass(row.status)">{{ t(statusLabelKey(row.status)) }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'

const { t } = useI18n()

const props = defineProps({
  /** [{ element: {id, name, configIds}, items: [...] }] — shops + storages combinés (question
   *  58, tranchée le 2026-08-19 : les deux inclus). */
  entries: { type: Array, default: () => [] },
  itemKindFilter: { type: Array, default: () => [] },
  /** (elementId, item) => 'bad' | 'warn' | 'ok' */
  itemStatus: { type: Function, required: true },
  /** (elementId, item) => boolean — false si jamais compté (InventoryCount absent). */
  isCounted: { type: Function, required: true },
  /** (elementId, item) => { packed, loose } */
  expectedDisplay: { type: Function, required: true },
  resolveItemPicture: { type: Function, default: () => null },
  /** (element) => string[] — noms des configs source (chantier 341, vue agrégée). */
  configNamesFor: { type: Function, default: () => [] },
})
defineEmits(['go'])

const search = ref('')
const expanded = reactive({})
const failedPictures = new Set()

function isExpanded(key) { return !!expanded[key] }
function toggle(key) { expanded[key] = !expanded[key] }

function kindLabelKey(kind) {
  return { ingredient: 'logiKindIngredient', component: 'logiKindComponent', packaging: 'logiKindPackaging', product: 'logiKindProduct' }[kind] || 'logiKindProduct'
}
function statusLabelKey(status) {
  return { bad: 'logiAggStatRuptures', warn: 'logiAggStatLow', ok: 'logiByItemStatusOk', uncounted: 'logiByItemStatusNeverCounted' }[status]
}
function statusMiniClass(status) {
  return { bad: 'lgbi-mini--bad', warn: 'lgbi-mini--warn', ok: 'lgbi-mini--ok', uncounted: 'lgbi-mini--muted' }[status]
}

/**
 * Pivot élément→items en items→éléments (généralise LogisticAggregateView.groupedItems à
 * TOUS les statuts et TOUS les articles, pas seulement bad/warn). "Jamais compté" prend le
 * pas sur bad/warn/ok pour l'affichage : un article sans aucun InventoryCount n'a pas de
 * signal fiable (le stock attendu par défaut à 0/0 sans mouvement serait sinon confondu
 * avec une vraie rupture confirmée) — choix d'implémentation par défaut, pas une règle
 * métier tranchée (cf. chantier 341, PLAN.md).
 */
const groupedItems = computed(() => {
  const map = new Map()
  for (const entry of props.entries) {
    for (const item of entry.items || []) {
      if (props.itemKindFilter.length && !props.itemKindFilter.includes(item.kind || 'product')) continue
      let group = map.get(item.name)
      if (!group) {
        group = { itemName: item.name, kind: item.kind || 'product', picture: props.resolveItemPicture(item) || null, rows: [] }
        map.set(item.name, group)
      } else if (!group.picture) {
        group.picture = props.resolveItemPicture(item) || null
      }
      const rawStatus = props.itemStatus(entry.element.id, item)
      const counted = props.isCounted(entry.element.id, item)
      const expected = props.expectedDisplay(entry.element.id, item)
      group.rows.push({
        elementId: entry.element.id,
        elementName: entry.element.name,
        configNames: props.configNamesFor(entry.element) || [],
        status: counted ? rawStatus : 'uncounted',
        packed: expected.packed,
        loose: expected.loose,
      })
    }
  }
  const q = search.value.trim().toLowerCase()
  return [...map.values()]
    .filter((g) => !q || g.itemName.toLowerCase().includes(q))
    .map((g) => {
      const bad = g.rows.filter((r) => r.status === 'bad').length
      const warn = g.rows.filter((r) => r.status === 'warn').length
      const uncounted = g.rows.filter((r) => r.status === 'uncounted').length
      const ok = g.rows.length - bad - warn - uncounted
      const severity = (s) => ({ bad: 3, warn: 2, uncounted: 1, ok: 0 }[s] || 0)
      const rows = [...g.rows].sort((a, b) => severity(b.status) - severity(a.status) || a.elementName.localeCompare(b.elementName, 'fr'))
      return { ...g, bad, warn, ok, uncounted, rows }
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'fr'))
})
</script>

<style scoped>
.lgbi-root { display: flex; flex-direction: column; gap: 12px; }
.lgbi-toolbar { display: flex; align-items: center; justify-content: space-between; margin: 0 2px; }
.lgbi-count { font-size: 0.76rem; font-weight: 700; color: var(--fb-muted, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; }
.lgbi-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--fb-border, #e5e7eb); background: var(--fb-surface, #fff); border-radius: 999px; padding: 7px 14px; width: 240px; color: var(--fb-faint, #9ca3af); }
.lgbi-search-input { border: 0; outline: none; background: transparent; font-size: 0.8rem; color: var(--fb-text, #212121); width: 100%; }
.lgbi-empty { color: var(--fb-faint, #9ca3af); font-size: 0.85rem; padding: 24px 8px; text-align: center; }

.lgbi-list { display: flex; flex-direction: column; gap: 10px; }
.lgbi-card { border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; background: var(--fb-surface, #fff); box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05)); overflow: hidden; }
.lgbi-card--expanded { border-color: rgba(255, 49, 49, 0.28); box-shadow: var(--fb-shadow-hover, 0 6px 20px rgba(15, 23, 42, 0.08)); }
.lgbi-trigger { appearance: none; width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto 18px; align-items: center; gap: 12px; padding: 12px 16px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.lgbi-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--fb-subtle, #f7f7f8); color: var(--fb-muted, #6b7280); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.lgbi-icon img { width: 100%; height: 100%; object-fit: cover; }
.lgbi-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lgbi-name { font-size: 0.92rem; font-weight: 700; color: var(--fb-text, #212121); display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgbi-kind { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fb-muted, #64748b); background: var(--fb-subtle, #f1f5f9); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; }
.lgbi-meta { font-size: 0.75rem; color: var(--fb-faint, #9ca3af); }
.lgbi-summary { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; max-width: 320px; }
.lgbi-chevron { color: var(--fb-faint, #9ca3af); }

.lgbi-mini { font-size: 0.68rem; font-weight: 700; border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
.lgbi-mini--bad { background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #dc2626); }
.lgbi-mini--warn { background: var(--fb-warning-soft, #fffbeb); color: var(--fb-warning, #d97706); }
.lgbi-mini--ok { background: #f0fdf4; color: #16a34a; }
.lgbi-mini--muted { background: var(--fb-subtle, #f3f4f6); color: var(--fb-muted, #6b7280); }

.lgbi-detail { border-top: 1px solid var(--fb-subtle, #f3f4f6); padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.lgbi-shop-row { width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-subtle, #fafafa); cursor: pointer; text-align: left; font: inherit; color: inherit; }
.lgbi-shop-row--bad { background: var(--fb-danger-soft, #fef2f2); border-color: rgba(220, 38, 38, 0.25); }
.lgbi-shop-row--warn { background: var(--fb-warning-soft, #fffbeb); border-color: rgba(217, 119, 6, 0.25); }
.lgbi-shop-icon { width: 26px; height: 26px; border-radius: 7px; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); display: flex; align-items: center; justify-content: center; color: var(--fb-muted, #6b7280); }
.lgbi-shop-copy { min-width: 0; }
.lgbi-shop-name { font-size: 0.82rem; font-weight: 700; color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgbi-cfg-tag { margin-left: 8px; display: inline-flex; align-items: center; font-size: 0.64rem; font-weight: 700; border-radius: 999px; padding: 1px 7px; background: var(--fb-subtle, #f1f5f9); color: var(--fb-muted, #475569); white-space: nowrap; }
.lgbi-shop-stats { text-align: right; font-size: 0.8rem; font-weight: 700; color: var(--fb-text, #212121); white-space: nowrap; }
.lgbi-shop-stats small { font-size: 0.64rem; font-weight: 600; color: var(--fb-faint, #9ca3af); }

@media (max-width: 760px) {
  .lgbi-trigger { grid-template-columns: 36px minmax(0, 1fr) 18px; }
  .lgbi-summary { display: none; }
  .lgbi-shop-row { grid-template-columns: 26px minmax(0, 1fr); row-gap: 4px; }
  .lgbi-shop-stats, .lgbi-mini { grid-column: 2; }
}
</style>
