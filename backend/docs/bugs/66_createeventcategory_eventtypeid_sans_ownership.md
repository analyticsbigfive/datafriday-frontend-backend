# BUG-66 — `createEventCategory` : aucune vérification d'ownership sur `eventTypeId`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.service.ts:227-231`

## Symptôme

`POST /event-categories` accepte n'importe quel `eventTypeId` sans vérifier qu'il appartient au
tenant courant (ou qu'il est global `tenantId=null`) — contrairement à `updateEventCategory`
(`events.service.ts:236-259`) et `createEventSubcategory` (`:315-320`), qui valident tous deux
explicitement le parent via `OR: [{tenantId}, {tenantId: null}]`.

## Cause racine

Incohérence : le pattern de validation d'ownership est appliqué partout ailleurs dans ce même
service (`findOwnedEventTypeOrThrow`, `updateEventCategory`, `createEventSubcategory`,
`updateEventSubcategory`, `assertAccessibleTeamScope`) sauf sur `createEventCategory`, un oubli
plutôt qu'un choix. Conséquence pratique : un tenant peut créer une `EventCategory` pointant vers
l'`EventType` privé d'un autre tenant. Comme `EventCategory.eventType` a `onDelete: Cascade`
(`schema.prisma:2120`), la suppression future de cet `EventType` par son tenant propriétaire
supprimerait en cascade la catégorie du tenant intrus (et ses sous-catégories).

## Correction

Ajout d'un appel à `findOwnedEventTypeOrThrow(data.eventTypeId, tenantId)` en tête de
`createEventCategory`, avant `prisma.eventCategory.create`.

## Risque de régression / à surveiller

Vérifier que la création d'une catégorie avec un `eventTypeId` global (`tenantId=null`, référentiel
partagé) fonctionne toujours (cas légitime couvert par le `OR`).

## Références

- `docs/modules/07_EVENEMENTS.md`
