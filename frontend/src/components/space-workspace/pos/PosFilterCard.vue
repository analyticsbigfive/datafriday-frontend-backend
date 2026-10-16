<template>
  <PosCollapsibleCard :title="t('posFilters')">
    <template #header-extra>
      <button type="button" class="pos-filter__reset" @click="$emit('reset')">{{ t('posFiltersReset') }}</button>
    </template>

    <div>
      <div class="pos-filter__label">{{ t('posFilterPdvType') }}</div>
      <div class="pos-filter__list">
        <button
          v-for="option in typeOptions"
          :key="option.value"
          type="button"
          class="pos-filter__row"
          :aria-pressed="selectedTypes.includes(option.value)"
          @click="$emit('toggle-type', option.value)"
        >
          <span class="pos-filter__box" :class="{ 'pos-filter__box--on': selectedTypes.includes(option.value) }">
            <v-icon v-if="selectedTypes.includes(option.value)" size="12" color="white">mdi-check</v-icon>
          </span>
          <span class="pos-filter__name">{{ option.value }}</span>
          <span class="pos-filter__count">{{ option.count }}</span>
        </button>
        <p v-if="!typeOptions.length" class="pos-filter__empty">{{ t('posFilterNone') }}</p>
      </div>
    </div>

    <div class="pos-filter__menus">
      <div class="pos-filter__label">{{ t('posFilterSpaceMenu') }}</div>
      <div class="pos-filter__chips">
        <button
          v-for="option in menuOptions"
          :key="option.value"
          type="button"
          class="pos-filter__chip"
          :class="{ 'pos-filter__chip--on': selectedMenus.includes(option.value) }"
          :aria-pressed="selectedMenus.includes(option.value)"
          @click="$emit('toggle-menu', option.value)"
        >{{ option.value }}</button>
        <p v-if="!menuOptions.length" class="pos-filter__empty">{{ t('posFilterNone') }}</p>
      </div>
    </div>
  </PosCollapsibleCard>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import PosCollapsibleCard from './PosCollapsibleCard.vue'

// Filtres de la colonne gauche : type de PdV (cases) et Space Menu (pastilles).
defineProps({
  typeOptions: { type: Array, default: () => [] }, // [{ value, count }]
  menuOptions: { type: Array, default: () => [] },
  selectedTypes: { type: Array, default: () => [] },
  selectedMenus: { type: Array, default: () => [] },
})
defineEmits(['toggle-type', 'toggle-menu', 'reset'])

const { t } = useI18n()
</script>

<style scoped>
.pos-filter__reset {
  border: 0;
  background: transparent;
  color: var(--fb-primary, #d63031);
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  cursor: pointer;
}
.pos-filter__label {
  margin-bottom: 8px;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pos-filter__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pos-filter__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--fb-text, #212121);
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
}
.pos-filter__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border: 2px solid var(--fb-faint, #9ca3af);
  border-radius: 4px;
}
.pos-filter__box--on {
  border-color: var(--fb-primary, #d63031);
  background: var(--fb-primary, #d63031);
}
.pos-filter__name {
  flex: 1;
}
.pos-filter__count {
  color: var(--fb-faint, #9ca3af);
  font-size: var(--fs-sm);
}
.pos-filter__menus {
  padding-top: 12px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
}
.pos-filter__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pos-filter__chip {
  padding: 5px 10px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 999px;
  background: transparent;
  color: var(--fb-text, #212121);
  font-size: var(--fs-base);
  cursor: pointer;
}
.pos-filter__chip--on {
  border-color: var(--fb-primary, #d63031);
  background: var(--fb-primary, #d63031);
  color: #ffffff;
}
.pos-filter__empty {
  margin: 0;
  color: var(--fb-faint, #9ca3af);
  font-size: var(--fs-base);
}
</style>
