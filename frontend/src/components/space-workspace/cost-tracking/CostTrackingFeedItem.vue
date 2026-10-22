<template>
  <div class="ct-feed" :class="{ 'ct-feed--click': change.kind === 'article' && !!change.id }" @click="$emit('select', change)">
    <span class="ct-chip" :class="`ct-chip--${kind}`">{{ t(reasonLabelKey(change.reason)) }}</span>
    <div>
      <b class="ct-feed__name">{{ change.name }}</b>
      <small class="ct-feed__detail">
        {{ fmt.cost(change.from) }} &rarr; {{ fmt.cost(change.to) }}
        <template v-if="change.pct !== null"> ({{ fmt.pct(change.pct) }})</template>
        &middot; {{ fmt.day(change.t) }}
      </small>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'
import { reasonKind, reasonLabelKey } from '@/utils/costTrackingRecipeDiff'

// Une entrée de « Derniers changements » : cause (marché, recette...), article, coût avant et après.
// Pour les lignes de catégorie ou de type, la cause n'est pas connue : pastille générique.
const props = defineProps({
  change: { type: Object, required: true },
})
defineEmits(['select'])

const { t } = useI18n()
const fmt = useCostTrackingFormat()
const kind = computed(() => reasonKind(props.change.reason))
</script>

<style scoped>
.ct-feed {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 12px;
  background: var(--ct-surface);
}
.ct-feed--click {
  cursor: pointer;
}
.ct-feed--click:hover {
  background: var(--ct-subtle);
}
.ct-feed__name {
  display: block;
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
}
.ct-feed__detail {
  color: var(--ct-faint);
  font-size: var(--fs-xs);
}
</style>
