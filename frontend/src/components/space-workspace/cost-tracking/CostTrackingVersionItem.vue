<template>
  <li class="ct-version" :class="{ 'ct-version--now': current }">
    <div class="ct-version__top">
      <b>{{ fmt.dayYear(at) }}</b>
      <span class="ct-chip" :class="`ct-chip--${kind}`">{{ t(reasonLabelKey(version.reason)) }}</span>
      <span v-if="current" class="ct-chip ct-chip--base">{{ t('ctDrawerCurrent') }}</span>
    </div>
    <div>
      <span class="ct-version__cost">{{ fmt.cost(version.costPerPiece) }}</span>
      <span v-if="deltaPct !== null" class="ct-delta" :class="fmt.trendClass(direction)">{{ fmt.pct(deltaPct) }}</span>
    </div>
    <div v-if="diffs.length" class="ct-version__diff">
      <div v-for="d in diffs" :key="`${d.type}${d.key}`">{{ describe(d) }}</div>
    </div>
    <details v-if="version.recipe && version.recipe.length" class="ct-version__recipe">
      <summary>{{ t('ctRecipeToggle') }}</summary>
      <table class="ct-version__table">
        <thead>
          <tr>
            <th>{{ t('ctRecipeLine') }}</th>
            <th>{{ t('ctRecipeQty') }}</th>
            <th>{{ t('ctRecipeUnit') }}</th>
            <th>{{ t('ctRecipeTotal') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in version.recipe" :key="recipeLineKey(line)" :class="{ 'ct-version__chg': changed.has(recipeLineKey(line)) }">
            <td>{{ line.name }}</td>
            <td class="ct-num">{{ fmt.plain(line.quantity, 3) }}</td>
            <td class="ct-num">{{ fmt.cost(line.unitCost) }}</td>
            <td class="ct-num">{{ fmt.cost(line.unitCost * line.quantity) }}</td>
          </tr>
          <tr v-if="version.numberOfPieces > 1">
            <td colspan="3"><b>{{ t('ctRecipeCostBatch') }}</b></td>
            <td class="ct-num"><b>{{ fmt.cost(version.totalCost) }}</b></td>
          </tr>
          <tr>
            <td colspan="3"><b>{{ t('ctRecipeCostPiece') }}</b></td>
            <td class="ct-num"><b>{{ fmt.cost(version.costPerPiece) }}</b></td>
          </tr>
        </tbody>
      </table>
    </details>
  </li>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { computeVariation } from '@/utils/costTrackingSeries'
import { diffRecipe, reasonKind, reasonLabelKey, recipeLineKey } from '@/utils/costTrackingRecipeDiff'

// Une version de coût dans l'historique : date, cause, coût par pièce, variation, changements
// de recette par rapport à la version précédente, recette figée dépliable.
const props = defineProps({
  version: { type: Object, required: true },
  // Version plus ancienne (juste en dessous dans la liste), ou null pour la première.
  previous: { type: Object, default: null },
  current: { type: Boolean, default: false },
})

const { t } = useI18n()
const fmt = useCostTrackingFormat()

const at = computed(() => Date.parse(props.version.effectiveFrom))
const kind = computed(() => reasonKind(props.version.reason))

const variation = computed(() =>
  props.previous ? computeVariation(props.previous.costPerPiece, props.version.costPerPiece) : null,
)
const deltaPct = computed(() => (variation.value ? variation.value.pct : null))
const direction = computed(() => (variation.value ? variation.value.direction : 'flat'))

const diffs = computed(() => (props.previous ? diffRecipe(props.version.recipe, props.previous.recipe) : []))
const changed = computed(() => new Set(diffs.value.map((d) => d.key)))

function describe(d) {
  if (d.type === 'unit') {
    return t('ctDiffUnit').replace('{name}', d.name).replace('{from}', fmt.cost(d.from)).replace('{to}', fmt.cost(d.to))
  }
  if (d.type === 'qty') {
    return t('ctDiffQty').replace('{name}', d.name).replace('{from}', fmt.plain(d.from, 3)).replace('{to}', fmt.plain(d.to, 3))
  }
  return t(d.type === 'added' ? 'ctDiffAdded' : 'ctDiffRemoved').replace('{name}', d.name)
}
</script>

<style scoped>
.ct-version {
  position: relative;
}
.ct-version::before {
  content: '';
  position: absolute;
  left: -23px;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ct-surface);
  border: 2px solid var(--ct-faint);
}
.ct-version--now::before {
  border-color: var(--ct-brand);
  background: var(--ct-brand);
}
.ct-version__top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--fs-sm);
}
.ct-version__cost {
  margin-right: 6px;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.ct-version__diff {
  margin-top: 2px;
  color: var(--ct-faint);
  font-size: var(--fs-xs);
  line-height: 1.5;
}
.ct-version__recipe {
  margin-top: 6px;
}
.ct-version__recipe summary {
  color: var(--ct-brand);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ct-version__table {
  width: 100%;
  margin-top: 6px;
  border-collapse: collapse;
  font-size: var(--fs-xs);
}
.ct-version__table th {
  padding: 5px 6px;
  border-bottom: 1px solid var(--ct-border-strong);
  background: var(--ct-subtle);
  color: var(--ct-muted);
  font-weight: var(--fw-semibold);
  text-align: right;
}
.ct-version__table td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--ct-border);
  text-align: right;
}
.ct-version__table th:first-child,
.ct-version__table td:first-child {
  text-align: left;
}
.ct-version__chg td {
  background: var(--ct-brand-soft);
  font-weight: var(--fw-semibold);
}
.ct-num {
  font-variant-numeric: tabular-nums;
}
</style>
