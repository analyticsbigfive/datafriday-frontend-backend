<template>
  <div class="pos-left">
    <WorkspaceToolSelect
      model-value="pos"
      :items="toolboxItems"
      :label="t('invToolsLabel')"
      :aria-label="t('invToolboxNav')"
      @update:model-value="onToolboxSelect"
    />
    <PosFilterCard
      :type-options="typeOptions"
      :menu-options="menuOptions"
      :selected-types="selectedTypes"
      :selected-menus="selectedMenus"
      @toggle-type="$emit('toggle-type', $event)"
      @toggle-menu="$emit('toggle-menu', $event)"
      @reset="$emit('reset')"
    />
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceToolbox } from '@/composables/useWorkspaceToolbox'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import PosFilterCard from './PosFilterCard.vue'

// Colonne gauche : sélecteur d'outils du workspace puis filtres des PdV.
defineProps({
  typeOptions: { type: Array, default: () => [] },
  menuOptions: { type: Array, default: () => [] },
  selectedTypes: { type: Array, default: () => [] },
  selectedMenus: { type: Array, default: () => [] },
})
defineEmits(['toggle-type', 'toggle-menu', 'reset'])

const { t } = useI18n()
const { toolboxItems, onToolboxSelect } = useWorkspaceToolbox('pos')
</script>

<style scoped>
.pos-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}
</style>
