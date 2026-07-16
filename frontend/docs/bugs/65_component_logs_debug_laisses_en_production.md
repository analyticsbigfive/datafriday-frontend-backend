# BUG-065 — Logs de debug laissés en production dans ComponentCreateView.vue/componentListView.vue

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`,
  `src/components/menu-fb/views/component-library/views/componentListView.vue`

## Symptôme

Plusieurs `console.log` de debug étaient laissés dans le code livré, dont un dans une **computed
property** (`subItemsTableItems` de `ComponentCreateView.vue`), donc exécuté à chaque re-render de la
page — pas seulement au chargement. D'autres dumpaient le payload complet envoyé au backend à chaque
sauvegarde (`onCreate`/`onUpdate`), visible en clair dans la console du navigateur. Un log en double
faisait doublon avec un `console.error` juste en dessous pour la même erreur
(`componentListView.vue`, message "Nous avons une erreur:").

## Cause racine

Logs de développement jamais retirés avant livraison.

## Correction

Retrait de tous les `console.log` identifiés :
- `ComponentCreateView.vue` : dans le computed `subItemsTableItems` (2 logs), dans
  `loadComponentData` (1 log), dans `onUpdate`/`onCreate` (2 logs du payload complet).
- `componentListView.vue` : dans `onExportCsv` (1 log), dans `loadSubItemsData` (2 logs, dont un
  doublon d'un `console.error` existant).

Les `console.error` dans les blocs `catch` (logging légitime d'erreurs réellement survenues) ont été
conservés.

## Risque de régression / à surveiller

Aucun — retrait de logs sans effet fonctionnel.

## Références

- [[59_component_marketprice_null_safety_incomplete]] — un des logs retirés masquait la vraie nature
  de cette erreur.
