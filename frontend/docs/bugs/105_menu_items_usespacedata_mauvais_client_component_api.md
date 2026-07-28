# BUG-105 — `useSpaceData.js` : import du client `component.api.js` (non paginé) au lieu de la version paginée déjà présente dans le même fichier

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/composables/useSpaceData.js:17,159,198`

## Symptôme

Sur un tenant avec plus de 100 `MenuComponent`, la résolution de recette dans `useSpaceData.js`
(composants utilisés pour `resolveComponentRefs`, hydratation `subComponents`, etc.) tronque
silencieusement au-delà du 100e composant.

## Cause racine

`getMenuComponents` est importé depuis `@/api/endpoints/component.api` (ligne 17) — dont
l'implémentation est `api.get('/menu-components')` **sans** `page`/`limit`, donc plafonnée à la
limite par défaut backend (100, même cause racine que BUG-054, déjà documentée comme non couverte
pour ce fichier précis dans [[64_component_api_client_duplique_non_couvert_par_pagination]]). Or
**le même fichier importe déjà dynamiquement `getMenuComponent` (singulier) depuis `menu.api.js`
ligne 198**, et `menu.api.js` expose `getMenuComponents({page, limit})` — la version déjà
paginable pour BUG-054, utilisée par `menuComponents.js` (store `/components`) avec une boucle de
pagination complète.

## Correction

Import remplacé par `getMenuComponents` depuis `@/api/endpoints/menu.api`, avec la même boucle de
pagination que `menuComponents.js` reprise dans `useSpaceData.js`.

## Risque de régression / à surveiller

Vérifier que la signature de retour de `menu.api.js#getMenuComponents` (paginée, avec `meta.total`)
est bien consommée de la même façon que l'ancienne réponse non paginée de `component.api.js`
partout où `useSpaceData.js` l'utilise (3 points d'usage identifiés : ligne 17 import, ligne 159
appel, ligne 198 usage voisin `getMenuComponent`).

## Références

- [[64_component_api_client_duplique_non_couvert_par_pagination]]
- [[54_menu_components_get_plafond_silencieux_100_lignes_mirror]]
