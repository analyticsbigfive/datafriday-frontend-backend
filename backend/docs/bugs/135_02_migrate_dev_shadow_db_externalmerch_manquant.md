# BUG-135-02 — `prisma migrate dev` casse systématiquement (shadow DB) : `ExternalMerch` jamais créé par l'historique de migrations

- **Statut** : ⚪ Diagnostiqué (root cause connue et déjà contournée au cas par cas — cf. commentaire en tête de `20260803150000_add_simulation_run/migration.sql` — mais jamais réparée à la racine)
- **Sévérité** : 🟠 Majeur (bloque le workflow standard `migrate dev` pour n'importe quel dev/agent sur ce repo, indépendamment de la base ciblée — pas de perte/risque de données)
- **Domaine** : Technique (Prisma / migrations)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-08-24
- **Fichiers** : `backend/prisma/migrations/0_init/migration.sql` (ne crée pas `ExternalMerch`), `backend/prisma/migrations/20260704160000_menu_assignment_config_scope/migration.sql` (référence `ExternalMerch` sans jamais le créer), `backend/prisma/schema.prisma` (`model ExternalMerch`, présent depuis le commit initial `8bf24296`)

## Symptôme

`npx prisma migrate dev --name <n'importe quoi>` échoue avec :

```
Error: P3006
Migration `20260704160000_menu_assignment_config_scope` failed to apply cleanly to the shadow database.
Error code: P1014
Error: The underlying table for model `ExternalMerch` does not exist.
```

Reproduit en essayant d'ajouter la feature LogisticTask/Notification (voir `docs/adr` si une fiche est créée pour cette feature) : la shadow DB rejoue l'historique complet des migrations depuis `0_init`, et casse dès qu'une migration référence `ExternalMerch` (jointure) avant qu'aucune migration n'ait jamais créé cette table.

## Cause racine

`ExternalMerch` est déclaré dans `schema.prisma` depuis le tout premier commit du repo, au même titre que ses tables sœurs `Floor`/`Forecourt`. Mais `0_init/migration.sql` crée bien `Floor` et `Forecourt` (`CREATE TABLE`) — **jamais `ExternalMerch`**. Les premières références trackées à cette table dans l'historique de migrations sont des `JOIN`/usages dans `20260704160000_menu_assignment_config_scope` et `20260704190000_.../migration.sql`, jamais un `CREATE TABLE`.

Cause profonde documentée dans [`backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md`](../adr/0002_migrations_manuelles_jamais_plateforme.md) : jusqu'au 2026-08-02, `prisma/migrations/` était gitignoré — chaque dev avait son propre historique local non partagé. Des tables ont donc été créées directement en base (hors Prisma, ou via une migration locale jamais commitée) sur certains postes, sans que le fichier `migration.sql` correspondant soit jamais versionné. `ExternalMerch` en est un cas concret : la table existe bel et bien sur les environnements réels (elle est utilisée en prod/staging sans problème), mais son `CREATE TABLE` n'a jamais atterri dans l'historique versionné.

## Correction

Pas encore fait. Contournement déjà pratiqué au cas par cas pour de nouvelles migrations : écrire le `migration.sql` à la main et l'appliquer via `prisma migrate deploy` (ou `prisma db execute` + `prisma migrate resolve --applied`, ce que j'ai fait pour `20260824120000_add_logistic_tasks`) plutôt que `prisma migrate dev`, qui exigerait une shadow DB fonctionnelle. Ça fonctionne mais contourne la vérification automatique du diff à chaque migration.

Fix propre suggéré (non fait, à valider avant d'y toucher — touche l'historique de migrations partagé) : insérer une migration rétroactive (timestamp antérieur à `20260704160000`) qui fait le `CREATE TABLE "ExternalMerch"` manquant, pour que la shadow DB puisse à nouveau rejouer tout l'historique depuis `0_init` sans erreur.

## Risque de régression / à surveiller

- Tant que non corrigé, `prisma migrate dev` reste inutilisable tel quel sur ce repo — informer toute personne (ou agent) qui n'est pas encore tombée dessus, pour éviter de perdre du temps à re-diagnostiquer.
- Drift secondaire observé sur la base Supabase de dev utilisée le 2026-08-24 (probablement lié à la même fragmentation d'historiques que ci-dessus, pas re-vérifié sur les autres environnements) : `prisma migrate diff --from-url <DIRECT_URL> --to-schema-datamodel schema.prisma` remonte des `RenameIndex` (`HrSinkingRule_...`, `uniq_kv_store` → `KvStore_tenantId_key_key`, `SalesPriceAgg_...`, `SpaceRevenueMinuteItemAgg_...` ×2) et des `ALTER COLUMN ... DROP DEFAULT`/changements de type timestamp sur `EventPredictVersion`, `HrRole`, `HrSupplier`, `InventoryCount`, `InventorySnapshot`, `KvStore`, `SpaceMenuItem`, sans migration trackée correspondante. À surveiller mais pas urgent — aucun de ces changements ne touche des données, juste des métadonnées de contrainte/nommage. Un `prisma migrate deploy` propre sur cet environnement (une fois le trou `ExternalMerch` bouché) devrait resynchroniser.
- **Ne pas confondre avec** (vu dans le même diff, mais volontaire et déjà documenté ailleurs, PAS un symptôme de ce bug) : `MenuItem.spaceIds`/`spacePrices` et `WeezeventIntegration.clientId`/`clientSecret`/`organizationId` encore présents en base mais absents de `schema.prisma` — gel intentionnel en attendant confirmation qu'aucun outil externe n'en dépend (commentaires au-dessus de `model MenuItem` et `model Integration` dans `schema.prisma`, `ADR-0003`, migration `20260721220000_weezeventintegration_drop_legacy_notnull`).

## Références

- [`backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md`](../adr/0002_migrations_manuelles_jamais_plateforme.md) — cause racine de la fragmentation d'historiques.
- Commentaire en tête de `backend/prisma/migrations/20260803150000_add_simulation_run/migration.sql` — précédent contournement documenté du même P3006/P1014.

---

**Convention** : un fichier par bug, numéroté `NNN_AA_slug-court.md`. Ne pas supprimer une fiche une
fois le bug corrigé — mettre à jour le statut à 🟢 et laisser l'historique.
