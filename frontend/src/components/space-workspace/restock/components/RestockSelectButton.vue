<template>
  <button type="button" class="rsb" :class="{ 'rsb--active': active }" :title="title || label">
    <span class="rsb-label">{{ label }}</span>
    <v-icon size="16" class="rsb-chevron">mdi-chevron-down</v-icon>
  </button>
</template>

<script>
// Déclencheur unique des sélecteurs de l'étape 1 de Commande (Ajustement global,
// Type, Catégorie, Fournisseur) : même hauteur, même bordure, même chevron.
// Les attributs du parent (activateur v-menu, aria-label) tombent sur le <button>.
export default {
  name: 'RestockSelectButton',
  props: {
    label: { type: String, required: true },
    title: { type: String, default: '' },
    /** Une valeur est choisie : bordure et texte mis en avant. */
    active: { type: Boolean, default: false },
  },
}
</script>

<style scoped>
.rsb {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  max-width: 100%;
  height: var(--s1-control-h, 32px);
  padding: 0 8px 0 12px;
  border: 1px solid var(--s1-border, #dde1e7);
  border-radius: 999px;
  background: var(--sr-surface, #fff);
  color: var(--sr-text, #111827);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 120ms ease;
}
.rsb:hover {
  border-color: #9ca3af;
}
.rsb:focus-visible {
  outline: 2px solid var(--sr-primary, #ff3131);
  outline-offset: 1px;
}
.rsb--active {
  border-color: var(--sr-primary, #ff3131);
}
.rsb-label {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rsb-chevron {
  flex: none;
  color: var(--sr-muted, #6b7280);
}
</style>
