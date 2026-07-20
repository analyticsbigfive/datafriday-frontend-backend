# BUG-77 — `createEventCategory` rejette les `eventTypeId` globaux (régression du fix BUG-66)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/events/events.service.ts:321-326`

## Symptôme

`POST /event-categories` avec un `eventTypeId` pointant vers un `EventType` **global**
(`tenantId=null`, référentiel partagé) échoue avec un 404 générique ("Event type {id} not found"),
alors que ce même `eventTypeId` :
- est bien renvoyé par `GET /event-types` (donc proposé et sélectionnable dans le `<v-select>` de
  `EventCategoryDialog.vue`) ;
- est accepté sans problème par `PATCH /event-categories/:id` (édition) pour la même catégorie.

Un utilisateur qui crée une nouvelle catégorie sous un type global échoue systématiquement ; s'il
crée d'abord sous un type privé puis édite pour repointer vers un type global, ça fonctionne — même
donnée, deux comportements.

## Cause racine

`createEventCategory` (events.service.ts:322) validait `data.eventTypeId` via
`findOwnedEventTypeOrThrow(id, tenantId)`, qui filtre strictement `where: { id, tenantId }` — donc
ne matche jamais une ligne `tenantId=null`. C'est le fix de
[BUG-66](66_createeventcategory_eventtypeid_sans_ownership.md) (ajout d'une vérification d'ownership
manquante) qui a introduit cet appel, mais avec le mauvais helper : le reste du service utilise pour
cette même relation (référence vers une entrée de taxonomie, pas modification de la ligne
elle-même) le pattern "accessible" — `OR: [{tenantId}, {tenantId: null}]`, implémenté par
`findAccessibleEventTypeOrThrow` (:64-72) et déjà utilisé par `Event.create()`/`update()` (:144-146)
et par `updateEventCategory` (:338-344, contrôle équivalent en ligne). La propre section "Risque de
régression" de la fiche BUG-66 demandait explicitement de vérifier ce cas — non vérifié à l'époque,
et effectivement cassé.

## Correction

`createEventCategory` appelle désormais `findAccessibleEventTypeOrThrow(data.eventTypeId, tenantId)`
au lieu de `findOwnedEventTypeOrThrow`, aligné sur `Event.create()`/`update()` et cohérent avec
`updateEventCategory`. `findOwnedEventTypeOrThrow` reste utilisé là où c'est correct : modifier/
supprimer la ligne `EventType` elle-même (`updateEventType`, `deleteEventType`), jamais pour une
simple référence FK.

## Risque de régression / à surveiller

Re-vérifier qu'un tenant ne peut toujours pas créer de catégorie sous un `EventType` **privé** d'un
autre tenant (c'est le scénario que BUG-66 corrigeait à l'origine) — `findAccessibleEventTypeOrThrow`
couvre ce cas (`OR` porte seulement sur `tenantId` courant ou `null`, jamais sur un autre tenant).
Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement en
créant une catégorie sous un type global depuis `/event-categories`.

## Références

- [BUG-66](66_createeventcategory_eventtypeid_sans_ownership.md) — fix à l'origine de la régression.
- Fiche miroir frontend : aucune (bug purement backend, aucun contournement côté client à
  documenter) — voir cependant
  [`datafriday-web/docs/bugs/152_appcopy_arbre_orphelin_duplique_domaine_evenements.md`](../../../datafriday-web/docs/bugs/152_appcopy_arbre_orphelin_duplique_domaine_evenements.md),
  trouvé dans la même session d'audit de `/event-categories`.
