<template>
  <!-- Shell de route (doc §4.3) : rien d'autre que le montage de l'espace de travail.
       :key="spaceId" → changement d'espace = remontage propre (store par espace). -->
  <BuilderWorkspace v-if="spaceId" :key="spaceId" :space-id="spaceId" />
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BuilderWorkspace from './BuilderWorkspace.vue'

const route = useRoute()
const spaceId = computed(() => route.params.spaceId)
</script>
