<template>
  <footer class="cf-foot">
    <div class="cf-foot__alerts" aria-live="polite">
      <div
        v-for="a in alerts"
        :key="a.key"
        class="cf-alert"
        :class="{ 'cf-alert--info': a.tone === 'info' }"
      >
        <v-icon size="16" class="cf-alert__ico" aria-hidden="true">mdi-alert-outline</v-icon>
        <span>{{ t(a.key) }}</span>
      </div>
    </div>

    <div class="cf-foot__counts" role="group" :aria-label="t('anCmpCountsLabel')" aria-live="polite">
      <div class="cf-pv">
        <div class="cf-pv__n">{{ mainCount }}</div>
        <div class="cf-pv__t">{{ t('anCmpCountMain') }}</div>
      </div>
      <div class="cf-pv cf-pv--cmp">
        <div class="cf-pv__n">{{ comparisonCount }}</div>
        <div class="cf-pv__t">{{ t('anCmpCountCmp') }}</div>
      </div>
    </div>

    <div class="cf-foot__row">
      <button type="button" class="cf-btn cf-btn--ghost" @click="emit('reset')">
        {{ t('anCmpReset') }}
      </button>
      <span class="cf-foot__spacer"></span>
      <button v-if="hasReport" type="button" class="cf-btn cf-btn--ghost" @click="emit('back')">
        {{ t('anCmpBack') }}
      </button>
      <button type="button" class="cf-btn cf-btn--primary" :disabled="!canRun" @click="emit('run')">
        <v-icon size="18" aria-hidden="true">mdi-compare-horizontal</v-icon>{{ t('anCmpRun') }}
      </button>
    </div>
  </footer>
</template>

<script setup>
// Pied collant du formulaire : alertes, deux compteurs d'events et actions.
import { useI18n } from '@/i18n/useI18n'

defineProps({
  mainCount: { type: Number, default: 0 },
  comparisonCount: { type: Number, default: 0 },
  // [{ key: clé i18n, tone: 'warn' | 'info' }]
  alerts: { type: Array, default: () => [] },
  canRun: { type: Boolean, default: false },
  // « Retour au rapport » n'apparaît que si un rapport existe.
  hasReport: { type: Boolean, default: false },
})
const emit = defineEmits(['reset', 'back', 'run'])

const { t } = useI18n()
</script>

<style scoped>
.cf-foot {
  position: sticky;
  bottom: 0;
  z-index: 1;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 4px;
  background: var(--cf-bg);
  border-top: 1px solid var(--cf-line);
}
.cf-foot__alerts { display: flex; flex-direction: column; gap: 10px; }
.cf-foot__alerts:empty { display: none; }
.cf-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: var(--fs-base);
  line-height: 1.35;
  background: var(--cf-warn-bg);
  color: var(--cf-warn);
}
.cf-alert--info { background: var(--cf-cmp-bg); color: var(--cf-cmp); }
.cf-alert__ico { flex: none; margin-top: 1px; }
.cf-foot__counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.cf-pv {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid var(--cf-line);
  border-radius: 12px;
  background: var(--cf-surface);
}
.cf-pv--cmp { border-color: var(--cf-cmp-line); background: var(--cf-cmp-bg); }
.cf-pv__n {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.cf-pv__t { font-size: var(--fs-xs); color: var(--cf-muted); }
.cf-pv--cmp .cf-pv__t { color: var(--cf-cmp); }
.cf-foot__row { display: flex; align-items: center; gap: 10px; }
.cf-foot__spacer { flex: 1; }
.cf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  box-sizing: border-box;
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.cf-btn--ghost {
  padding: 0 14px;
  border: 1px solid var(--cf-line);
  background: var(--cf-surface);
  color: var(--cf-fg);
  font-size: var(--fs-base);
}
.cf-btn--ghost:hover { background: var(--cf-surface2); }
.cf-btn--primary {
  padding: 0 22px;
  border: 0;
  background: var(--cf-band);
  color: #fff;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3);
}
.cf-btn--primary:hover:not(:disabled) { filter: brightness(1.06); }
.cf-btn--primary:disabled {
  background: var(--cf-neutral);
  box-shadow: none;
  opacity: 0.5;
  cursor: not-allowed;
}
.cf-btn:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
/* Mobile : pied collant, ghost sur une rangée, « Comparer » pleine largeur, cibles >= 44 px. */
@media (max-width: 900px) {
  .cf-foot__row { flex-wrap: wrap; }
  .cf-foot__spacer { display: none; }
  .cf-btn { height: 44px; }
  .cf-btn--ghost { flex: 1 1 0; }
  .cf-btn--primary { flex: 1 1 100%; }
}
</style>
