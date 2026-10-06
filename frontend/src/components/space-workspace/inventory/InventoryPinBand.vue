<template>
  <!-- Ligne PIN du bandeau rouge (document Bertrand 2026-10-06, pages 3 et 4) :
       « PIN : 123456 (En cours) », puis Arrêt (■) et Démarrage / Reprise (▶) pour
       tous les PDV. Remplace la section « Accès PIN PDV » de la colonne de droite. -->
  <div class="inv-pin-band">
    <!-- L'état de l'accès se lit sur les boutons (■ grisé = arrêté), comme sur la
         maquette : pas de libellé en plus. -->
    <span class="inv-pin-band__pin">
      {{ t('invPinLabel') }} :
      <strong v-if="pin" class="inv-pin-band__code">{{ pin }}</strong>
      <span v-else class="inv-pin-band__none">{{ t('invPinNotGenerated') }}</span>
      {{ ' ' }}<span class="inv-pin-band__status">({{ t(statusLabelKey) }})</span>
    </span>
    <div class="inv-pin-band__actions">
      <button
        type="button"
        class="inv-pin-band__btn"
        :disabled="working || !periodOpen || !anyOpen"
        :title="t('invPinStopAll')"
        :aria-label="t('invPinStopAll')"
        @click="run('guestPinAdmin/stopWindow')"
      >
        <v-icon size="18">mdi-stop</v-icon>
      </button>
      <button
        type="button"
        class="inv-pin-band__btn"
        :disabled="working || !periodOpen || fullyOpen"
        :title="t('invPinStartAll')"
        :aria-label="t('invPinStartAll')"
        @click="run('guestPinAdmin/startWindow')"
      >
        <v-icon size="18">mdi-play</v-icon>
      </button>
    </div>
    <span v-if="hint" class="inv-pin-band__hint">{{ hint }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useInventoryPinAccess } from '@/composables/useInventoryPinAccess'
import { isAnyAccessOpen, isFullyOpen } from '@/utils/guestPinAccessState'
import { COUNTING_STATUS_COUNTED, COUNTING_STATUS_IN_PROGRESS } from '@/utils/inventoryCountingStatus'

const props = defineProps({
  spaceId: { type: String, required: true },
  eventId: { type: String, required: true },
  phase: { type: String, required: true }, // 'pre-event' | 'post-event'
  // Avancement de l'inventaire de l'event : 'to-count' | 'in-progress' | 'counted'.
  countStatus: { type: String, default: 'to-count' },
})

const { t } = useI18n()
const store = useStore()
const { window, periodOpen, periodState } = useInventoryPinAccess(computed(() => props.phase))
const working = ref(false)
const error = ref('')

const pin = computed(() => window.value?.pin ?? null)
const anyOpen = computed(() => isAnyAccessOpen(window.value))
const fullyOpen = computed(() => isFullyOpen(window.value))

// Pas commencé (rien compté) / En cours (au moins un article) / Terminé (tout compté).
const statusLabelKey = computed(() => {
  if (props.countStatus === COUNTING_STATUS_COUNTED) return 'invPinStatusDone'
  if (props.countStatus === COUNTING_STATUS_IN_PROGRESS) return 'invPinStatusInProgress'
  return 'invPinStatusNotStarted'
})

// Pourquoi les boutons sont grisés : event hors période de la phase.
const hint = computed(() => {
  if (error.value) return error.value
  if (periodState.value === 'not-yet') return t(props.phase === 'post-event' ? 'invPinPostNotYet' : 'invPinPreNotYet')
  if (periodState.value === 'over') return t('invPinPreOver')
  return ''
})

function load() {
  error.value = ''
  if (!props.spaceId || !props.eventId) return
  const ctx = { spaceId: props.spaceId, eventId: props.eventId }
  store.dispatch('guestPinAdmin/fetchStatusBoard', ctx).catch((e) => {
    error.value = e?.response?.data?.message || t('invPinAccessError')
  })
  // Non bloquant : sans périodes, le serveur reste l'arbitre au clic.
  store.dispatch('guestPinAdmin/fetchPeriods', ctx).catch(() => null)
}
watch(() => [props.spaceId, props.eventId], load, { immediate: true })

async function run(action) {
  working.value = true
  error.value = ''
  try {
    await store.dispatch(action, { spaceId: props.spaceId, eventId: props.eventId, phase: props.phase })
  } catch (e) {
    // Jamais silencieux : un refus serveur (hors période) doit se lire.
    error.value = e?.response?.data?.message || t('invPinAccessError')
  } finally {
    working.value = false
  }
}
</script>

<style scoped>
/* Ligne pleine largeur sous le titre, boutons calés à droite (maquette pages 3 et 4). */
.inv-pin-band {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  width: 100%;
  margin-top: 6px;
  color: #FFFFFF;
}
.inv-pin-band__pin {
  font-size: 1rem;
  font-weight: 700;
}
.inv-pin-band__code {
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}
.inv-pin-band__status {
  font-weight: 600;
}
.inv-pin-band__none {
  font-weight: 600;
  opacity: 0.85;
}
.inv-pin-band__actions {
  display: inline-flex;
  gap: 6px;
  margin-left: auto;
}
.inv-pin-band__btn {
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
.inv-pin-band__btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.inv-pin-band__btn:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.45);
  outline-offset: 2px;
}
.inv-pin-band__hint {
  flex-basis: 100%;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.85);
}
</style>
