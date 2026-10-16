<template>
  <div class="pos-pins">
    <span>
      <strong class="pos-pins__label">{{ label }}</strong>
      <span class="pos-pins__status"> ({{ statusText }})</span>
    </span>
    <button
      type="button"
      class="pos-pins__btn pos-pins__btn--stop"
      :disabled="disabled"
      :aria-label="t('posStopAll')"
      :title="t('posStopAll')"
      @click="$emit('stop-all')"
    >
      <v-progress-circular v-if="working" indeterminate size="14" width="2" />
      <v-icon v-else size="16">mdi-stop</v-icon>
    </button>
    <button
      type="button"
      class="pos-pins__btn pos-pins__btn--start"
      :disabled="disabled"
      :aria-label="t('posStartAll')"
      :title="t('posStartAll')"
      @click="$emit('start-all')"
    >
      <v-icon size="16">mdi-play</v-icon>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

// Ligne « N PIN (un par PdV) » du bandeau rouge avec ■ / ▶ pour toutes les caisses.
const props = defineProps({
  activeCount: { type: Number, default: 0 },
  isLive: { type: Boolean, default: false },
  working: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
defineEmits(['start-all', 'stop-all'])

const { t } = useI18n()
const label = computed(() => {
  if (props.activeCount === 0) return t('posPinsNone')
  if (props.activeCount === 1) return t('posPinsOne')
  return t('posPinsMany').replace('{count}', String(props.activeCount))
})
const statusText = computed(() => {
  if (props.activeCount === 0) return t('posPinStatusNotStarted')
  return props.isLive ? t('posPinStatusRunning') : t('posPinStatusReady')
})
</script>

<style scoped>
.pos-pins {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
  color: #ffffff;
  font-size: var(--fs-base);
}
.pos-pins__label {
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
}
.pos-pins__status {
  opacity: 0.85;
}
.pos-pins__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 16px;
  cursor: pointer;
}
.pos-pins__btn--stop {
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}
.pos-pins__btn--start {
  border: 1px solid #ffffff;
  background: #ffffff;
  color: #d63031;
}
.pos-pins__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.pos-pins__btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: 2px;
}
</style>
