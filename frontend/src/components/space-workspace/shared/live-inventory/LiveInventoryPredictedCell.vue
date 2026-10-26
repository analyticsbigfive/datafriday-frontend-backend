<template>
  <span class="lipc" :class="{ 'lipc--none': !hasValue, 'lipc--zero': hasValue && isZero }">
    <!-- États sans valeur : chargement (libellé), predict indisponible ou élément absent du
         predict (cellule vide, le bandeau du panneau explique le premier cas), restant à 0. -->
    <template v-if="!hasValue">
      <span v-if="loading" class="lipc__loading">{{ t('anLiveInvPredictLoading') }}</span>
      <!-- Sans valeur : cellule vide plutôt qu'un tiret répété sur chaque ligne. -->
      <span v-else-if="available" class="lipc__none" :title="t('anLiveInvNotCovered')"></span>
    </template>
    <template v-else>
      <span class="lipc__val">{{ isZero ? '0' : label }}</span>
      <v-tooltip activator="parent" location="top" :z-index="3500">
        <div class="lipc__tip">
          <div v-if="isZero">{{ t('anLiveInvNothingToRestock') }}</div>
          <template v-else>
            <div class="lipc__tip-title">{{ t('anLiveInvColPredictedFull') }} : {{ label }}</div>
            <div v-if="summary.items.length" class="lipc__tip-sub">{{ t('anLiveInvPredictedTipSources') }}</div>
            <div v-for="s in summary.items" :key="s.name" class="lipc__tip-line">{{ s.name }} : {{ s.qty }}</div>
            <div v-if="summary.more" class="lipc__tip-line">{{ moreLabel }}</div>
          </template>
        </div>
      </v-tooltip>
    </template>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { summarizeSources } from '@/utils/liveRemainingSales'

/**
 * Cellule « Prévu restant » de l'onglet Inventaire live. Predict indisponible ou élément non couvert : tiret. Restant à 0 : « 0 » (rien à réarmer). Sinon valeur + unité, avec le
 * détail des Menu Items restants en infobulle.
 */
const props = defineProps({
  /** { units, sources } ou null (pas de predict pour cette ligne). */
  predicted: { type: Object, default: null },
  unit: { type: String, default: '' },
  /** false = predict indisponible pour tout l'événement (explication dans le bandeau). */
  available: { type: Boolean, default: true },
  /** true = predict en cours de chargement (catalogue de recettes) : libellé au lieu d'un tiret. */
  loading: { type: Boolean, default: false },
})

const { t } = useI18n()

const hasValue = computed(() => !!props.predicted && Number.isFinite(props.predicted.units))
const isZero = computed(() => hasValue.value && props.predicted.units <= 0)
const label = computed(() => {
  const n = Number(props.predicted?.units) || 0
  const num = n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return props.unit ? `${num} ${props.unit.toLowerCase()}` : num
})
const summary = computed(() => summarizeSources(props.predicted?.sources))
const moreLabel = computed(() => t('restockPrefillMore').replace('{n}', String(summary.value.more)))
</script>

<style scoped>
.lipc {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  min-width: 0;
  font-variant-numeric: tabular-nums;
  color: #374151;
  white-space: nowrap;
  cursor: default;
}
.lipc--none { color: #6b7280; font-weight: var(--fw-regular); }
.lipc__loading { font-size: var(--fs-xs); font-weight: var(--fw-regular); color: #9ca3af; font-style: italic; }
.lipc__none { display: inline-block; min-width: 1rem; min-height: 1rem; }
.lipc--zero { color: #6b7280; font-weight: var(--fw-medium); }
.lipc__tip { font-size: var(--fs-sm); line-height: 1.4; max-width: 18rem; white-space: normal; }
.lipc__tip-title { font-weight: var(--fw-semibold); }
.lipc__tip-sub { margin-top: 0.25rem; opacity: 0.75; }

.lip--dark .lipc { color: #e2e8f0; }
.lip--dark .lipc--none { color: #94a3b8; }
.lip--dark .lipc__loading { font-size: var(--fs-xs); font-weight: var(--fw-regular); color: #9ca3af; font-style: italic; }
.lip--dark .lipc--zero { color: #94a3b8; }
</style>
