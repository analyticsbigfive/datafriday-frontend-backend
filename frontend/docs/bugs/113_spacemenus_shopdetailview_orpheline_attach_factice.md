# BUG-113 — ShopDetailView.vue : écran orphelin dont l'action "Attacher" est un stub non fonctionnel

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/ShopDetailView.vue:382-409`,
  `src/router/index.js:251-256`

## Symptôme

Sur `/space-menus/:spaceId/shops/:shopId`, sélectionner des articles puis cliquer « Attacher (N) »
déplace visuellement les items vers la section « Items attachés au shop » et logge « Items attached
successfully » en console — **mais aucun appel réseau n'est fait**. Un rechargement de la page ou
une navigation ailleurs perd intégralement le changement, sans aucun avertissement à l'utilisateur.

De plus, cette route n'est atteignable par **aucune navigation en application** : recherche
exhaustive de `router.push`/`router-link` vers `name: 'shop-detail'` ou le path
`/space-menus/:spaceId/shops/:shopId` — zéro résultat. Le flux réel de sélection de shop
(`SpaceMenuView.vue:625-629`, `selectShop()`) ouvre `ShopMenuItemsDrawer` (un tiroir, pas cette
route). Le seul moyen d'atteindre cet écran cassé est de taper l'URL directement (favori, lien
partagé, historique navigateur).

## Cause racine

`attachSelectedItems()` (`ShopDetailView.vue:382-409`) contient un stub jamais terminé :

```js
async attachSelectedItems() {
  ...
  // TODO: Appeler l'API pour attacher les items au shop
  // await attachMenuItemsToShop(this.shopId, this.selectedItems);
  // Pour l'instant, déplacer les items sélectionnés vers menuItems
  this.menuItems = [...this.menuItems, ...itemsToAttach];
  ...
}
```

Cet écran est une implémentation antérieure de la fonctionnalité "attacher des menu items à un
shop", jamais terminée ni branchée au backend, et vraisemblablement abandonnée au profit du flux
`ShopMenuItemsDrawer.vue` (tiroir, correctement implémenté — cf. BUG-114 pour le détail des
divergences). Le routing n'a jamais été nettoyé après cet abandon : la route et le composant sont
restés en place, atteignables par URL directe, avec permission `menu.fb.spaceMenu` (donc
accessible à tout utilisateur ayant accès à Space Menus).

## Correction

`attachSelectedItems()` appelle désormais réellement `assignMenuItemsToShop(spaceId, configId,
shopId, menuItemsMap)` (le même client `menu.api.js` que `ShopMenuItemsDrawer.vue`), avec gestion
d'erreur visible (message affiché à l'écran, plus de succès silencieux en cas d'échec réseau). La
route reste volontairement en place (elle est protégée par permission et peut avoir des liens
externes existants) mais n'est plus un piège de perte de données silencieuse.

## Risque de régression / à surveiller

- Vérifier manuellement `/space-menus/:spaceId/shops/:shopId?configId=...` : sélectionner des
  items, cliquer Attacher, recharger la page — les items doivent rester attachés.
- Vérifier le cas d'erreur réseau (couper la connexion pendant l'appel) : un message d'erreur
  visible doit apparaître, sans déplacement optimiste des items vers "attachés".

## Références

- [BUG-114](114_spacemenus_shopdetailview_disponibilite_catalogue_divergents.md) — la logique de
  disponibilité/chargement catalogue de cet écran diverge du reste du feature.
- [BUG-115](115_spacemenus_shopdetailview_dette_diverse.md) — dette diverse du même fichier
  (i18n, dark mode, formatage, logs).
