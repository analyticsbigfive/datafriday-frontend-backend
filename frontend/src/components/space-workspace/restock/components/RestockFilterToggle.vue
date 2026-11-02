<template>
  <button
    type="button"
    class="rft"
    :class="{ 'rft--open': expanded, 'rft--active': active }"
    :aria-label="label"
    :aria-expanded="expanded ? 'true' : 'false'"
    :aria-controls="controlsId"
    :title="label"
    @click="$emit('toggle')"
  >
    <v-icon size="20">mdi-filter-variant</v-icon>
    <span v-if="active" class="rft-dot" aria-hidden="true" />
  </button>
</template>

<script>
// Icône filtre de la barre de recherche de l'étape 1 de Commande : ouvre ou
// referme la ligne des filtres (Type, Catégories, Fournisseurs, Ajustement global).
// Colorée en primaire quand un filtre est renseigné, pour que l'on voie que la
// liste est filtrée même ligne repliée. Ne porte aucun état : la vue décide.
export default {
  name: 'RestockFilterToggle',
  props: {
    label: { type: String, required: true },
    expanded: { type: Boolean, default: false },
    /** Au moins un filtre (type, catégorie, fournisseur) est renseigné. */
    active: { type: Boolean, default: false },
    /** id de la ligne repliable pilotée par ce bouton. */
    controlsId: { type: String, default: undefined },
  },
  emits: ['toggle'],
}
</script>

<style scoped>
.rft {
  appearance: none;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--s1-control-h, 32px);
  height: var(--s1-control-h, 32px);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--sr-text-muted, #6b7280);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.rft:hover {
  background: rgba(17, 24, 39, 0.06);
  color: var(--sr-text, #111827);
}
.rft:focus-visible {
  outline: 2px solid var(--sr-primary, #ff3131);
  outline-offset: 1px;
}
.rft--open {
  border-color: var(--s1-border, #dde1e7);
  color: var(--sr-text, #111827);
}
.rft--active,
.rft--active:hover {
  color: var(--sr-primary, #ff3131);
}
.rft-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sr-primary, #ff3131);
  box-shadow: 0 0 0 2px var(--sr-surface, #fff);
}
</style>
