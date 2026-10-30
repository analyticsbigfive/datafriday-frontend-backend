<template>
  <v-menu location="bottom end" offset="6">
    <template #activator="{ props: menuProps }">
      <RestockSelectButton v-bind="menuProps" :label="label" :aria-label="label" />
    </template>
    <v-list density="compact" class="rga-list">
      <v-list-item v-for="pct in presets" :key="pct" @click="$emit('apply', pct)">
        <v-list-item-title class="rga-item">{{ pct }}%</v-list-item-title>
      </v-list-item>
      <v-list-item @click="$emit('reset')">
        <v-list-item-title class="rga-item">{{ resetLabel }}</v-list-item-title>
      </v-list-item>
      <v-divider />
      <v-list-item @click="$emit('toggle-all', !allSelected)">
        <v-list-item-title class="rga-item">{{ allSelected ? deselectAllLabel : selectAllLabel }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script>
// Menu « Ajustement global » de l'étape 1 de Commande (onglet PDV à stocker).
// Mêmes actions que les anciens boutons 80 / 100 / 120 / Reset / Tout (dé)sélectionner :
// le composant n'émet que des événements, la vue garde les méthodes.
import RestockSelectButton from '@/components/space-workspace/restock/components/RestockSelectButton.vue'

export default {
  name: 'RestockGlobalAdjustMenu',
  components: { RestockSelectButton },
  props: {
    label: { type: String, required: true },
    resetLabel: { type: String, required: true },
    selectAllLabel: { type: String, required: true },
    deselectAllLabel: { type: String, required: true },
    allSelected: { type: Boolean, default: false },
    presets: { type: Array, default: () => [80, 100, 120] },
  },
  emits: ['apply', 'reset', 'toggle-all'],
}
</script>

<style scoped>
.rga-item {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}
</style>
