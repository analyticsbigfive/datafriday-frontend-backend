<template>
  <!-- BUG-285 (fluidité, maquette « A+B ») : voile squelette posé sur les blocs qui
       dépendent des filtres pendant un recalcul (`filtersRecomputing`, useFilters).
       Semi-transparent : le contenu précédent reste deviné dessous (pas de saut de
       layout), les lignes shimmer disent « recalcul en cours ». Le parent doit être
       positionné (v-card l'est) ; `border-radius: inherit` épouse la carte. -->
  <div v-if="active" class="asv" aria-hidden="true">
    <span class="asv-line asv-w45"></span>
    <span class="asv-line asv-w85"></span>
    <span class="asv-line asv-w65"></span>
  </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false },
})
</script>

<style scoped>
.asv {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.72);
  pointer-events: none;
}
.asv-line {
  height: 11px;
  border-radius: 7px;
  background: linear-gradient(90deg, #eceef2 0%, #f7f8fa 45%, #eceef2 80%);
  background-size: 220% 100%;
  animation: asv-shimmer 1.1s ease-in-out infinite;
}
.asv-w45 { width: 45%; }
.asv-w85 { width: 85%; }
.asv-w65 { width: 65%; }
@keyframes asv-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .asv-line { animation: none; }
}
/* Dark : mêmes tokens shimmer que le skeleton Predict (BUG-282). */
.dark .asv {
  background: rgba(17, 24, 39, 0.72);
}
.dark .asv-line {
  background: linear-gradient(90deg, #1f2937 0%, #263548 45%, #1f2937 80%);
  background-size: 220% 100%;
}
</style>
