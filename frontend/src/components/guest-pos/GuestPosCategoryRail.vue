<template>
  <nav class="pos-rail" :aria-label="t('guestPosCategories')">
    <button
      v-for="category in categories"
      :key="category.id"
      type="button"
      class="pos-rail__item"
      :class="{ 'pos-rail__item--active': category.id === selectedId }"
      :aria-current="category.id === selectedId ? 'true' : undefined"
      @click="$emit('select', category.id)"
    >
      <span class="pos-rail__label">{{ category.label }}</span>
      <span v-if="category.count > 0" class="pos-rail__count">{{ category.count }}</span>
    </button>
  </nav>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  categories: { type: Array, default: () => [] }, // [{ id, label, count }]
  selectedId: { type: String, default: null },
})
defineEmits(['select'])

const { t } = useI18n()
</script>

<style scoped>
.pos-rail { width: 148px; flex-shrink: 0; box-sizing: border-box; padding: 16px 0 16px 16px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.pos-rail__item {
  min-height: 56px; box-sizing: border-box; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 6px;
  border-radius: 12px; font-size: var(--fs-md); font-weight: var(--fw-bold); text-align: left; border: 1px solid transparent;
  background: transparent; color: #374151; cursor: pointer;
}
.pos-rail__item--active { border-color: var(--pos-accent); background: var(--pos-accent); color: #fff; }
.pos-rail__label { overflow-wrap: anywhere; }
.pos-rail__count {
  min-width: 22px; height: 22px; box-sizing: border-box; padding: 0 6px; border-radius: 11px; font-size: var(--fs-sm); font-weight: var(--fw-bold);
  display: flex; align-items: center; justify-content: center; background: var(--pos-accent); color: #fff;
}
.pos-rail__item--active .pos-rail__count { background: #fff; color: var(--pos-accent); }
</style>
