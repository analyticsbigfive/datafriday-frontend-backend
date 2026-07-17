# BUG-67 — `Event.create()`/`update()` : aucune vérification d'ownership sur les FK de taxonomie

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.service.ts:98-126` (create), `:156-184` (update)

## Symptôme

`POST /events` et `PATCH /events/:id` acceptent `eventTypeId`/`eventCategoryId`/
`eventSubcategoryId` sans vérifier qu'ils sont accessibles au tenant courant (possédés ou globaux).
Seul `resolveEventTeamFields` valide `visitingTeamId` de la même façon — les trois FK de taxonomie
n'ont aucune vérification équivalente, alors que les helpers existent déjà dans ce même fichier
(`findOwnedEventTypeOrThrow`, `findOwnedEventCategoryOrThrow`, `findOwnedEventSubcategoryOrThrow`).

## Cause racine

Oubli d'appliquer le pattern d'ownership déjà établi (et déjà implémenté sous forme de helpers
réutilisables) aux trois champs de taxonomie de `Event`. Conséquence : un `Event` peut référencer
la taxonomie privée d'un autre tenant ; un id invalide/typo remonte aussi en erreur Prisma brute
(`P2003`, voir BUG-69) plutôt qu'un 400 propre.

Distinct du risque déjà documenté sur `Event.spaceId`/`configurationId` (BUG-34) : ces deux champs
n'ont **aucune** relation Prisma déclarée (choix de modélisation assumé, laissé en risque dormant) ;
`eventTypeId`/`eventCategoryId`/`eventSubcategoryId` ont eux une vraie relation Prisma, seule la
vérification applicative manquait.

## Correction

`create()`/`update()` appellent désormais `findAccessibleEventTypeOrThrow`/
`findAccessibleEventCategoryOrThrow`/`findAccessibleEventSubcategoryOrThrow` — 3 nouveaux helpers
(`OR: [{tenantId}, {tenantId: null}]`), avant l'écriture Prisma.

**Correction en cours de revue** : la première version de ce fix réutilisait par erreur les helpers
`findOwnedEventTypeOrThrow`/`findOwnedEventCategoryOrThrow`/`findOwnedEventSubcategoryOrThrow`
(scope strict `{id, tenantId}`, SANS le `OR tenantId: null`) — corrects pour modifier/supprimer une
ligne de taxonomie elle-même (un tenant ne doit jamais pouvoir toucher une entrée globale), mais
trop stricts pour valider une simple RÉFÉRENCE : ils auraient fait échouer en 404 la création/
édition de tout `Event` pointant vers une taxonomie **globale** (`tenantId=null`, le "socle partagé
entre tous les tenants" documenté dans `07_EVENEMENTS.md` — que `getEventTypes()`/
`getEventCategories()`/`getEventSubcategories()` renvoient explicitement dans les listes proposées
à l'UI). Repéré et corrigé avant merge, avec deux tests de régression dédiés
(`events.service.spec.ts` : accepte une référence globale, rejette une référence d'un autre tenant).

## Risque de régression / à surveiller

Vérifier la création/édition d'un event avec une taxonomie globale (`tenantId=null`) — toujours
acceptée (couvert par test). Vérifier aussi qu'un `eventTypeId`/`eventCategoryId`/
`eventSubcategoryId` omis (`undefined`) ne déclenche aucune vérification (comportement `PATCH`
partiel préservé).

## Références

- `docs/modules/07_EVENEMENTS.md` (Piège n°3, pour le cas voisin non traité `spaceId`/`configurationId`)
- [[69_events_module_pas_de_traduction_p2002_p2003]]
