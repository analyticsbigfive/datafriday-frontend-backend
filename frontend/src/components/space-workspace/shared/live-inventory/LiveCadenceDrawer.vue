<template>
  <Teleport to="body">
    <Transition name="lcd">
      <div v-if="modelValue && cadence" class="lcd-overlay" @click.self="close">
        <div class="lcd-panel" role="dialog" aria-modal="true" :aria-label="t('anLiveCadDrawerTitle')">
          <div class="lcd-header">
            <div class="lcd-header-text">
              <div class="lcd-title">{{ t('anLiveCadDrawerTitle') }}</div>
              <div class="lcd-sub">{{ shopName }} · {{ elementName }}</div>
            </div>
            <button class="lcd-close" type="button" :aria-label="t('anLiveCadClose')" @click="close">
              <v-icon size="18">mdi-close</v-icon>
            </button>
          </div>
          <v-divider />

          <div class="lcd-body">
            <div class="lcd-pct" :class="`lcd-pct--${cadence.band}`">
              <span class="lcd-pct__val">{{ pctLabel }}</span>
              <span class="lcd-pct__lbl">{{ t('anLiveCadDiffLabel') }}</span>
            </div>

            <dl class="lcd-list">
              <div class="lcd-row">
                <dt>{{ t('anLiveCadShop') }}</dt>
                <dd>{{ shopName }}</dd>
              </div>
              <div class="lcd-row">
                <dt>{{ t('anLiveCadElement') }}</dt>
                <dd>{{ elementName }}</dd>
              </div>
              <div class="lcd-row">
                <dt>{{ fill('anLiveCadSold') }}</dt>
                <dd>{{ qty(cadence.soldUnits) }}</dd>
              </div>
              <div class="lcd-row">
                <dt>{{ fill('anLiveCadPredictedAt') }}</dt>
                <dd>{{ qty(cadence.predictedToMinuteUnits) }}</dd>
              </div>
              <div class="lcd-row">
                <dt>{{ t('anLiveCadDiff') }}</dt>
                <dd>{{ pctLabel }}</dd>
              </div>
              <div class="lcd-row">
                <dt>{{ t('anLiveCadRemaining') }}</dt>
                <dd>{{ qty(cadence.remainingUnits) }}</dd>
              </div>
              <div class="lcd-row">
                <dt>{{ t('anLiveCadRemainingSameCadence') }}</dt>
                <dd>{{ qty(cadence.remainingAtSameCadenceUnits) }}</dd>
              </div>
              <div class="lcd-row lcd-row--total">
                <dt>{{ t('anLiveCadToRestock') }}</dt>
                <dd>{{ qty(cadence.toRestockUnits) }}</dd>
              </div>
            </dl>

            <p class="lcd-note">{{ t('anLiveCadToRestockFormula') }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from '@/i18n/useI18n'

/**
 * Drawer « détail du calcul » de la cadence d'une ligne de l'Inventaire live :
 * ventes réelles vs prévues à la minute m, restant prévu, restant à cadence constante
 * et quantité à restocker. Lecture seule, toutes les valeurs viennent de `cadence`.
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** { pct, band, minuteLabel, soldUnits, predictedToMinuteUnits, remainingUnits,
   *    remainingAtSameCadenceUnits, toRestockUnits } (unités d'inventaire). */
  cadence: { type: Object, default: null },
  shopName: { type: String, default: '' },
  elementName: { type: String, default: '' },
  unit: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const pctLabel = computed(() => {
  const pct = Number(props.cadence?.pct) || 0
  return `${pct > 0 ? '+' : ''}${pct} %`
})

function qty(v) {
  const n = Number(v) || 0
  const num = n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return props.unit ? `${num} ${props.unit.toLowerCase()}` : num
}

// Les libellés « à hh:mm » portent un jeton {time} remplacé par la minute calculée.
function fill(key) {
  return t(key).replace('{time}', props.cadence?.minuteLabel || '')
}

function close() {
  emit('update:modelValue', false)
}

function onKey(e) {
  if (e.key === 'Escape') close()
}
watch(
  () => props.modelValue,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.lcd-overlay {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
}
.lcd-panel {
  width: clamp(320px, 32vw, 480px);
  max-width: 100vw;
  height: 100%;
  background: rgb(var(--v-theme-surface));
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
}
.lcd-header { display: flex; align-items: center; gap: 10px; padding: 16px; flex-shrink: 0; }
.lcd-header-text { flex: 1; min-width: 0; }
.lcd-title { font-weight: var(--fw-bold); font-size: var(--fs-lg); }
.lcd-sub { font-size: var(--fs-sm); opacity: 0.65; overflow-wrap: anywhere; }
.lcd-close { border: none; background: transparent; cursor: pointer; padding: 4px; border-radius: 8px; opacity: 0.6; }
.lcd-close:hover { opacity: 1; background: rgba(0, 0, 0, 0.06); }

.lcd-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }

.lcd-pct {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.04);
}
.lcd-pct__val { font-size: var(--fs-xl); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.lcd-pct__lbl { font-size: var(--fs-sm); opacity: 0.7; }
.lcd-pct--orange .lcd-pct__val { color: #b45309; }
.lcd-pct--red .lcd-pct__val { color: #b91c1c; }
.lcd-pct--violet .lcd-pct__val { color: #6d28d9; }

.lcd-list { margin: 0; display: flex; flex-direction: column; }
.lcd-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  font-size: var(--fs-base);
}
.lcd-row:first-child { border-top: none; }
.lcd-row dt { flex: 1; min-width: 0; opacity: 0.75; overflow-wrap: anywhere; }
.lcd-row dd { margin: 0; text-align: right; font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; max-width: 55%; }
.lcd-row--total { border-top: 2px solid rgba(0, 0, 0, 0.18); }
.lcd-row--total dt { opacity: 1; font-weight: var(--fw-semibold); }
.lcd-row--total dd { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.lcd-note { margin: 0; font-size: var(--fs-sm); opacity: 0.6; }

.lcd-enter-active, .lcd-leave-active { transition: opacity .2s; }
.lcd-enter-active .lcd-panel, .lcd-leave-active .lcd-panel { transition: transform .2s; }
.lcd-enter-from, .lcd-leave-to { opacity: 0; }
.lcd-enter-from .lcd-panel, .lcd-leave-to .lcd-panel { transform: translateX(100%); }
</style>
