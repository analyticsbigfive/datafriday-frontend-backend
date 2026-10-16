<template>
  <div class="pos-tabs-wrap">
    <div class="pos-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="pos-tab"
        :class="{ 'pos-tab--active': modelValue === 'pdv' }"
        :aria-selected="modelValue === 'pdv'"
        @click="$emit('update:modelValue', 'pdv')"
      >
        <v-icon size="16" class="mr-1">mdi-storefront-outline</v-icon>
        {{ t('posTabPdv') }}
        <span class="pos-tab__count">({{ pdvCount }})</span>
      </button>
      <button
        type="button"
        role="tab"
        class="pos-tab"
        :class="{ 'pos-tab--active': modelValue === 'sales' }"
        :aria-selected="modelValue === 'sales'"
        @click="$emit('update:modelValue', 'sales')"
      >
        <v-icon size="16" class="mr-1">mdi-receipt-text-outline</v-icon>
        {{ t('posTabSales') }}
        <span class="pos-tab__count">({{ salesCount }})</span>
      </button>
    </div>

    <div v-if="modelValue === 'pdv'" class="pos-chips">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="pos-chip"
        :class="{ 'pos-chip--on': statusFilter === chip.id }"
        :aria-pressed="statusFilter === chip.id"
        @click="$emit('toggle-status', chip.id)"
      >
        {{ chip.label }}
        <span class="pos-chip__count">{{ chip.count }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Onglets soulignés « Points de vente » / « Historique des ventes » et chips Actives / Inactives.
const props = defineProps({
  modelValue: { type: String, default: 'pdv' },
  pdvCount: { type: Number, default: 0 },
  salesCount: { type: Number, default: 0 },
  activeCount: { type: Number, default: 0 },
  inactiveCount: { type: Number, default: 0 },
  statusFilter: { type: String, default: null },
})
defineEmits(['update:modelValue', 'toggle-status'])

const { t } = useI18n()
const chips = computed(() => [
  { id: 'active', label: t('posChipActive'), count: props.activeCount },
  { id: 'inactive', label: t('posChipInactive'), count: props.inactiveCount },
])
</script>

<style scoped>
.pos-tabs-wrap {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  margin: 12px 0;
}
.pos-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
}
.pos-tab {
  display: inline-flex;
  align-items: center;
  margin-bottom: -1px;
  padding: 8px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.pos-tab--active {
  border-bottom-color: var(--fb-primary, #d63031);
  color: var(--fb-primary, #d63031);
}
.pos-tab__count {
  margin-left: 4px;
  color: var(--fb-faint, #9ca3af);
  font-weight: var(--fw-medium);
}
.pos-tab:focus-visible,
.pos-chip:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.pos-chips {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pos-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 100px;
  background: var(--fb-surface, #ffffff);
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.pos-chip--on {
  border-color: var(--fb-primary, #d63031);
  background: var(--fb-primary, #d63031);
  color: #ffffff;
}
.pos-chip__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 100px;
  background: rgba(15, 23, 42, 0.08);
  font-size: var(--fs-xs);
}
.pos-chip--on .pos-chip__count {
  background: rgba(255, 255, 255, 0.25);
}
</style>
