<template>
  <div class="cmks">
    <ComparisonKpiStrip :chips="chips" :loading="loading" />
  </div>
</template>

<script setup>
// Bande des 8 KPI du principal, posée au-dessus du bandeau rouge quand le drawer Comparaison est
// ouvert (colonne gauche), pour ressembler à la bande de la colonne Comparaison. Remplace la bande
// du header global, masquée dans ce mode. Les écarts affichés sont ceux du rapport de comparaison.
import { computed } from 'vue'
import ComparisonKpiStrip from './ComparisonKpiStrip.vue'

const props = defineProps({
  // headerKpis d'AnalyseView : [{ label, kind, value, color, delta }]
  kpis: { type: Array, default: () => [] },
  // true : squelette (valeurs pas encore connues)
  loading: { type: Boolean, default: false },
})

const chips = computed(() => props.kpis.map((k) => ({
  key: k.kind || k.label,
  label: k.label,
  value: k.value,
  color: k.color,
  delta: k.delta || null,
})))
</script>

<style scoped>
/* Jetons lus par ComparisonKpiStrip : ils sont posés sur le drawer pour sa colonne, ici pour la nôtre. */
.cmks {
  --cr-surface2: rgba(var(--v-theme-on-surface), 0.05);
  --cr-line: rgba(var(--v-border-color), var(--v-border-opacity));
  --cr-fg: rgb(var(--v-theme-on-surface));
  --cr-muted: rgba(var(--v-theme-on-surface), 0.62);
  display: flex;
  min-width: 0;
  min-height: 46px;
  margin-bottom: 12px;
}
</style>
