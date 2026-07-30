# BUG-236 — Inventaire : la section Réconciliation était inaccessible sur mobile

> Numérotation : créée « 235 » sur `feat/postEventInventory` le 2026-07-24, renumérotée 236 au
> merge de `develop` (collision : 234 pris par la fiche Live, l'ex-234 orphelines devient 235).

- **Statut** : 🟢 Corrigé (2026-07-24, branche `feat/postEventInventory`)
- **Sévérité** : 🟡 Mineur (feature invisible pour un pan entier des utilisateurs — pas de perte de données)
- **Domaine** : Stock — Pre/Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §7.4)
- **Repo(s) concerné(s)** : frontend
- **Découvert le** : 2026-07-24 (contre-audit externe, vérifié contre le code)
- **Fichiers** : `src/views/SpaceInventoryView.vue` (colonne `v-if="showLeftFilters"`),
  `src/components/InventoryFilterDrawer.vue`, `src/components/InventoryReconciliationSection.vue`

## Symptôme

`InventoryReconciliationSection` (liste des documents de réconciliation) n'était rendue que dans
la colonne gauche desktop, conditionnée par `showLeftFilters = canToggleFilters &&
!filtersCollapsed` — et `canToggleFilters` exige `!isMobile`. Sur mobile, le pendant de la
colonne gauche est `InventoryFilterDrawer`, qui ne contenait aucune section Réconciliation
(grep : 0 occurrence). Un utilisateur mobile ne pouvait donc **jamais** consulter les documents
de réconciliation, alors même que le comptage (et la génération du document) est un flux
typiquement mobile.

Cas secondaire, assumé : sur desktop avec filtres repliés, la section disparaît aussi — mais
reste accessible en dépliant (1 clic), pas de correction.

## Cause racine

La section a été montée uniquement dans la colonne desktop lors de l'implémentation de la
réconciliation post-event (2026-07-20) ; le chemin mobile (drawer) n'a pas été traité.

## Correction (2026-07-24)

`InventoryReconciliationSection` montée en bas de `InventoryFilterDrawer` (miroir exact de la
colonne desktop : sous les filtres). Props pass-through `reconciliations` /
`selectedReconciliationId` / `recoLoading`, événements `select-reconciliation` (ferme le drawer
puis ouvre la vue document) et `delete-reconciliation`. Câblage :
`SpaceInventoryView.onDrawerSelectReconciliation`.

## Risque de régression / à surveiller

- Le drawer est aussi atteignable en desktop étroit : la section apparaît alors aux deux
  endroits — même source de données (`reconciliations`), pas de divergence possible.
- La sélection depuis le drawer doit fermer le drawer AVANT d'afficher la vue document (sinon
  la vue s'ouvre derrière l'overlay).

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §7.4 (UI de la section), §12 (contre-audit).

---

Rédaction : **JLH**, 2026-07-24.
