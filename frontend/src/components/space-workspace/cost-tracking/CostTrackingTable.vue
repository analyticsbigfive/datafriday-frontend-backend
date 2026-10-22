<template>
  <section class="ct-card ct-table-card" aria-labelledby="ct-table-title">
    <div id="ct-table-title" class="ct-card__title">{{ t(titleKey) }}</div>
    <div class="ct-card__sub">{{ t(groupBy === 'article' ? 'ctTableHint' : groupBy === 'ingredient' ? 'ctTableHintIngredient' : 'ctTableHintGroup') }}</div>
    <div v-if="!rows.length" class="ct-table__empty">{{ t('ctTableEmpty') }}</div>
    <div v-else class="ct-table__scroll">
      <table class="ct-table">
        <thead>
          <tr>
            <th>{{ t(nameKey) }}</th>
            <th>{{ t('ctColStartCost') }}</th>
            <th>{{ t('ctColCurrentCost') }}</th>
            <th>{{ t('ctColVariation') }}</th>
            <th>{{ t('ctColPrice') }}</th>
            <th>{{ t('ctColMargin') }}</th>
            <th>{{ t('ctColVersions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.key"
            :class="{ 'ct-table__row--click': !!row.id }"
            :tabindex="row.id ? 0 : -1"
            @click="select(row)"
            @keydown.enter="select(row)"
          >
            <td>
              {{ row.name }}
              <span v-if="subLabel(row)" class="ct-table__sub">{{ subLabel(row) }}</span>
              <button
                v-if="row.kind === 'article'"
                type="button"
                class="ct-table__history"
                @click.stop="$emit('history', row.id)"
              >{{ t('ctOpenHistory') }}</button>
            </td>
            <td class="ct-num">{{ fmt.cost(row.startCost) }}</td>
            <td class="ct-num"><b>{{ fmt.cost(row.currentCost) }}</b></td>
            <td class="ct-num ct-delta" :class="fmt.trendClass(row.variation && row.variation.direction)">
              {{ row.variation && row.variation.pct !== null ? fmt.pct(row.variation.pct) : '-' }}
            </td>
            <td class="ct-num">{{ fmt.cost(row.currentPrice) }}</td>
            <td class="ct-num">
              {{ fmt.pctPlain(row.marginEnd) }}
              <span v-if="row.marginDelta !== null" class="ct-table__sub">{{ fmt.points(row.marginDelta) }}</span>
            </td>
            <td class="ct-num">{{ row.versions }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'

// Tableau de détail : une ligne par courbe (type, catégorie, article ou ingrédient). Un clic sur
// une ligne descend d'un niveau (événement `select`), le lien « Historique » d'un article ouvre
// ses versions (`history`). rows : sorties de buildRows (costTrackingRows.js).
const props = defineProps({
  rows: { type: Array, default: () => [] },
  groupBy: { type: String, default: 'article' },
})
const emit = defineEmits(['select', 'history'])

const { t } = useI18n()
const fmt = useCostTrackingFormat()

const titleKey = computed(() => ({ article: 'ctTableTitleArticle', category: 'ctTableTitleCategory', type: 'ctTableTitleType', ingredient: 'ctTableTitleIngredient' })[props.groupBy] || 'ctTableTitleArticle')
const nameKey = computed(() => ({ article: 'ctFilterArticle', category: 'ctFilterCategory', type: 'ctFilterType', ingredient: 'ctFilterIngredient' })[props.groupBy] || 'ctFilterArticle')

function subLabel(row) {
  if (row.kind === 'article') return [row.typeName, row.categoryName].filter(Boolean).join(' · ')
  if (row.kind === 'ingredient') return row.lineKind ? t(`ctLineKind_${row.lineKind}`) : ''
  return t('ctArticlesCount').replace('{count}', String(row.articleCount))
}
function select(row) {
  if (row.id) emit('select', row)
}
</script>

<style scoped>
.ct-table__scroll {
  overflow-x: auto;
  margin-top: 10px;
}
.ct-table__empty {
  padding: 24px 0;
  text-align: center;
  color: var(--ct-faint);
  font-size: var(--fs-sm);
}
.ct-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.ct-table th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ct-border-strong);
  background: var(--ct-subtle);
  color: var(--ct-muted);
  font-weight: var(--fw-semibold);
  text-align: right;
  white-space: nowrap;
}
.ct-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ct-border);
  text-align: right;
  white-space: nowrap;
}
.ct-table th:first-child,
.ct-table td:first-child {
  text-align: left;
}
.ct-table td:first-child {
  font-weight: var(--fw-medium);
}
.ct-table__row--click {
  cursor: pointer;
}
.ct-table__row--click:hover {
  background: var(--ct-subtle);
}
.ct-table__history {
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ct-brand);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ct-table__sub {
  display: block;
  color: var(--ct-faint);
  font-size: var(--fs-xs);
  font-weight: var(--fw-regular);
}
.ct-num {
  font-variant-numeric: tabular-nums;
}
</style>
