<template>
  <ComparisonField :label="t('anCmpEventsLabel')" :label-id="`${uid}-lab`">
    <div class="cf-evlist" role="group" :aria-labelledby="`${uid}-lab`">
      <div class="cf-evlist__sb">
        <v-icon size="16" class="cf-evlist__ico" aria-hidden="true">mdi-magnify</v-icon>
        <input
          v-model="query"
          class="cf-evlist__q"
          type="search"
          :placeholder="t('anCmpEventSearch')"
          :aria-label="t('anCmpEventSearch')"
          @keydown.enter.prevent
        />
      </div>
      <ul class="cf-evlist__ul">
        <li v-for="o in visible" :key="o.id">
          <label class="cf-evlist__row">
            <input
              type="checkbox"
              class="cf-evlist__chk"
              :checked="selected.has(o.id)"
              @change="toggle(o.id)"
            />
            <span class="cf-evlist__name">{{ o.name }}</span>
            <span class="cf-evlist__date">{{ o.date }}</span>
          </label>
        </li>
        <li v-if="!visible.length" class="cf-evlist__empty">{{ t('anCmpEventNone') }}</li>
      </ul>
    </div>
    <span class="cf-evlist__count" aria-live="polite">
      {{ t('anCmpSelectedCount').replace('{n}', String(modelValue.length)) }}
      <template v-if="modelValue.length">
        <span aria-hidden="true"> · </span>
        <button type="button" class="cf-evlist__clear" @click="emit('update:modelValue', [])">
          {{ t('anCmpClearAll') }}
        </button>
      </template>
    </span>
  </ComparisonField>
</template>

<script setup>
// Liste d'événements à cases avec recherche locale (nom + date). La recherche est un état
// d'affichage : elle ne touche ni la sélection ni aucun store.
import { computed, getCurrentInstance, ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { searchEventOptions } from '@/utils/comparisonFormModel'
import ComparisonField from './ComparisonField.vue'

const props = defineProps({
  // Ids sélectionnés (v-model).
  modelValue: { type: Array, default: () => [] },
  // Options triées du plus récent au plus ancien : { id, name, date, search }.
  options: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const uid = `cf-ev-${getCurrentInstance().uid}`
const query = ref('')
const selected = computed(() => new Set(props.modelValue))
const visible = computed(() => searchEventOptions(props.options, query.value))

function toggle(id) {
  const list = [...props.modelValue]
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
  emit('update:modelValue', list)
}
</script>

<style scoped>
.cf-evlist {
  border: 1px solid var(--cf-line);
  border-radius: 10px;
  background: var(--cf-surface);
  overflow: hidden;
}
.cf-evlist:focus-within { border-color: var(--cf-cmp-line); }
.cf-evlist__sb {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  box-sizing: border-box;
  padding: 0 10px;
  border-bottom: 1px solid var(--cf-line);
}
.cf-evlist__ico { color: var(--cf-faint); flex: none; }
.cf-evlist__q {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--cf-fg);
  font: inherit;
  font-size: var(--fs-md);
  outline: none;
}
.cf-evlist__ul {
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 232px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.cf-evlist__row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 32px;
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: var(--fs-base);
  cursor: pointer;
}
.cf-evlist__row:hover { background: var(--cf-surface2); }
.cf-evlist__row:focus-within { background: var(--cf-surface2); }
.cf-evlist__chk {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--cf-cmp);
  cursor: pointer;
}
.cf-evlist__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cf-evlist__date {
  font-size: var(--fs-sm);
  color: var(--cf-muted);
  font-variant-numeric: tabular-nums;
}
.cf-evlist__empty {
  padding: 10px 8px;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--cf-muted);
}
.cf-evlist__count {
  font-size: var(--fs-sm);
  color: var(--cf-muted);
  min-height: 1.3em;
}
.cf-evlist__clear {
  padding: 0;
  border: 0;
  background: none;
  color: var(--cf-cmp);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.cf-evlist__clear:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
  border-radius: 2px;
}
@media (max-width: 900px) {
  .cf-evlist__sb { height: 44px; }
  .cf-evlist__row { min-height: 44px; }
}
</style>
