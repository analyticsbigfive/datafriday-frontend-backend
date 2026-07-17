# BUG-068 — Bouton "Synchroniser les catégories" 100% factice dans MenuItemView.vue

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue:859-866`

## Symptôme

Cliquer sur le bouton "Synchroniser catégories" de l'écran `/menu-items` affiche un spinner puis
se termine "avec succès" — sans avoir rien synchronisé.

## Cause racine

```js
async onSyncCategories() {
  this.syncing = true;
  try {
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    this.syncing = false;
  }
},
```

Aucun appel API. Aucune route `sync-categories` (ni équivalent) n'existe côté backend ni ailleurs
dans le front — seules les clés i18n (`menuItemLibSyncCategories`) existent. Le bouton donne une
fausse impression de succès à l'utilisateur.

## Correction

Bouton retiré de la barre d'actions (aucune fonctionnalité de synchronisation de catégories
n'existe réellement à synchroniser — les catégories sont gérées via les dialogs de création à la
volée et le référentiel `/product-categories`). Si un vrai besoin de synchronisation apparaît
plus tard (ex. resynchroniser les catégories utilisées par les articles avec le référentiel), il
faudra d'abord définir la route backend correspondante.

## Risque de régression / à surveiller

Aucun — le bouton ne faisait rien de réel, son retrait ne change aucun comportement fonctionnel.

## Références

- Aucune.
