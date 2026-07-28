# BUG-70 — `Team` : vérification de doublon TOCTOU, aucune contrainte `@@unique` en base

- **Statut** : 🟢 Corrigé
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

**Décision (2026-07-18)** : ajouter la contrainte `@@unique([tenantId, eventCategoryId,
eventSubcategoryId, name])` en l'acceptant comme backstop **partiel** (sensible à la casse, ne
couvre pas le cas des deux équipes "génériques" à scope null — voir limites documentées dans le
commentaire du modèle et dans le fichier de migration) plutôt que de chercher une reproduction
exacte de la sémantique applicative (aurait demandé une contrainte fonctionnelle `citext`/`lower()`
plus complexe, non justifiée vu le volume réel de la table).

Fait :
- `schema.prisma` : `@@unique([tenantId, eventCategoryId, eventSubcategoryId, name])` ajouté sur
  `Team`, avec commentaire documentant les 2 limites connues.
- Vérification en base (lecture seule, 2026-07-18) : 11 lignes `Team` au total, **aucun doublon
  existant** (comparaison insensible à la casse, même scope) — la migration peut s'appliquer sans
  dédoublonnage préalable.
- Migration écrite à la main (`prisma migrate dev` échoue sur cette base : `P3006`, la base
  shadow ne peut pas rejouer proprement l'historique de migrations à cause d'une migration plus
  ancienne référençant un modèle `ExternalMerch` qui n'existe pas — problème pré-existant, sans
  lien avec ce changement) : `prisma/migrations/20260718120000_team_unique_constraint/migration.sql`.
- `prisma generate` exécuté (régénère le client localement, aucune écriture en base) — `tsc --noEmit`
  propre.

**Déployée le 2026-07-18** (`prisma migrate deploy`, sur autorisation explicite de l'utilisateur,
conformément à [ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)), contre la base
pointée par `backend/.env`. Re-vérifié juste avant déploiement : toujours 11 lignes `Team`, aucun
doublon. Vérifié après coup en base (`pg_constraint`) :
`Team_tenantId_eventCategoryId_eventSubcategoryId_name_key` — `UNIQUE ("tenantId",
"eventCategoryId", "eventSubcategoryId", name)` — bien présente sur la table réelle.

## Risque de régression / à surveiller

- Un `POST /teams` créant un doublon exact (même tenant/catégorie/sous-catégorie/nom, casse
  identique) échoue désormais aussi au niveau DB (backstop derrière le check applicatif) —
  `createTeam` doit continuer à retourner un 409 propre via son `findFirst` existant dans le cas
  normal ; si jamais les deux passent la fenêtre de course, l'erreur remontera comme une violation
  de contrainte Prisma (P2002) au lieu d'un doublon silencieux — à surveiller si un tel cas
  apparaît en usage réel (pas de traduction P2002 dédiée ajoutée pour ce chemin précis).
- Rappel des limites connues (documentées dans le schéma et la migration) : ne bloque pas un
  doublon de casse différente, ni deux équipes "génériques" (scopes null) de même nom.

## Références

- `docs/modules/07_EVENEMENTS.md`
