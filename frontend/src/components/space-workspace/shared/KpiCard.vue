<template>
  <!-- Carte au format EventPredict (.ep-metric-card) : fond blanc, rail latéral
       coloré (couleur = config.accent), label + valeur. Pied « Total » retiré à
       la demande. -->
  <v-card
    flat
    class="kpi-card"
    :class="{ 'kpi-card--dark': isDark }"
    :style="{ '--kpi-rail': config.accent }"
    @click="$emit('click')"
    hover
    style="cursor: pointer"
  >
    <div class="kpi-head">
      <v-icon :color="config.accent" size="15" class="mr-1">{{ config.icon }}</v-icon>
      <span class="kpi-label" :style="{ color: config.labelColor }">
        {{ config.label }}
      </span>
      <span
        v-if="!loading && variation != null"
        class="kpi-variation d-flex align-center"
        :style="{ color: variationColor }"
      >
        <v-icon size="13" class="mr-1">
          {{ variation >= 0 ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
        </v-icon>
        {{ variationLabel }}
      </span>
    </div>

    <!-- BUG-350-01 : tant que la source canonique n'a pas répondu, on montre un
         squelette — JAMAIS une valeur de repli destinée à bouger. -->
    <div v-if="loading" class="kpi-value kpi-skeleton" aria-hidden="true"></div>
    <div v-else class="kpi-value">{{ value }}</div>
  </v-card>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'

export default {
  name: 'KpiCard',
  props: {
    config: { type: Object, required: true },
    value: { type: String, required: true },
    subtext: { type: String, default: '' },
    variation: { type: Number, default: null },
    variationUnit: { type: String, default: '%' }, // % | pp
    // BUG-350-01 — squelette au lieu d'une valeur provisoire.
    loading: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup() {
    const theme = useTheme()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { isDark }
  },
  computed: {
    variationLabel() {
      if (this.variation == null) return ''
      const sign = this.variation >= 0 ? '+' : ''
      const digits = this.variationUnit === 'pp' ? 1 : 1
      return `${sign}${this.variation.toFixed(digits)}${this.variationUnit}`
    },
    // Rouge si négatif sur une KPI "positive" (revenue/margin),
    // ou si positif sur une KPI "négative" (cost). Sinon vert.
    variationColor() {
      const isCostLike = this.config.key === 'avgCost'
      const isPositive = this.variation >= 0
      const isGood = isCostLike ? !isPositive : isPositive
      return isGood ? '#4CAF50' : '#ff3131'
    },
  },
}
</script>

<style scoped>
/* Format EventPredict (.ep-metric-card) : fond blanc, border #e5e7eb, radius 16,
   rail 3px. (Pas de min-height 118 : ces cartes n'ont pas le bloc « Ajusté »
   qui remplit la hauteur côté EventPredict → on garde la taille au contenu.) */
.kpi-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.kpi-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--kpi-rail, #64748b);
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}
.kpi-head {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 6px;
}
.kpi-label {
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.kpi-variation {
  margin-left: auto;
  font-size: var(--fs-xs);
  font-weight: 700;
  white-space: nowrap;
}
.kpi-value {
  color: #212121;
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  line-height: 1.1;
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* BUG-350-01 — squelette de valeur (même gabarit que .kpi-value pour éviter le
   saut de hauteur au moment où la vraie valeur arrive). */
.kpi-skeleton {
  width: 60%;
  min-width: 90px;
  height: 1.1em;
  border-radius: 6px;
  background: linear-gradient(90deg, #eceff1 25%, #f5f7f8 50%, #eceff1 75%);
  background-size: 200% 100%;
  animation: kpi-skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes kpi-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .kpi-skeleton { animation: none; }
}

/* ===================== DARK MODE ===================== */
.kpi-card--dark {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.kpi-card--dark:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
}
.kpi-card--dark .kpi-value {
  color: #f9fafb;
}
.kpi-card--dark .kpi-skeleton {
  background: linear-gradient(90deg, #273549 25%, #334155 50%, #273549 75%);
  background-size: 200% 100%;
}
</style>
