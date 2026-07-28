# BUG-131 — `EventCategoryDialog.vue` : `hasHomeTeam` absent du cache Vuex optimiste et de l'emit

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/dialogs/EventCategoryDialog.vue:137-151`

## Symptôme

Contrairement à BUG-130, l'appel API de ce dialog inclut bien `hasHomeTeam` (`:140`) — le backend
persiste correctement la valeur. Mais la mise à jour optimiste du cache Vuex
(`dispatch('eventCategories/addEventCategory', {...})`) et l'`$emit('created', {...})` qui suivent
ne retransmettent que `{ id, name, eventTypeId }`, sans `hasHomeTeam`.

## Cause racine

Oubli du champ dans l'objet reconstruit après la réponse API, alors qu'il est disponible en local
(`this.hasHomeTeam`).

## Correction

`hasHomeTeam: this.hasHomeTeam` ajouté à l'objet `createdCategory` partagé entre le `dispatch` et
l'`$emit`.

## Risque de régression / à surveiller

Scénario de test : créer une catégorie sportive inline depuis `EventFormDrawer.vue` (coche "Has
home team" cochée dans le flux si présente) → la liste `/event-categories` doit afficher "Oui"
immédiatement, sans attendre l'expiration du TTL (15 min) ou un refresh forcé.

## Références

- [[130_eventcategorielist_hashometeam_jamais_envoye]]
