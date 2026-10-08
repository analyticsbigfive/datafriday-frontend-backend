<template>
  <v-select
    :model-value="visibleValue"
    :items="items"
    item-title="name"
    item-value="id"
    multiple
    chips
    closable-chips
    variant="outlined"
    density="compact"
    hide-details="auto"
    :hint="hint"
    :persistent-hint="!!hint"
    :menu-props="{ zIndex: 10000 }"
    @update:model-value="onUpdate"
  />
</template>

<script>
/**
 * Choix multiple d'espaces (liste du store `spaces`, chargée au besoin : pour un compte
 * restreint, ses seuls espaces). Les espaces de la fiche hors de cette liste ne sont
 * pas affichés mais restent dans la valeur (le serveur les conserve aussi) : un compte
 * restreint ne retire jamais par mégarde l'espace d'un autre.
 */
export default {
  name: 'SpaceMultiSelect',
  props: {
    modelValue: { type: Array, default: () => [] },
    hint: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  computed: {
    items() {
      return (this.$store.getters['spaces/spaces'] || []).map((s) => ({ id: String(s.id), name: s.name }));
    },
    knownIds() {
      return new Set(this.items.map((s) => s.id));
    },
    visibleValue() {
      return (this.modelValue || []).map(String).filter((id) => this.knownIds.has(id));
    },
    hiddenValue() {
      return (this.modelValue || []).map(String).filter((id) => !this.knownIds.has(id));
    },
  },
  mounted() {
    this.$store.dispatch('spaces/fetchSpaces').catch(() => {});
  },
  methods: {
    onUpdate(ids) {
      this.$emit('update:modelValue', [...(ids || []), ...this.hiddenValue]);
    },
  },
};
</script>
