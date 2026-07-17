# BUG-70 — `Team` : vérification de doublon TOCTOU, aucune contrainte `@@unique` en base

- **Statut** : ⚪ Diagnostiqué
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.service.ts:453-476` (createTeam) ;
  `prisma/schema.prisma:2151-2168` (model Team)

## Symptôme

`createTeam` fait un `findFirst` (nom insensible à la casse + scope catégorie/sous-catégorie) avant
`create()` pour retourner un 409 en cas de doublon. Mais `Team` — contrairement à `EventType`/
`EventCategory`/`EventSubcategory`, qui ont chacun un `@@unique([tenantId, ...])` — n'a **aucune**
contrainte d'unicité en base. Deux `POST /teams` concurrents avec le même nom+scope peuvent tous les
deux passer la vérification applicative avant que l'un des deux ne commit, créant deux lignes
dupliquées malgré le 409 promis par l'API.

## Cause racine

Absence de contrainte `@@unique` sur `Team` alors que le pattern existe pour toutes les tables de
taxonomie voisines dans le même schéma.

## Correction

Aucune à ce jour. Ajouter une contrainte `@@unique([tenantId, eventCategoryId, eventSubcategoryId,
name])` nécessite de trancher la sémantique de casse (le check applicatif est actuellement
insensible à la casse — `mode: 'insensitive'` — qu'une contrainte DB PostgreSQL standard ne
reproduit pas nativement) et implique une migration Prisma manuelle
([ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)) sur une table dont l'usage réel
(fenêtre de concurrence) n'a pas été mesuré. Décision à prendre avant d'implémenter.

## Risque de régression / à surveiller

Si la contrainte est ajoutée plus tard : vérifier qu'aucun doublon existant en base ne bloque la
migration (dédupliquer au préalable si besoin).

## Références

- `docs/modules/07_EVENEMENTS.md`
