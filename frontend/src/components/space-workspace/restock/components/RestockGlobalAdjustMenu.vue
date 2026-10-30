<template>
  <v-menu location="bottom end" offset="6">
    <template #activator="{ props: menuProps }">
      <button type="button" class="rga-btn" v-bind="menuProps" :aria-label="label">
        <span class="rga-label">{{ label }}</span>
        <v-icon size="18">mdi-chevron-down</v-icon>
      </button>
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
export default {
  name: 'RestockGlobalAdjustMenu',
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
.rga-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 170px;
  height: 36px;
  padding: 0 10px 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  white-space: nowrap;
}
.rga-btn:hover {
  border-color: #9ca3af;
}
.rga-btn:focus-visible {
  outline: 2px solid #ff3131;
  outline-offset: 1px;
}
.rga-item {
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
}
</style>
