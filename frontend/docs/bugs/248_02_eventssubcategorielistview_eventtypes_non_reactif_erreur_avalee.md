# BUG-248-02 — `EventsSubcategorieListView.vue` : `eventTypes` non réactif (copie figée) + échec de fetch avalé silencieusement

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, signalé par l'utilisateur (dialog "Create Event Category" : la
  liste déroulante "Event Type" apparaissait vide malgré l'existence d'un type d'événement en base,
  confirmé par requête directe)
- **Fichiers** : `src/components/events/views/EventsSubcategorieListView.vue`,
  `src/components/events/views/EventsCategorieListView.vue`

## Symptôme

Le dialog partagé `EventCategoryDialog.vue` (utilisé en création de catégorie inline depuis l'écran
`/events/event-subcategories`) reçoit sa liste de types via la prop `event-types`. Dans
`EventsSubcategorieListView.vue`, contrairement à `categories` (juste à côté, un computed réactif
sur le store), `eventTypes` était une simple variable `data()` (`eventTypes: []`), remplie **une
seule fois** au montage par `loadEventTypes()` via une copie manuelle du contenu du store à cet
instant précis. Deux conséquences :

1. **Non réactif** : si le store `eventTypes` (namespaced Vuex, TTL 15 min) se remplissait ou se
   mettait à jour *après* ce chargement initial (cache partagé avec d'autres écrans du domaine), la
   copie locale de cette vue ne s'en apercevait jamais — figée jusqu'au prochain montage du
   composant.
2. **Erreur avalée silencieusement** : si le `dispatch('eventTypes/fetchEventTypes')` initial
   échouait pour une raison quelconque (latence, cold start backend, blip réseau), le `catch`
   réinitialisait `this.eventTypes` à `[]` **sans jamais l'indiquer à l'utilisateur** — le select
   affichait alors une liste vide, en apparence normale, sans aucun indice qu'un chargement avait
   échoué.

`EventsCategorieListView.vue` avait un `eventTypes` déjà réactif (computed), mais son
`loadEventTypes()` souffrait du même second défaut : `catch (e) { /* silent — store handles
fallback */ }`.

## Cause racine

Divergence entre les deux vues taxonomie sœurs : `EventsCategorieListView.vue` a reçu le pattern
réactif (computed) pour `eventTypes`, `EventsSubcategorieListView.vue` a gardé une implémentation
antérieure en simple copie one-shot — jamais alignées l'une sur l'autre. Le silence sur erreur dans
les deux vues semble avoir été un choix délibéré à l'origine ("store handles fallback"), mais ne
tient pas compte du cas où le store lui-même reste vide suite à l'échec.

## Correction

- `EventsSubcategorieListView.vue` : `eventTypes` converti en `computed` réactif sur
  `eventTypes/eventTypes` (même forme que `categories`), suppression de la variable `data()`
  correspondante et de la copie manuelle dans `loadEventTypes()`.
- Les deux vues (`EventsCategorieListView.vue` et `EventsSubcategorieListView.vue`) : le `catch` de
  `loadEventTypes()` affecte maintenant `this.error` (déjà utilisé par ces écrans pour les erreurs
  de chargement des catégories/sous-catégories) au lieu d'avaler l'exception silencieusement.

## Risque de régression / à surveiller

- `eventTypes` computed introduit dans `EventsSubcategorieListView.vue` suit exactement le même
  schéma que `categories` du même fichier (map + filter sur id) — pas de nouveau comportement,
  juste une source réactive au lieu d'une copie figée.
- Partager `this.error` entre chargement des types et des catégories/sous-catégories signifie que
  si les deux échouent en même temps, seul le dernier message reste affiché — acceptable (même
  compromis déjà fait pour `error` sur ces écrans).
- `@vue/compiler-sfc` + `@babel/core` propres sur les 2 fichiers, suite `pnpm test:unit` ciblée
  (`events.unit.spec.js`, `events.integration.spec.js`, 94 tests) verte.
- Non exécuté en navigateur — à confirmer que la liste "Event Type" du dialog se peuple bien après
  un rechargement de page sur `/events/event-subcategories` et `/events/event-categories`.

## Références

- [[145_eventcategorielist_duplication_creation_categorie]]
- [[247_02_eventcategorydialog_prop_isdark_extraneous_ignoree]]
