<template>
  <div class="ct-left">
    <WorkspaceToolSelect
      model-value="cost-tracking"
      :items="toolboxItems"
      :label="t('invToolsLabel')"
      :aria-label="t('invToolboxNav')"
      @update:model-value="onToolboxSelect"
    />
    <CostTrackingFilterPanel v-bind="$attrs" />
  </div>
</template>

<script>
export default { inheritAttrs: false }
</script>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceToolbox } from '@/composables/useWorkspaceToolbox'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import CostTrackingFilterPanel from './CostTrackingFilterPanel.vue'

// Colonne gauche : sélecteur d'outils du workspace puis panneau de filtres.
// Les props et événements du panneau sont transmis tels quels ($attrs).
const { t } = useI18n()
const { toolboxItems, onToolboxSelect } = useWorkspaceToolbox('cost-tracking')
</script>

<style scoped>
.ct-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
</style>
