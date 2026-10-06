<template>
  <!-- Accès par QR code + PIN de CE PDV (document Bertrand 2026-10-06, pages 5 et 6) :
       ▶ quand l'accès est arrêté, ■ quand il est autorisé. Démarrer un PDV dans une
       phase arrête l'autre phase pour ce PDV (serveur). -->
  <button
    type="button"
    class="pdv-access-btn"
    :class="{ 'pdv-access-btn--open': isOpen }"
    :disabled="working || !periodOpen"
    :title="t(isOpen ? 'invPdvAccessStop' : 'invPdvAccessStart')"
    :aria-label="t(isOpen ? 'invPdvAccessStop' : 'invPdvAccessStart')"
    @click="onToggle"
  >
    <v-progress-circular v-if="working" indeterminate size="14" width="2" />
    <v-icon v-else size="18">{{ isOpen ? 'mdi-stop' : 'mdi-play' }}</v-icon>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useInventoryPinAccess } from '@/composables/useInventoryPinAccess'
import { isElementAccessOpen } from '@/utils/guestPinAccessState'

const props = defineProps({
  spaceId: { type: String, required: true },
  eventId: { type: String, required: true },
  phase: { type: String, required: true }, // 'pre-event' | 'post-event'
  elementId: { type: String, required: true },
})
const emit = defineEmits(['error'])

const { t } = useI18n()
const store = useStore()
const { window, periodOpen } = useInventoryPinAccess(computed(() => props.phase))
const working = ref(false)

const isOpen = computed(() => isElementAccessOpen(window.value, props.elementId))

async function onToggle() {
  working.value = true
  try {
    await store.dispatch(isOpen.value ? 'guestPinAdmin/stopElement' : 'guestPinAdmin/startElement', {
      spaceId: props.spaceId,
      eventId: props.eventId,
      phase: props.phase,
      elementId: props.elementId,
    })
  } catch (e) {
    emit('error', e?.response?.data?.message || t('invPinAccessError'))
  } finally {
    working.value = false
  }
}
</script>

<style scoped>
.pdv-access-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #FFFFFF);
  color: var(--fb-text, #212121);
  cursor: pointer;
}
.pdv-access-btn--open {
  color: var(--fb-muted, #6B7280);
}
.pdv-access-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.pdv-access-btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
</style>
