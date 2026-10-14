<template>
  <span
    class="delta-pill"
    :class="[`delta-pill--${variant}`, { 'delta-pill--sm': size === 'sm' }]"
    :title="tooltip || undefined"
  >
    <span aria-hidden="true">{{ visibleText }}</span>
    <span class="delta-pill__sr">{{ srText }}</span>
  </span>
</template>

<script setup>
// Pastille d'écart du rapport de comparaison (maquette .dl) : vert / rouge / gris,
// « nouveau » en violet, « = du jour » en gris avec info-bulle (VALO STOCK).
// Pas de commentaire HTML dans le gabarit : il ferait un fragment (attrs non hérités).
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Objet d'écart de computeReportDeltas : { text, tone, kind, title? }.
  // kind 'delta' (valeur du moteur) ou 'value' est traité comme un écart chiffré.
  delta: { type: Object, default: null },
  size: { type: String, default: 'md', validator: (v) => v === 'md' || v === 'sm' },
})

const { t } = useI18n()

const kind = computed(() => {
  const k = props.delta?.kind
  if (k === 'new' || props.delta?.isNew) return 'new'
  if (k === 'same') return 'same'
  if (k === 'none' || !props.delta) return 'none'
  return 'value'
})

const variant = computed(() => {
  if (kind.value === 'new') return 'new'
  if (kind.value === 'same' || kind.value === 'none') return 'eq'
  const tone = props.delta?.tone
  return tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'eq'
})

const visibleText = computed(() => {
  if (kind.value === 'new') return t('anDeltaNew')
  if (kind.value === 'same') return t('anDeltaSameDay')
  if (kind.value === 'none') return '—'
  return props.delta?.text || '—'
})

const tooltip = computed(() => {
  if (props.delta?.title) return props.delta.title
  if (kind.value === 'new') return t('anDeltaNewTip')
  if (kind.value === 'same') return t('anDeltaSameDayTip')
  if (kind.value === 'none') return t('anDeltaNoRef')
  return ''
})

// Texte pour lecteur d'écran : « en hausse de 4,2 % » plutôt que « ▲ 4,2 % ».
const srText = computed(() => {
  if (kind.value === 'new') return t('anDeltaSrNew')
  if (kind.value === 'same') return t('anDeltaSrSame')
  if (kind.value === 'none') return t('anDeltaSrNone')
  const text = String(props.delta?.text || '')
  const value = text.replace(/^[▲▼]\s*/, '').trim()
  const key = text.startsWith('▼') ? 'anDeltaSrDown' : 'anDeltaSrUp'
  return t(key).replace('{value}', value)
})
</script>

<style scoped>
.delta-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--fs-xs, 0.6875rem);
  font-weight: var(--fw-bold, 700);
  line-height: 1;
  padding: 3px 6px;
  border-radius: 99px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: none;
}
.delta-pill--sm {
  padding: 2px 5px;
}
.delta-pill--good { color: #16a34a; background: rgba(22, 163, 74, 0.12); }
.delta-pill--bad { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
.delta-pill--eq { color: #64748b; background: rgba(100, 116, 139, 0.14); }
.delta-pill--new { color: #7c3aed; background: rgba(124, 58, 237, 0.1); font-style: italic; }

/* Texte réservé aux lecteurs d'écran. */
.delta-pill__sr {
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

/* ===================== DARK MODE ===================== */
.v-theme--dataFridayDark .delta-pill--good { color: #4ade80; background: rgba(74, 222, 128, 0.14); }
.v-theme--dataFridayDark .delta-pill--bad { color: #ff6b6b; background: rgba(255, 107, 107, 0.14); }
.v-theme--dataFridayDark .delta-pill--eq { color: #94a3b8; background: rgba(148, 163, 184, 0.16); }
.v-theme--dataFridayDark .delta-pill--new { color: #b79bff; background: rgba(183, 155, 255, 0.14); }
</style>
