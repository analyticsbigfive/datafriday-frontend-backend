<template>
  <div class="lgbi-root">
    <div class="lgbi-toolbar">
      <span class="lgbi-count">{{ groupedItems.length }} {{ t('logiByItemCountSuffix') }}</span>
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
            <span class="lgbi-meta">
              <template v-if="group.unitsPerPack">{{ group.unitsPerPack }} {{ group.unit || t('logiUnits') }}/{{ packagingTypeLabel(group) }}</template>
              <template v-else>{{ group.rows.length }} {{ t('logiByItemShopsSuffix') }}</template>
              <template v-if="group.totalPredictedPacks != null"> · <span class="lgbi-predicted-inline">{{ group.totalPredictedPacks }} {{ predictedPacksLabel(group) }}</span></template>
            </span>
          </span>
          <span class="lgbi-summary">
            <span class="lgbi-mini lgbi-mini--muted">{{ group.rows.length }} {{ t('logiByItemShopsSuffix') }}</span>
          </span>
          <v-icon size="16" class="lgbi-chevron">{{ isExpanded(group.itemName) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>

        <div v-show="isExpanded(group.itemName)" class="lgbi-detail">
          <div
            v-for="row in group.rows"
            :key="`${row.elementId}::${group.itemName}`"
            class="lgbi-shop-row"
            :class="`lgbi-shop-row--${row.status}`"
          >
            <button
              type="button"
              class="lgbi-shop-main"
              @click="$emit('go', { elementId: row.elementId, itemName: group.itemName })"
            >
              <span class="lgbi-shop-icon"><v-icon size="14">mdi-storefront-outline</v-icon></span>
              <span class="lgbi-shop-copy">
                <span class="lgbi-shop-name">{{ row.elementName }}</span>
                <span v-if="row.configNames.length" class="lgbi-cfg-tag" :title="row.configNames.join(', ')">
                  {{ row.configNames.length }} {{ t('logiConfigCountSuffix') }}
                </span>
              </span>
            </button>
            <span class="lgbi-shop-stats">
              {{ compactQtyLabel(row.packed, row.loose, row.item, group.unitsPerPack, t, locale, formatUnits) }}
              <template v-if="row.predictedNeedPacks != null"> · <span class="lgbi-predicted-inline">{{ row.predictedNeedPacks }} <small>{{ predictedPacksLabel(group) }}</small></span></template>
              <template v-else-if="row.predictedNeed != null"> · <span class="lgbi-predicted-inline">{{ formatUnits(row.predictedNeed) }}{{ group.unit ? ` ${group.unit}` : '' }} <small>{{ t('logiPredictedShort') }}</small></span></template>
            </span>
            <span class="lgbi-shop-actions">
              <button
                type="button"
                class="lgbi-mini-btn lgbi-mini-btn--remove"
                :title="t('logiRemoveTitle')"
                @click.stop="$emit('remove', { element: { id: row.elementId, name: row.elementName }, item: row.item })"
              >
                <v-icon size="14">mdi-minus</v-icon>
              </button>
              <button
                type="button"
                class="lgbi-mini-btn lgbi-mini-btn--add"
                :title="t('logiAddTitle')"
                @click.stop="$emit('add', { element: { id: row.elementId, name: row.elementName }, item: row.item })"
              >
                <v-icon size="14">mdi-plus</v-icon>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'
import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'
import { compactQtyLabel } from '@/composables/useLogisticUnitLabels'

const { t, locale } = useI18n()

/** Type de conditionnement réel (ex. "Carton", "Fût") quand connu (item.packagingType,
 *  résolu côté backend, cf. LogisticItemCard.vue packLabel) — repli sur le mot générique
 *  "pack" seulement si aucun type n'est configuré (BUG-348-02 : ce libellé affichait "pack"
 *  pour tout le monde, y compris quand le vrai type était déjà disponible sur `item`). */
function packagingTypeLabel(group) {
  return translatePackagingType(group.packagingType, locale.value) || t('logiPacksShort')
}

/** Libellé "N {Type} predicted" (ex. "27 Pipettes predicted") — même repli que
 *  packagingTypeLabel, réutilisé pour l'en-tête ET les lignes dépliées (BUG-348-02 : le
 *  besoin prédit affichait encore "packs" générique alors que le type était déjà résolu,
 *  juste à côté, pour le ratio unitsPerPack). */
function predictedPacksLabel(group) {
  const type = translatePackagingType(group.packagingType, locale.value)
  const word = type ? pluralize(type) : t('logiPacksShort')
  return `${word} ${t('logiPredictedShort')}`
}

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
  /** (elementId, item) => number|null — besoin prédit (réarmement, repli Event Predict). */
  predictedNeedFor: { type: Function, default: () => null },
  /** (elementId, item) => number|null — packs déjà décidés au réarmement (natif,
   *  packaging.packedCount) ; null si repli Event Predict ou pack inconnu — retour
   *  utilisateur 2026-08-19, prioritaire sur une division nous-mêmes. */
  predictedNeedPacksFor: { type: Function, default: () => null },
  /** (elementId, item) => number|null — pack de référence, repli uniquement quand
   *  predictedNeedPacksFor ne renvoie rien (même forme qu'EMBALLÉ). */
  unitsPerPackFor: { type: Function, default: () => null },
})
defineEmits(['go', 'add', 'remove'])

const search = ref('')
const expanded = reactive({})
const failedPictures = new Set()

function isExpanded(key) { return !!expanded[key] }
function toggle(key) { expanded[key] = !expanded[key] }

function kindLabelKey(kind) {
  return { ingredient: 'logiKindIngredient', component: 'logiKindComponent', packaging: 'logiKindPackaging', product: 'logiKindProduct' }[kind] || 'logiKindProduct'
}

/**
 * Pivot élément→items en items→éléments (généralise LogisticAggregateView.groupedItems à
 * TOUS les statuts et TOUS les articles, pas seulement bad/warn). "Jamais compté" prend le
 * pas sur bad/warn/ok pour le fond des lignes dépliées : un article sans aucun InventoryCount
 * n'a pas de signal fiable (le stock attendu par défaut à 0/0 sans mouvement serait sinon
 * confondu avec une vraie rupture confirmée) — choix d'implémentation par défaut, pas une
 * règle métier tranchée (cf. chantier 341, PLAN.md). L'affichage principal (retour utilisateur
 * 2026-08-19) privilégie le besoin prédit (réarmement) plutôt que ce statut, plus parlant que
 * "jamais compté" quand le stock physique n'a simplement pas encore été suivi.
 */
const groupedItems = computed(() => {
  const map = new Map()
  for (const entry of props.entries) {
    for (const item of entry.items || []) {
      if (props.itemKindFilter.length && !props.itemKindFilter.includes(item.kind || 'product')) continue
      let group = map.get(item.name)
      if (!group) {
        group = {
          itemName: item.name,
          kind: item.kind || 'product',
          unit: item.unit || null,
          packagingType: item.packagingType || null,
          picture: props.resolveItemPicture(item) || null,
          rows: [],
        }
        map.set(item.name, group)
      } else {
        if (!group.picture) group.picture = props.resolveItemPicture(item) || null
        if (!group.unit) group.unit = item.unit || null
        if (!group.packagingType) group.packagingType = item.packagingType || null
      }
      const rawStatus = props.itemStatus(entry.element.id, item)
      const counted = props.isCounted(entry.element.id, item)
      const expected = props.expectedDisplay(entry.element.id, item)
      const predictedNeed = props.predictedNeedFor(entry.element.id, item)
      const nativePacks = props.predictedNeedPacksFor(entry.element.id, item)
      const unitsPerPack = Number(props.unitsPerPackFor(entry.element.id, item)) || null
      group.rows.push({
        elementId: entry.element.id,
        elementName: entry.element.name,
        item,
        configNames: props.configNamesFor(entry.element) || [],
        status: counted ? rawStatus : 'uncounted',
        packed: expected.packed,
        loose: expected.loose,
        predictedNeed,
        predictedNeedPacks: nativePacks != null ? nativePacks : (unitsPerPack && predictedNeed != null ? Math.ceil(predictedNeed / unitsPerPack) : null),
      })
      if (!group.unitsPerPack && unitsPerPack) group.unitsPerPack = unitsPerPack
    }
  }
  const q = search.value.trim().toLowerCase()
  return [...map.values()]
    .filter((g) => !q || g.itemName.toLowerCase().includes(q))
    .map((g) => {
      const severity = (s) => ({ bad: 3, warn: 2, uncounted: 1, ok: 0 }[s] || 0)
      const rows = [...g.rows].sort((a, b) => severity(b.status) - severity(a.status) || a.elementName.localeCompare(b.elementName, 'fr'))
      const predictedRows = rows.filter((r) => r.predictedNeedPacks != null)
      const totalPredictedPacks = predictedRows.length ? predictedRows.reduce((sum, r) => sum + r.predictedNeedPacks, 0) : null
      return { ...g, rows, totalPredictedPacks }
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
.lgbi-meta { font-size: 0.75rem; color: var(--fb-faint, #9ca3af); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgbi-summary { display: flex; gap: 6px; flex-shrink: 0; }
.lgbi-chevron { color: var(--fb-faint, #9ca3af); }

.lgbi-mini { font-size: 0.68rem; font-weight: 700; border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
.lgbi-mini--bad { background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #dc2626); }
.lgbi-mini--warn { background: var(--fb-warning-soft, #fffbeb); color: var(--fb-warning, #d97706); }
.lgbi-mini--ok { background: #f0fdf4; color: #16a34a; }
.lgbi-mini--muted { background: var(--fb-subtle, #f3f4f6); color: var(--fb-muted, #6b7280); }

.lgbi-detail { border-top: 1px solid var(--fb-subtle, #f3f4f6); padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
.lgbi-shop-row { width: 100%; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 160px) minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgbi-shop-row--bad { background: var(--fb-danger-soft, #fef2f2); border-color: rgba(220, 38, 38, 0.25); }
.lgbi-shop-row--warn { background: var(--fb-warning-soft, #fffbeb); border-color: rgba(217, 119, 6, 0.25); }
.lgbi-shop-main { appearance: none; border: 0; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-align: left; }
.lgbi-shop-icon { width: 26px; height: 26px; border-radius: 7px; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); display: flex; align-items: center; justify-content: center; color: var(--fb-muted, #6b7280); flex-shrink: 0; }
.lgbi-shop-copy { min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; }
.lgbi-shop-name { font-size: 0.82rem; font-weight: 700; color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.lgbi-cfg-tag { flex-shrink: 0; display: inline-flex; align-items: center; font-size: 0.62rem; font-weight: 700; border-radius: 999px; padding: 1px 7px; background: var(--fb-subtle, #f1f5f9); color: var(--fb-muted, #475569); white-space: nowrap; }
.lgbi-shop-stats { text-align: right; font-size: 0.8rem; font-weight: 700; color: var(--fb-text, #212121); white-space: nowrap; flex-shrink: 0; }
.lgbi-shop-stats small { font-size: 0.64rem; font-weight: 600; color: var(--fb-faint, #9ca3af); }
/* Besoin prédit accolé après emballé/vrac : même taille/format, seul l'accent
   (#B45309, même couleur que LogisticItemCard) le distingue — retour utilisateur
   2026-08-19, plus de colonne ni de libellé séparés. */
.lgbi-predicted-inline { color: #B45309; font-weight: 700; }
.lgbi-predicted-inline small { font-size: 0.64rem; font-weight: 600; color: #B45309; }
.lgbi-shop-actions { display: flex; gap: 6px; flex-shrink: 0; }
.lgbi-mini-btn { width: 26px; height: 26px; border-radius: 7px; border: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.lgbi-mini-btn--add { background: var(--fb-success-soft, #f0fdf4); color: var(--fb-success, #16a34a); }
.lgbi-mini-btn--remove { background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #dc2626); }

@media (max-width: 760px) {
  .lgbi-trigger { grid-template-columns: 36px minmax(0, 1fr) 18px; }
  .lgbi-summary { display: none; }
  .lgbi-shop-row { grid-template-columns: minmax(0, 1fr); row-gap: 6px; }
  .lgbi-shop-stats { text-align: left; }
  .lgbi-shop-actions { justify-content: flex-start; }
}
</style>
