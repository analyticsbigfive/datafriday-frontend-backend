<template>
  <!-- Kebab ⋮ : regroupe les actions d'une ligne « non rattaché » (Remapper /
       Ajouter / Réactiver + Space Menus) sur une seule ligne, hauteur uniforme.
       Remplace la rangée de boutons texte qui débordait sur 2 lignes. -->
  <v-menu class="epra-menu-overlay" location="bottom end" :close-on-content-click="true">
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
      <!-- Variante « header d'article » (vue Par article) : actions métier au
           niveau article — ajouter l'article à TOUS les PDV proposés dans Space
           Menus (si l'assignation est active), et l'alias historique (scopé
           espace, donc valable pour tous les PDV d'un coup). Remapper/Ajouter/
           Réactiver restent par PDV. -->
      <v-list-item
        v-if="variant === 'item-header' && allowAssignAll"
        class="epra-item"
        :disabled="assignAllDisabled"
        :title="assignAllDisabled ? t('epraAssignAllDone') : undefined"
        @click.stop="$emit('assign-all')"
      >
        <template #prepend><v-icon size="16">mdi-playlist-plus</v-icon></template>
        <v-list-item-title>{{ t('epraAssignAllShops') }}</v-list-item-title>
      </v-list-item>
      <v-list-item
        v-if="variant === 'row' && !historyOnly && kind === 'remap'"
        class="epra-item"
        @click.stop="$emit('remap')"
      >
        <template #prepend><v-icon size="16">mdi-link-variant</v-icon></template>
        <v-list-item-title>{{ t('epraRemap') }}</v-list-item-title>
      </v-list-item>
      <v-list-item
        v-else-if="variant === 'row' && !historyOnly"
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
      <!-- Alias « historique emprunté » (maquettes 08/2026) : proposer de
           reprendre l'historique d'un autre article — lignes orphelines (row)
           et header d'article (alias scopé espace → tous les PDV). -->
      <v-list-item
        v-if="allowHistory"
        class="epra-item epra-item--history"
        @click.stop="$emit('use-history')"
      >
        <template #prepend><v-icon size="16">mdi-history</v-icon></template>
        <v-list-item-title>{{ t('epraUseHistory') }}</v-list-item-title>
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
    // 'row' (ligne PDV, comportement historique) | 'item-header' (header
    // d'article en vue Par article : action bulk « tous les PDV » + Space Menus).
    variant: { type: String, default: 'row' },
    // 'remap' (hors catalogue) | 'add' (dispo, hors menu) | 'reactivate' (dans menu, désactivé)
    kind: { type: String, default: 'add' },
    // Propose « Utiliser l'historique d'un autre article » (alias espace).
    allowHistory: { type: Boolean, default: false },
    // Lignes « sans ventes prévues » (déjà au menu, activées) : seules les
    // actions historique + Space Menus ont un sens — masque Remapper/Ajouter.
    historyOnly: { type: Boolean, default: false },
    // item-header : grise l'action bulk quand l'article est déjà proposé partout.
    assignAllDisabled: { type: Boolean, default: false },
    // item-header : masque l'action bulk (ex. assignation Space Menus inactive
    // sur la config) tout en laissant le kebab pour Historique + Space Menus.
    allowAssignAll: { type: Boolean, default: true },
  },
  emits: ['remap', 'add', 'open-space-menus', 'use-history', 'assign-all'],
}
</script>

<style>
/* Le menu du kebab est un VOverlay séparé, téléporté hors du composant : un
   bloc `scoped` ne l'atteindrait pas. Quand la ligne vit dans un tiroir
   (EventDrawerShell force `z-index: 2200` sur le panneau et 2199 sur le
   scrim), `useStack` calcule ~2000/2010 pour cet overlay et le menu s'ouvre
   DERRIÈRE le tiroir — le clic passe, rien ne s'affiche. Symptôme et
   correctif identiques à BUG-241 (CsvImportDrawer) et au drawer alias
   (9af25a9) : classe posée sur le `.v-overlay` externe + z-index !important,
   insensible à la pile. Le prop `z-index` ne suffit pas : `useStack` ne
   l'honore que si la pile globale d'overlays est vide. */
.epra-menu-overlay {
  z-index: 2300 !important;
}
</style>

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
.epra-item--history {
  color: var(--fb-success, #0e7a5f);
  font-weight: 600;
}
</style>
