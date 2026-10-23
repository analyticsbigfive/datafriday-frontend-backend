<template>
  <div v-if="hasPredict" class="rph" :class="{ 'rph--empty': remaining <= 0 }">
    <div class="rph__head">
      <v-icon size="14" class="rph__icon">mdi-chart-timeline-variant</v-icon>
      <span v-if="remaining <= 0" class="rph__title">{{ t('restockPrefillNothing') }}</span>
      <span v-else-if="applied" class="rph__title">{{ t('restockPrefillTitle') }}</span>
      <span v-else class="rph__title">{{ t('restockPrefillNeedTitle') }} : {{ qty(remaining) }}</span>
    </div>

    <template v-if="remaining > 0">
      <div v-if="queued > 0" class="rph__note">{{ queuedLabel }}</div>
      <div v-if="capped" class="rph__note rph__note--warn">{{ cappedLabel }}</div>

      <div v-if="summary.items.length" class="rph__sources">
        <div class="rph__sources-title">{{ t('restockPrefillSources') }}</div>
        <ul class="rph__list">
          <li v-for="s in summary.items" :key="s.name" class="rph__line">
            <span class="rph__line-name">{{ s.name }}</span>
            <span class="rph__line-qty">{{ s.qty }}</span>
          </li>
          <li v-if="summary.more" class="rph__line rph__line--more">{{ moreLabel }}</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { summarizeSources } from '@/utils/liveRemainingSales'

/**
 * Encart du drawer Restocker : explique d'où vient la quantité pré-remplie
 * (ventes prévues restantes du predict) et ce qui la limite.
 */
const props = defineProps({
  /** { units, sources } ou null (pas de predict). */
  predicted: { type: Object, default: null },
  unit: { type: String, default: '' },
  /** Quantité déjà en file pour le même article et le même PdV. */
  queued: { type: Number, default: 0 },
  /** Quantité réellement proposée (après file et plafond), pour savoir si le champ est pré-rempli. */
  applied: { type: Boolean, default: false },
  capped: { type: Boolean, default: false },
  /** Quantité maximale disponible à l'origine, affichée quand plafonné. */
  cappedTo: { type: Number, default: 0 },
})

const { t } = useI18n()

const hasPredict = computed(() => !!props.predicted && Number.isFinite(props.predicted.units))
const remaining = computed(() => Math.max(0, (Number(props.predicted?.units) || 0) - (Number(props.queued) || 0)))
const summary = computed(() => summarizeSources(props.predicted?.sources))

function qty(n) {
  const num = (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return props.unit ? `${num} ${props.unit.toLowerCase()}` : num
}
const queuedLabel = computed(() => t('restockPrefillQueued').replace('{qty}', qty(props.queued)))
const cappedLabel = computed(() => t('restockPrefillCapped').replace('{qty}', qty(props.cappedTo)))
const moreLabel = computed(() => t('restockPrefillMore').replace('{n}', String(summary.value.more)))
</script>

<style scoped>
.rph {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.625rem;
  background: rgba(255, 49, 49, 0.08);
  border: 1px solid rgba(255, 49, 49, 0.25);
  font-size: var(--fs-sm);
}
.rph--empty { background: rgba(var(--v-theme-on-surface), 0.05); border-color: rgba(var(--v-theme-on-surface), 0.12); }
.rph__head { display: flex; align-items: flex-start; gap: 0.375rem; }
.rph__icon { margin-top: 0.125rem; color: #ff3131; flex-shrink: 0; }
.rph--empty .rph__icon { color: inherit; opacity: 0.6; }
.rph__title { font-weight: var(--fw-semibold); line-height: 1.35; }
.rph__note { opacity: 0.75; line-height: 1.35; }
.rph__note--warn { color: rgb(var(--v-theme-warning, 184, 134, 11)); opacity: 1; font-weight: var(--fw-medium); }
.rph__sources-title { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; opacity: 0.6; margin-bottom: 0.25rem; }
.rph__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.125rem; }
.rph__line { display: flex; justify-content: space-between; gap: 0.75rem; line-height: 1.35; }
.rph__line-name { min-width: 0; overflow-wrap: anywhere; }
.rph__line-qty { font-variant-numeric: tabular-nums; font-weight: var(--fw-semibold); flex-shrink: 0; }
.rph__line--more { opacity: 0.65; }
</style>
