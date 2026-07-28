# BUG-145 — Deux implémentations divergentes de "créer une catégorie"

- **Statut** : 🟢 Corrigé
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

**Décision (2026-07-18)** : option 1 — `EventCategoryDialog.vue` devient la seule source de
vérité, étendue avec 2 capacités additives (défaut `false`, donc rétrocompatibles avec les
appelants existants qui ne les activent pas) :
- prop `category` (objet|null) : quand fourni, le dialog s'ouvre en mode édition (pré-rempli,
  appelle `updateEventCategory` + dispatch `eventCategories/updateEventCategory` au lieu de
  `create*`), émet `updated` au lieu de `created` ;
- prop `allowCreateType` (boolean) : ajoute l'option "Créer un nouveau type" dans le select, avec
  un `EventTypeDialog` auto-porté (embarqué dans `EventCategoryDialog.vue` lui-même) — remplace la
  copie dupliquée qui vivait dans `EventsCategorieListView.vue`.

`EventsCategorieListView.vue` : le `<v-navigation-drawer>` inline de ~80 lignes (markup + CSS)
supprimé, remplacé par `<EventCategoryDialog v-model="categoryDialog" :event-types="eventTypes"
:category="editingCategory" allow-create-type @created="..." @updated="..." />`. Les méthodes
`normalizeId`/`submitCategory`/`handleEventTypeChange`/`handleCreateTypeClick`/`handleTypeCreated`
et les données `categoryFormData`/`categoryDialogMode`/`categoryLoading`/`categoryError`/`rules`
supprimées (logique désormais entièrement dans le dialog partagé) ; ~90 lignes de CSS dupliquée
(`.ecl-drawer-*`, `.ecl-select-*`, `.ecl-checkbox*`, `.ecl-fbtn*`) supprimées.

Les 2 autres appelants (`EventFormDrawer.vue`, `EventsSubcategorieListView.vue`) ne passent ni
`category` ni `allow-create-type` — comportement strictement inchangé pour eux.

## Risque de régression / à surveiller

- Vérifié : `/event-categories` garde sa capacité d'édition (bouton crayon → `openEditDialog` →
  dialog pré-rempli) et sa création de type à la volée.
- Vérifié : les 3 appelants du dialog syntaxiquement corrects (`node --check` sur chaque `<script>`
  extrait), balance des tags `<div>`/`<template>` vérifiée.
- Suite de tests Événements (99 tests) toujours verte.
- À tester manuellement : édition d'une catégorie existante (le `eventTypeId` doit se pré-remplir
  correctement, y compris si l'API renvoie un objet `eventType` peuplé plutôt qu'un id brut —
  normalisation défensive conservée dans le watcher du dialog).

## Références

- [[130_eventcategorielist_hashometeam_jamais_envoye]]
- [[131_eventcategorydialog_hashometeam_absent_cache_emit]]
