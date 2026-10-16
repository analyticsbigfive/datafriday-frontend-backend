<template>
  <aside class="pos-card">
    <div class="pos-card__head">
      <h2 class="pos-card__title">{{ title }}</h2>
      <slot name="header-extra" />
      <button
        type="button"
        class="pos-card__chev"
        :class="{ 'pos-card__chev--closed': !isOpen }"
        :aria-expanded="isOpen"
        :aria-label="t('posToggleSection')"
        :title="t('posToggleSection')"
        @click="isOpen = !isOpen"
      >
        <v-icon size="18">mdi-chevron-down</v-icon>
      </button>
    </div>
    <div v-if="isOpen" class="pos-card__body">
      <slot />
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Carte blanche de la maquette POS avec chevron de repli (filtres, ventes, réglages, stock).
const props = defineProps({
  title: { type: String, required: true },
  open: { type: Boolean, default: true },
})

const { t } = useI18n()
const isOpen = ref(props.open)
</script>

<style scoped>
.pos-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--fb-surface, #ffffff);
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-card, 16px);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.pos-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pos-card__title {
  flex: 1;
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: var(--fw-bold);
  color: var(--fb-text, #212121);
}
.pos-card__chev {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--fb-radius-control, 8px);
  background: transparent;
  color: var(--fb-muted, #6b7280);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.pos-card__chev--closed {
  transform: rotate(-90deg);
}
.pos-card__chev:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.pos-card__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
