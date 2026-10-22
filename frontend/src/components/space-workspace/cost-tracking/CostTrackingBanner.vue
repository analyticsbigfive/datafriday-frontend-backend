<template>
  <div class="ct-banner">
    <div class="ct-banner__row">
      <WorkspacePanelToggle :open="leftOpen" :label="t('ctTogglePanel')" @toggle="$emit('toggle-left')" />
      <h1 class="ct-banner__title">{{ title }}</h1>
    </div>
    <div class="ct-banner__sub">{{ subtitle }}</div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'

// Bandeau rouge à deux lignes : repli du panneau de filtres, titre, sous-titre (effectifs).
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  leftOpen: { type: Boolean, default: true },
})
defineEmits(['toggle-left'])

const { t } = useI18n()
</script>

<style scoped>
.ct-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 22px;
  border-radius: 18px;
  background: #ff3131;
  box-shadow: 0 8px 24px rgba(255, 49, 49, 0.28);
  color: #ffffff;
}
.ct-banner__row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ct-banner__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ffffff;
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
}
.ct-banner__sub {
  padding-left: 56px;
  color: rgba(255, 255, 255, 0.92);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}
@media (max-width: 820px) {
  .ct-banner__sub {
    padding-left: 0;
  }
  .ct-banner__title {
    font-size: var(--fs-lg);
  }
}
</style>
