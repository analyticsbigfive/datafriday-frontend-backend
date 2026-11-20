<template>
  <footer class="fc-foot">
    <div class="fc-foot__row">
      <button type="button" class="fc-btn fc-btn--ghost" :disabled="!canClear" @click="emit('clear')">
        {{ t('fcstClear') }}
      </button>
      <span class="fc-foot__spacer"></span>
      <button v-if="hasReport" type="button" class="fc-btn fc-btn--ghost" @click="emit('back')">
        {{ t('anCmpBack') }}
      </button>
      <button type="button" class="fc-btn fc-btn--primary" :disabled="!canApply" @click="emit('apply')">
        <v-icon size="18" aria-hidden="true">mdi-check</v-icon>{{ t('fcstApply') }}
      </button>
    </div>
  </footer>
</template>

<script setup>
// Pied collant du formulaire Forecast : effacer, retour au rapport (s'il existe), appliquer.
import { useI18n } from '@/i18n/useI18n'

defineProps({
  canApply: { type: Boolean, default: false },
  // « Tout effacer » n'a de sens que s'il y a au moins une modification dans la liste.
  canClear: { type: Boolean, default: false },
  hasReport: { type: Boolean, default: false },
})
const emit = defineEmits(['clear', 'back', 'apply'])

const { t } = useI18n()
</script>

<style scoped>
.fc-foot {
  position: sticky;
  bottom: 0;
  z-index: 1;
  margin-top: auto;
  padding: 0.75rem 0 0.25rem;
  background: var(--cf-bg);
  border-top: 1px solid var(--cf-line);
}
.fc-foot__row { display: flex; align-items: center; gap: 0.625rem; }
.fc-foot__spacer { flex: 1; }
.fc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  box-sizing: border-box;
  border-radius: 10px;
  font: inherit;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
}
.fc-btn--ghost {
  padding: 0 0.875rem;
  border: 1px solid var(--cf-line);
  background: var(--cf-surface);
  color: var(--cf-fg);
  font-size: var(--fs-base);
}
.fc-btn--ghost:hover:not(:disabled) { background: var(--cf-surface2); }
.fc-btn--ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.fc-btn--primary {
  padding: 0.375rem 1.375rem;
  border: 0;
  background: var(--cf-band);
  color: #fff;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3);
}
.fc-btn--primary:hover:not(:disabled) { filter: brightness(1.06); }
.fc-btn--primary:disabled {
  background: var(--cf-neutral);
  box-shadow: none;
  opacity: 0.5;
  cursor: not-allowed;
}
.fc-btn:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
/* Mobile : boutons secondaires sur une rangée, « Appliquer » pleine largeur, cibles >= 44 px. */
@media (max-width: 900px) {
  .fc-foot__row { flex-wrap: wrap; }
  .fc-foot__spacer { display: none; }
  .fc-btn { min-height: 2.75rem; }
  .fc-btn--ghost { flex: 1 1 0; }
  .fc-btn--primary { flex: 1 1 100%; }
}
</style>
