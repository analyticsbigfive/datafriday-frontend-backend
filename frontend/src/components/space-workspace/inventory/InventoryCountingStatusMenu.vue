<template>
  <!-- Filtre de statut de comptage en menu burger, dans le corps de page
       (document Bertrand 2026-10-06, pages 7 et 8) : remplace les onglets
       « À compter » / « Comptés » de la colonne de droite et ajoute « En cours
       de comptage ». Sélection multiple ; aucune case cochée = tout afficher. -->
  <v-menu location="bottom start" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <button
        v-bind="menuProps"
        type="button"
        class="inv-status-menu-btn"
        :class="{ 'inv-status-menu-btn--active': !isDefault }"
        :aria-label="t('invFilterStatus')"
      >
        <v-icon size="16">mdi-menu</v-icon>
        <span>{{ summary }}</span>
      </button>
    </template>
    <v-list density="compact" class="inv-status-menu-list">
      <v-list-item
        v-for="value in COUNTING_STATUS_VALUES"
        :key="value"
        min-height="36"
        @click="toggle(value)"
      >
        <template #prepend>
          <v-checkbox-btn :model-value="modelValue.includes(value)" density="compact" color="primary" />
        </template>
        <v-list-item-title class="inv-status-menu-title">
          <InventoryStatusDot :status="value" />
          {{ t(COUNTING_STATUS_LABEL_KEYS[value]) }}
          <span class="inv-status-menu-count">{{ counts[value] ?? 0 }}</span>
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import InventoryStatusDot from './InventoryStatusDot.vue'
import {
  COUNTING_STATUS_LABEL_KEYS,
  COUNTING_STATUS_VALUES,
  isDefaultCountingStatuses,
} from '@/utils/inventoryCountingStatus'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // { 'to-count': n, 'in-progress': n, counted: n }
  counts: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

const isDefault = computed(() => isDefaultCountingStatuses(props.modelValue))

// Libellé du bouton : les statuts retenus, ou « Statut » quand tout passe.
const summary = computed(() => {
  const selected = COUNTING_STATUS_VALUES.filter((v) => props.modelValue.includes(v))
  if (!selected.length || selected.length === COUNTING_STATUS_VALUES.length) return t('invFilterStatus')
  return selected.map((v) => t(COUNTING_STATUS_LABEL_KEYS[v])).join(', ')
})

function toggle(value) {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value]
  emit('update:modelValue', next)
}
</script>

<style scoped>
.inv-status-menu-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--fb-border, #E5E7EB);
  border-radius: 999px;
  background: var(--fb-surface, #FFFFFF);
  color: var(--fb-text, #212121);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}
.inv-status-menu-btn--active {
  border-color: #ff3131;
  color: #ff3131;
}
.inv-status-menu-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.inv-status-menu-count {
  margin-left: auto;
  padding-left: 12px;
  color: var(--fb-muted, #6B7280);
  font-variant-numeric: tabular-nums;
}
</style>
