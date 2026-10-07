<template>
  <!-- ■ Arrêt / ▶ Démarrage-Reprise de l'accès QR code + PIN de tous les PDV.
       `large` : grands boutons rouges du menu mobile « Options inventaire »
       (design Bertrand 2026-10-07) ; sinon boutons contour blanc du bandeau. -->
  <div class="inv-pin-actions-root">
    <div class="inv-pin-actions" :class="{ 'inv-pin-actions--large': large }">
      <button
        type="button"
        class="inv-pin-actions__btn"
        :disabled="stopDisabled"
        :title="t('invPinStopAll')"
        :aria-label="t('invPinStopAll')"
        @click="stopAll"
      >
        <v-icon :size="large ? 30 : 18">mdi-stop</v-icon>
      </button>
      <button
        type="button"
        class="inv-pin-actions__btn"
        :disabled="startDisabled"
        :title="t('invPinStartAll')"
        :aria-label="t('invPinStartAll')"
        @click="startAll"
      >
        <v-icon :size="large ? 30 : 18">mdi-play</v-icon>
      </button>
    </div>
    <p v-if="large && error" class="inv-pin-actions__error">{{ error }}</p>
  </div>
</template>

<script setup>
import { toRef, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useInventoryPinActions } from '@/composables/useInventoryPinActions'

const props = defineProps({
  spaceId: { type: String, required: true },
  eventId: { type: String, required: true },
  phase: { type: String, required: true }, // 'pre-event' | 'post-event'
  large: { type: Boolean, default: false },
})
// Erreur serveur (refus hors période) : le bandeau l'affiche dans sa ligne d'aide.
const emit = defineEmits(['error'])

const { t } = useI18n()
const { stopDisabled, startDisabled, stopAll, startAll, error } = useInventoryPinActions({
  spaceId: toRef(props, 'spaceId'),
  eventId: toRef(props, 'eventId'),
  phase: toRef(props, 'phase'),
})
watch(error, (e) => emit('error', e))
</script>

<style scoped>
.inv-pin-actions {
  display: flex;
  gap: 6px;
}
.inv-pin-actions__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1.5px solid #FFFFFF;
  border-radius: var(--fb-radius-control, 8px);
  background: transparent;
  color: #FFFFFF;
  cursor: pointer;
}
.inv-pin-actions--large {
  display: flex;
  justify-content: center;
  gap: 16px;
}
.inv-pin-actions--large .inv-pin-actions__btn {
  width: 60px;
  height: 60px;
  border: 0;
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-danger, #ff3131);
}
.inv-pin-actions__btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.inv-pin-actions__btn:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.45);
  outline-offset: 2px;
}
.inv-pin-actions--large .inv-pin-actions__btn:focus-visible {
  outline-color: rgba(255, 49, 49, 0.35);
}
.inv-pin-actions__error {
  margin: 8px 0 0;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--fb-danger, #C62828);
}
</style>
