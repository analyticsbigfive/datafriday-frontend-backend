<template>
  <div class="cks" role="group" :aria-label="t('anCmpStripLabel')" :aria-busy="loading ? 'true' : undefined">
    <div v-if="loading" class="cks__skel" aria-hidden="true"></div>
    <div v-else class="cks__strip" :class="{ 'cks__strip--wrap': wrap }">
      <div v-for="chip in chips" :key="chip.key" class="cks__chip" :style="{ '--kc': chip.color }">
        <div class="cks__label">{{ chip.label }}</div>
        <div class="cks__value">
          <span>{{ chip.value }}</span>
          <DeltaPill v-if="chip.delta" :delta="chip.delta" size="sm" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Les 8 puces du haut du drawer (maquette .kstrip / .kchip) avec l'écart vs le principal.
// Défilement horizontal avec fondu à droite. Piloté par props : le bouton fermer est celui du drawer.
import DeltaPill from '@/components/space-workspace/shared/DeltaPill.vue'
import { useI18n } from '@/i18n/useI18n'

defineProps({
  // [{ key, label, value, color, delta }] (utils/comparisonReportView.buildKpiChips)
  chips: { type: Array, default: () => [] },
  // true : squelette à la place des puces (chargement initial)
  loading: { type: Boolean, default: false },
  // true : puces sur plusieurs lignes, sans défilement ni fondu (copie réservée à la capture)
  wrap: { type: Boolean, default: false },
})

const { t } = useI18n()
</script>

<style scoped>
.cks { flex: 1; min-width: 0; }
.cks__strip {
  display: flex;
  align-items: stretch;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 22px 2px 0;
  scrollbar-width: thin;
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
}
.cks__strip--wrap {
  flex-wrap: wrap;
  overflow: visible;
  padding-right: 0;
  -webkit-mask-image: none;
  mask-image: none;
}
.cks__chip {
  position: relative;
  flex: 0 0 auto;
  min-width: 92px;
  padding: 5px 10px 5px 12px;
  border-radius: 10px;
  background: var(--cr-surface2);
}
.cks__chip::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 3px;
  background: var(--kc, #64748b);
}
.cks__label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--cr-muted);
  white-space: nowrap;
}
.cks__value {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--cr-fg);
}
.cks__skel {
  height: 46px;
  border-radius: 10px;
  background: linear-gradient(90deg, var(--cr-surface2) 25%, var(--cr-line) 50%, var(--cr-surface2) 75%);
  background-size: 200% 100%;
  animation: cks-sh 1.4s ease-in-out infinite;
}
@keyframes cks-sh { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .cks__skel { animation: none; } }
</style>
