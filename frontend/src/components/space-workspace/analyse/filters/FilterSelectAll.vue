<template>
  <!-- Ligne « Tout sélectionner » d'une liste de filtres : agit sur les options VISIBLES
       (donc sur le résultat de la recherche), sans toucher aux sélections masquées. -->
  <label v-if="visible.length >= minItems" class="fsa-row" :class="{ 'fsa-row--dark': isDark }">
    <input
      type="checkbox"
      class="fsa-check"
      :checked="allSelected"
      :indeterminate.prop="someSelected"
      @change="onToggle"
    />
    <span class="fsa-name">{{ allSelected ? t('anDeselectAll') : t('anSelectAll') }}</span>
    <span class="fsa-count">{{ visible.length }}</span>
  </label>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Options affichées (après recherche).
  visible: { type: Array, default: () => [] },
  // Valeurs sélectionnées dans le filtre.
  selected: { type: Array, default: () => [] },
  // En dessous, la ligne n'apporte rien (1 ou 2 cases se cochent aussi vite).
  minItems: { type: Number, default: 3 },
})
const emit = defineEmits(['update:selected'])
const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const selectedSet = computed(() => new Set(props.selected || []))
const selectedVisibleCount = computed(() => props.visible.filter((v) => selectedSet.value.has(v)).length)
const allSelected = computed(() => props.visible.length > 0 && selectedVisibleCount.value === props.visible.length)
const someSelected = computed(() => selectedVisibleCount.value > 0 && !allSelected.value)

function onToggle() {
  const visibleSet = new Set(props.visible)
  const kept = (props.selected || []).filter((v) => !visibleSet.has(v))
  emit('update:selected', allSelected.value ? kept : [...kept, ...props.visible])
}
</script>

<style scoped>
/* Même gabarit que les lignes de liste (padding 7px 6px, case 18px) pour que les cases
   s'alignent ; libellé discret, le rouge marque n'apparaît qu'une fois la case cochée. */
.fsa-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition: background .12s ease;
}
.fsa-row::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: -3px;
  height: 1px;
  background: #eef0f3;
}
.fsa-row:hover { background: #f9fafb; }
.fsa-check {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.5px solid #d1d5db;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  position: relative;
  transition: border-color .15s ease, background .15s ease;
}
.fsa-row:hover .fsa-check { border-color: #ff3131; }
.fsa-check:checked,
.fsa-check:indeterminate { background: #ff3131; border-color: #ff3131; }
.fsa-check:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1.5px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.fsa-check:indeterminate::after {
  content: '';
  position: absolute;
  left: 3.5px;
  top: 6.5px;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: #fff;
}
.fsa-name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: #64748b;
}
.fsa-count {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: #64748b;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 1px 8px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.fsa-row--dark::after { background: rgba(255, 255, 255, 0.08); }
.fsa-row--dark:hover { background: rgba(255, 255, 255, 0.05); }
.fsa-row--dark .fsa-check { border-color: #374151; background: #0f172a; }
.fsa-row--dark .fsa-check:checked,
.fsa-row--dark .fsa-check:indeterminate { background: #ff3131; border-color: #ff3131; }
.fsa-row--dark .fsa-name { color: #94a3b8; }
.fsa-row--dark .fsa-count { color: #94a3b8; background: rgba(255, 255, 255, 0.06); }
</style>
