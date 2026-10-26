<template>
  <button
    v-if="cadence"
    type="button"
    class="lcb"
    :class="`lcb--${cadence.band}`"
    :title="t('anLiveCadOpenDetail')"
    :aria-label="`${t('anLiveCadOpenDetail')} : ${label}`"
    @click="$emit('open')"
  >{{ label }}</button>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

/**
 * Pourcentage de cadence (écart ventes réelles / prévues à la minute m) d'une ligne de
 * l'Inventaire live. Sobre : texte discret, la couleur forte est celle du camion.
 * Sans cadence, rien n'est rendu. Le clic ouvre le détail du calcul (émet 'open').
 */
const props = defineProps({
  /** { pct, band, ... } ou null. */
  cadence: { type: Object, default: null },
})
defineEmits(['open'])

const { t } = useI18n()

const label = computed(() => {
  const pct = Number(props.cadence?.pct) || 0
  return `${pct > 0 ? '+' : ''}${pct} %`
})
</script>

<style scoped>
.lcb {
  border: none;
  background: transparent;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: #6b7280;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.lcb:hover { background: rgba(0, 0, 0, 0.05); }
.lcb:focus-visible { outline: 2px solid #ff3131; outline-offset: 1px; }
.lcb--orange { color: #b45309; }
.lcb--red { color: #b91c1c; }
.lcb--violet { color: #6d28d9; }

.lip--dark .lcb { color: #94a3b8; }
.lip--dark .lcb:hover { background: rgba(255, 255, 255, 0.08); }
.lip--dark .lcb--orange { color: #fbbf24; }
.lip--dark .lcb--red { color: #f87171; }
.lip--dark .lcb--violet { color: #a78bfa; }
</style>
