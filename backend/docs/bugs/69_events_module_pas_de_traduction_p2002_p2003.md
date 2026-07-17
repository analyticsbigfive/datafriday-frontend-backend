# BUG-69 — Module Events : aucune traduction des erreurs Prisma P2002/P2003 (500 générique)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.service.ts` — `createEventType`/`updateEventType`
  (:201-210), `createEventCategory`/`updateEventCategory` (:227-273), `createEventSubcategory`/
  `updateEventSubcategory` (:289-388), `create`/`update` Event (:98-184)

## Symptôme

`EventType`/`EventCategory`/`EventSubcategory` portent tous une contrainte `@@unique([tenantId,
...])` en base, mais aucune des méthodes CRUD correspondantes ne catche `P2002` (violation
d'unicité) pour la traduire en 400/409 — un nom en doublon (ou une collision au renommage) remonte
en `PrismaClientKnownRequestError` brute, non catchée, jusqu'au filtre global
(`AllExceptionsFilter`), qui répond 500 avec le message Prisma interne exposé tel quel. Même
lacune pour `P2003` (FK invalide) sur `Event.create()`/`update()` (id de taxonomie inexistant/typo).

## Cause racine

Pattern déjà établi et utilisé ailleurs dans le backend pour exactement ce cas
(`menu-items.service.ts:381-391,1571-1574`, entre autres) : catcher `P2002`/`P2003` et lever un
`BadRequestException`/`ConflictException` avec un message clair. Le module Events ne l'a jamais
appliqué.

## Correction

Ajout de `try/catch` sur les méthodes de création/mise à jour concernées, traduisant :
- `P2002` → `ConflictException` (« Un {type/catégorie/sous-catégorie/événement} avec ce nom existe
  déjà dans ce scope »).
- `P2003` → `BadRequestException` (« Référence invalide : {champ} »).

## Risque de régression / à surveiller

Vérifier qu'un nom dupliqué renvoie désormais 409 (pas 500) sur chacun des 3 niveaux de taxonomie,
et qu'un `eventTypeId`/`eventCategoryId`/`eventSubcategoryId` invalide sur `POST/PATCH /events`
renvoie 400. Comme BUG-67 ajoute déjà une vérification applicative en amont pour ces mêmes FK, le
`P2003` sur `Event` ne devrait plus se produire en pratique pour ce cas précis — le catch reste un
filet de sécurité pour les autres causes de FK invalide.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (pattern de référence `menu-items.service.ts`)
- [[67_event_taxonomy_fk_sans_ownership]]
