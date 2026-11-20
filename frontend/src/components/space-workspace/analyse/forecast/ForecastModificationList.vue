<template>
  <!-- Modifications ajoutées, dans l'ordre d'ajout, chacune avec son bouton « retirer ». -->
  <section class="fc-list" :aria-labelledby="titleId">
    <h3 :id="titleId" class="fc-list__title">
      <span>{{ t('fcstListTitle') }}</span>
      <span class="fc-list__cnt">{{ items.length }}</span>
    </h3>
    <ol v-if="rows.length" class="fc-list__items">
      <li v-for="row in rows" :key="row.id" class="fc-row">
        <span class="fc-row__txt">{{ row.label }}</span>
        <button
          type="button"
          class="fc-row__rm"
          :aria-label="row.removeAria"
          :title="row.removeAria"
          @click="emit('remove', row.id)"
        >
          <v-icon size="18" aria-hidden="true">mdi-close</v-icon>
        </button>
      </li>
    </ol>
    <p v-else class="fc-list__empty">{{ t('fcstListEmpty') }}</p>
    <p v-if="replacedNote" class="fc-list__note" role="status">{{ replacedNote }}</p>
  </section>
</template>

<script setup>
import { computed, getCurrentInstance } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import {
  fillTemplate,
  modificationLabel,
  modificationTargetLabel,
} from '@/utils/forecastModificationLabels'

const props = defineProps({
  items: { type: Array, default: () => [] },
  // Retour de forecastTargetOptions (noms des articles).
  options: { type: Object, default: null },
  // Modification que la dernière ajoutée a remplacée (même cible), sinon null.
  replaced: { type: Object, default: null },
})
const emit = defineEmits(['remove'])

const { t } = useI18n()
const titleId = `fc-list-${getCurrentInstance().uid}`

const ctx = () => ({ t, options: props.options, formatCurrency: formatCurrencyDetailed })
const rows = computed(() => props.items.map((m) => {
  const label = modificationLabel(m, ctx())
  return { id: m.id, label, removeAria: fillTemplate(t('fcstRemoveAria'), { label }) }
}))
const replacedNote = computed(() => (
  props.replaced
    ? fillTemplate(t('fcstReplaced'), { target: modificationTargetLabel(props.replaced, ctx()) })
    : ''
))
</script>

<style scoped>
.fc-list { margin-bottom: 1rem; min-width: 0; }
.fc-list__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--cf-fg);
}
.fc-list__cnt {
  padding: 1px 0.5rem;
  border-radius: 99px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-regular);
  color: var(--cf-cmp);
  background: var(--cf-cmp-bg);
  font-variant-numeric: tabular-nums;
}
.fc-list__items {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.fc-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  box-sizing: border-box;
  padding: 0.25rem 0.25rem 0.25rem 0.75rem;
  border: 1px solid var(--cf-line);
  border-radius: 10px;
  background: var(--cf-surface);
}
.fc-row__txt {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-base);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.fc-row__rm {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--cf-muted);
  cursor: pointer;
}
.fc-row__rm:hover { background: var(--cf-surface2); color: var(--cf-fg); }
.fc-row__rm:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: -2px;
}
.fc-list__empty,
.fc-list__note {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--cf-muted);
}
.fc-list__note { margin-top: 0.5rem; }
</style>
