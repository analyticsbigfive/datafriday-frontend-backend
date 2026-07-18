# BUG-70 — `Team` : vérification de doublon TOCTOU, aucune contrainte `@@unique` en base

- **Statut** : 🟡 Corrigé non déployé
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

**Non fait à ce stade — nécessite une confirmation explicite séparée** : le déploiement réel de la
migration (`prisma migrate deploy` ou exécution manuelle du SQL contre la base ciblée par
`DATABASE_URL`/`DIRECT_URL`, conformément à
[ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)). Tant que ce n'est pas fait, le
client Prisma régénéré localement connaît un type de contrainte que la base réelle n'a pas encore
— écart sans risque tant qu'aucun code n'utilise `findUnique` sur cette clé composite (vérifié :
aucun).

## Risque de régression / à surveiller

- Après déploiement : reconfirmer qu'aucun doublon n'a été créé entre le 2026-07-18 (vérification)
  et le moment du déploiement — sinon la migration échouera à l'application, dédupliquer avant de
  réessayer.
- Ne pas oublier l'étape de déploiement manuel : `prisma/migrations/*` est gitignoré (seul
  `.gitkeep` versionné), donc ce fichier de migration n'existe que localement tant qu'il n'est pas
  appliqué à la base cible.

## Références

- `docs/modules/07_EVENEMENTS.md`
