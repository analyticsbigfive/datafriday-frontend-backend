<template>
  <!-- Kebab ⋮ : regroupe les actions d'une ligne « non rattaché » (Remapper /
       Ajouter / Réactiver + Space Menus) sur une seule ligne, hauteur uniforme.
       Remplace la rangée de boutons texte qui débordait sur 2 lignes. -->
  <v-menu location="bottom end" :close-on-content-click="true">
    <template #activator="{ props }">
      <button
        v-bind="props"
        type="button"
        class="epra-kebab"
        :title="t('epraActions')"
        :aria-label="t('epraActions')"
        @click.stop
      >
        <v-icon size="16">mdi-dots-vertical</v-icon>
      </button>
    </template>
    <v-list density="compact" class="epra-list" min-width="180">
      <v-list-item
        v-if="kind === 'remap'"
        class="epra-item"
        @click.stop="$emit('remap')"
      >
        <template #prepend><v-icon size="16">mdi-link-variant</v-icon></template>
        <v-list-item-title>{{ t('epraRemap') }}</v-list-item-title>
      </v-list-item>
      <v-list-item
        v-else
        class="epra-item"
        @click.stop="$emit('add')"
      >
        <template #prepend><v-icon size="16">mdi-plus-circle-outline</v-icon></template>
        <v-list-item-title>{{ kind === 'reactivate' ? t('epraReactivate') : t('epraAddToMenu') }}</v-list-item-title>
      </v-list-item>
      <v-list-item class="epra-item" @click.stop="$emit('open-space-menus')">
        <template #prepend><v-icon size="16">mdi-open-in-new</v-icon></template>
        <v-list-item-title>Space Menus</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'EventPredictRowActions',
  setup() {
    const { t } = useI18n()
    return { t }
  },
  props: {
    // 'remap' (hors catalogue) | 'add' (dispo, hors menu) | 'reactivate' (dans menu, désactivé)
    kind: { type: String, default: 'add' },
  },
  emits: ['remap', 'add', 'open-space-menus'],
}
</script>

<style scoped>
.epra-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 7px;
  /* BUG-247-01 : littéraux → contrat --fb-* (fallback = littéral d'origine,
     clair inchangé). Le bouton vit dans .event-predict-overlay où le contrat
     est déclaré (clair + sombre, style.css). Le v-list du menu est téléporté :
     son fond vient du thème Vuetify, rien à surcharger. */
  background: var(--fb-surface, #fff);
  color: var(--fb-muted, #64748b);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.epra-kebab:hover {
  background: var(--fb-subtle, #f1f5f9);
  color: var(--fb-text, #0f172a);
  border-color: var(--fb-border, #cbd5e1);
}
.epra-list {
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
}
.epra-item {
  font-size: 13px;
  min-height: 36px;
}
</style>
