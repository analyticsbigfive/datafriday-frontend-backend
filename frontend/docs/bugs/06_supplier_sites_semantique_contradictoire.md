# BUG-006 — Supplier.sites vide : sémantique contradictoire

- **Statut** : 🔴 Ouvert (documenté, non corrigé)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-15
- **Fichiers** : `MarketPriceHierarchicalTable.vue:211` (front) vs `space-menus.service.ts:466-472` (backend)

## Symptôme

Un `Supplier` avec `sites` vide est traité différemment selon l'écran : "ne livre aucun espace"
partout, sauf dans `MarketPriceHierarchicalTable.vue` qui l'interprète comme "livre tous les
espaces".

## Cause racine

Le backend est **strict** (`sites` vide = ne livre pas cet espace, commentaire explicite dans
`space-menus.service.ts`). La plupart des fichiers front (`menuItemAvailability.js`,
`SpaceMenusPanel.vue`) sont cohérents avec ce comportement — ils font
`supplier.sites || supplier.spaces || []` sans réinterpréter le vide. Seul
`MarketPriceHierarchicalTable.vue:211` fait `sites.length===0 || sites.includes(...)`, soit
l'inverse.

## Correction

Aucune à ce jour, documenté le 2026-07-15.

## Risque de régression / à surveiller

Choisir la sémantique cible (probablement celle du backend, "vide = personne", la plus sûre) et
aligner `MarketPriceHierarchicalTable.vue` dessus.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"Contradiction active — un composant front interprète `sites` vide à l'envers"
