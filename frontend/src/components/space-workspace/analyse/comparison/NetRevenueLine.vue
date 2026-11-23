<template>
  <span class="nrl" :title="title">
    <span class="nrl__label">{{ t('anNetRevenueLabel') }}</span>
    <span class="nrl__value">{{ valueText }}</span>
    <span v-if="deltaText" class="nrl__delta" :class="`nrl__delta--${tone}`">
      <span aria-hidden="true">{{ deltaText }}</span>
      <span class="nrl__sr">{{ srText }}</span>
    </span>
  </span>
</template>

<script setup>
// Ligne « Revenue net » (CA - coût) des bandeaux rouges de la Prévision et de sa comparaison, avec,
// côté comparaison, l'écart en % par rapport à la prévision d'origine du principal.
// Posée sur du rouge : texte blanc, pastille d'écart blanche pleine (DeltaPill est translucide,
// illisible sur ce fond). Pas de commentaire HTML dans le gabarit (attrs hérités par la racine).
import { computed } from 'vue'
import { formatCurrency } from '@/composables/useFormatters'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Revenue net en euros ; null = non calculable (aucun coût connu), affiché « — ».
  value: { type: Number, default: null },
  // Écart de computeReportDeltas ({ kind, text, tone }) ; absent ou sans chiffre : pas de pastille.
  delta: { type: Object, default: null },
})

const { t } = useI18n()

const valueText = computed(() => (props.value == null || !Number.isFinite(props.value) ? '—' : formatCurrency(props.value)))
const title = computed(() => (props.value == null ? t('anNetRevenueNoCost') : t('anNetRevenueTip')))
const deltaText = computed(() => (props.delta?.kind === 'delta' ? String(props.delta.text || '') : ''))
const tone = computed(() => (props.delta?.tone === 'good' || props.delta?.tone === 'bad' ? props.delta.tone : 'neutral'))

// Texte pour lecteur d'écran, même formulation que DeltaPill : « en hausse de 4,2 % ».
const srText = computed(() => {
  const text = deltaText.value
  if (!text) return ''
  if (text.startsWith('=')) return t('anDeltaSrZero')
  const value = text.replace(/^[▲▼]\s*/, '').trim()
  return t(text.startsWith('▼') ? 'anDeltaSrDown' : 'anDeltaSrUp').replace('{value}', value)
})
</script>

<style scoped>
.nrl {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  min-width: 0;
  font-size: var(--fs-sm);
}
.nrl__label { opacity: 0.92; }
.nrl__value {
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.nrl__delta {
  align-self: center;
  padding: 2px 8px;
  border-radius: 99px;
  background: #fff;
  font-size: var(--fs-xs, 0.6875rem);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.nrl__delta--good { color: #15803d; }
.nrl__delta--bad { color: #b91c1c; }
.nrl__delta--neutral { color: #475569; }
.nrl__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
