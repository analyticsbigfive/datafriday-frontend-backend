<template>
  <div class="pos-band">
    <WorkspacePanelToggle
      :open="leftOpen"
      :label="t('posToggleLeft')"
      @toggle="$emit('toggle-left')"
    />

    <div class="pos-band__title">
      <h1 class="pos-band__h1">{{ t('posPageTitle') }}</h1>
      <PosEventPicker
        :events="events"
        :model-value="selectedEventId"
        @update:model-value="$emit('select-event', $event)"
      />
      <PosPinSummary
        :active-count="activeCount"
        :is-live="isLive"
        :working="bulkWorking"
        :disabled="!selectedEventId || bulkWorking"
        @start-all="$emit('start-all')"
        @stop-all="$emit('stop-all')"
      />
    </div>

    <div class="pos-band__actions">
      <PosPrintMenu
        :started-count="startedPinCount"
        :all-count="allPinCount"
        :disabled="!selectedEventId"
        @print="$emit('print', $event)"
      />
      <button
        type="button"
        class="pos-band__panel"
        :class="{ 'pos-band__panel--on': rightOpen }"
        :aria-pressed="rightOpen"
        :aria-label="t('posToggleRight')"
        :title="t('posToggleRight')"
        @click="$emit('toggle-right')"
      >
        <component :is="rightOpen ? PanelRightClose : PanelRightOpen" :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { PanelRightClose, PanelRightOpen } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'
import PosEventPicker from './PosEventPicker.vue'
import PosPinSummary from './PosPinSummary.vue'
import PosPrintMenu from './PosPrintMenu.vue'

// Bandeau rouge : repli de la colonne gauche, titre POS, évènement, PIN et ■ / ▶ pour tous,
// impression des PIN, repli de la colonne droite.
defineProps({
  events: { type: Array, default: () => [] },
  selectedEventId: { type: String, default: null },
  isLive: { type: Boolean, default: false },
  activeCount: { type: Number, default: 0 },
  startedPinCount: { type: Number, default: 0 },
  allPinCount: { type: Number, default: 0 },
  bulkWorking: { type: Boolean, default: false },
  leftOpen: { type: Boolean, default: true },
  rightOpen: { type: Boolean, default: true },
})
defineEmits(['toggle-left', 'toggle-right', 'select-event', 'start-all', 'stop-all', 'print'])

const { t } = useI18n()
</script>

<style scoped>
.pos-band {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 15px;
  border-radius: 12px 12px 0 0;
  background: #ff3131;
}
.pos-band__title {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.pos-band__h1 {
  margin: 0;
  color: #ffffff;
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  line-height: 1.2;
}
.pos-band__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.pos-band__panel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: var(--fb-radius-control, 8px);
  background: transparent;
  color: #ffffff;
  cursor: pointer;
}
.pos-band__panel--on {
  background: #ffffff;
  color: #d63031;
}
.pos-band__panel:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: 2px;
}
@media (max-width: 760px) {
  .pos-band {
    flex-wrap: wrap;
  }
}
</style>
