<template>
  <ComparisonKpiStrip :chips="chips" :loading="!hasValues" />
</template>

<script setup>
// En-tête du drawer en vue rapport : la bande des 8 puces avec l'écart vs le principal.
// Se monte dans le slot `head` de ComparisonDrawer (à droite du bouton fermer).
import { useComparisonKpiChips } from '@/composables/useComparisonKpiChips'
import ComparisonKpiStrip from './ComparisonKpiStrip.vue'

const props = defineProps({
  // Retour de useComparisonRuntime.
  runtime: { type: Object, required: true },
})

const { chips, hasValues } = useComparisonKpiChips(props.runtime)
</script>
