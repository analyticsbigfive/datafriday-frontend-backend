# BUG-145 — Deux implémentations divergentes de "créer une catégorie"

- **Statut** : ⚪ Diagnostiqué
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `EventsCategorieListView.vue:302-379` (drawer de création inline), vs
  `EventCategoryDialog.vue` (composant partagé, utilisé par `EventFormDrawer.vue` et
  `EventsSubcategorieListView.vue`, mais PAS par l'écran `/event-categories` lui-même)

## Symptôme

L'écran `/event-categories` a son propre drawer de création/édition inline plutôt que de
réutiliser `EventCategoryDialog.vue` (le composant que tous les AUTRES points d'entrée de création
de catégorie utilisent). C'est cette divergence qui a directement causé BUG-130/BUG-131 (le champ
`hasHomeTeam` géré différemment aux deux endroits, avec un oubli à chacun) — deux logiques à
synchroniser manuellement à chaque évolution du formulaire catégorie.

## Cause racine

Non tranché — pas évident si c'est un choix voulu (le drawer inline supporte l'édition, contrairement
à `EventCategoryDialog.vue` qui n'est câblé que pour la création) ou une dérive organique.

## Correction

Aucune à ce jour — décision à prendre :
1. Faire de `EventCategoryDialog.vue` la seule source de vérité pour la création (lui ajouter un
   mode édition), et supprimer la logique dupliquée d'`EventsCategorieListView.vue`.
2. Assumer les deux implémentations et documenter explicitement pourquoi (ex. si le drawer inline a
   des besoins UX que le dialog partagé ne couvre pas).

## Risque de régression / à surveiller

Si fusion : vérifier que l'écran `/event-categories` garde sa capacité d'édition (absente du
dialog partagé actuel) et que les 3 appelants existants du dialog (`EventFormDrawer.vue`,
`EventsSubcategorieListView.vue`, `EventTypeDialog` inline "créer à la volée") continuent de
fonctionner à l'identique.

## Références

- [[130_eventcategorielist_hashometeam_jamais_envoye]]
- [[131_eventcategorydialog_hashometeam_absent_cache_emit]]
