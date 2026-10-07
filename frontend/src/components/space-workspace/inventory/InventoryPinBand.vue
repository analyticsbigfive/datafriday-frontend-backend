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
    <InventoryPinActionButtons
      class="inv-pin-band__actions"
      :space-id="spaceId"
      :event-id="eventId"
      :phase="phase"
      @error="error = $event"
    />
    <span v-if="hint" class="inv-pin-band__hint">{{ hint }}</span>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useInventoryPinAccess } from '@/composables/useInventoryPinAccess'
import InventoryPinActionButtons from './InventoryPinActionButtons.vue'
import { pinActionsPending } from '@/composables/useInventoryPinActions'
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
const { window, periodState } = useInventoryPinAccess(computed(() => props.phase))
const error = ref('')

const pin = computed(() => window.value?.pin ?? null)

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

// Démarrages et arrêts automatiques (portes, livraison, vente, cron du cycle) : l'état
// est relu toutes les 30 s, onglet visible seulement, pour que ■ / ▶ et les lignes PDV
// les reflètent sans rechargement de la page.
const REFRESH_MS = 30 * 1000
const refreshTimer = setInterval(() => {
  // Action ■ / ▶ en cours (bandeau ou menu mobile) : on attend, sinon cette relecture
  // pouvait remettre l'ancien état dans le store.
  if (pinActionsPending.value > 0 || !props.spaceId || !props.eventId) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  store
    .dispatch('guestPinAdmin/fetchStatusBoard', { spaceId: props.spaceId, eventId: props.eventId })
    .catch(() => null)
}, REFRESH_MS)
onBeforeUnmount(() => clearInterval(refreshTimer))

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
  margin-left: auto;
}
/* Mobile (design Bertrand 2026-10-07) : ■ ▶ sur la ligne du PIN, à droite, jamais
   renvoyés à la ligne ; le PIN s'ellipse plutôt. L'aide reste en dessous. */
@media (max-width: 900px) {
  .inv-pin-band {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 8px;
    margin-top: 4px;
  }
  .inv-pin-band__pin {
    font-size: var(--fs-md);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inv-pin-band__hint {
    grid-column: 1 / -1;
  }
}
.inv-pin-band__hint {
  flex-basis: 100%;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.85);
}
</style>
