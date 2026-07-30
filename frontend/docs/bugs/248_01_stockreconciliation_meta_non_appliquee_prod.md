# BUG-248-01 — `StockReconciliation.meta` jamais créée en production : 500 sur toute la section Réconciliation

- **Statut** : 🔴 Ouvert (défaut de déploiement — aucun code à corriger)
- **Sévérité** : 🔴 Bloquant — la section Réconciliation est morte sur les deux écrans d'inventaire
- **Domaine** : Stock & Inventaire
- **Repo(s) concerné(s)** : backend (base de production uniquement — le code est correct)
- **Découvert le** : 2026-07-30
- **Fichiers** : `backend/prisma/schema.prisma:2795`, `backend/prisma/sql/2026-07-24_stockreconciliation_meta.sql`,
  `render.yaml:7` et `:41`, `backend/.gitignore:47-48`,
  `backend/src/features/inventory/inventory.service.ts:302`

## Symptôme

Ouvrir Pre-event ou Post-event Inventory déclenche, à chaque navigation :

```
GET /api/v1/inventory/:spaceId/reconciliations → 500
{ statusCode: 500,
  message: "Invalid `prisma.stockReconciliation.findMany()` … The column
            `StockReconciliation.meta` does not exist in the current database." }
```

La section Réconciliation reste vide. L'erreur n'est **pas visible dans l'interface** : le front
l'avale en `console.warn` (`SpaceInventoryView.vue`, `loadReconciliations`), la liste garde
simplement sa valeur précédente. Seule la console la révèle.

## Cause racine

Le schéma déclare la colonne (`schema.prisma:2795`, `meta Json?`), la migration SQL existe et est
idempotente (`prisma/sql/2026-07-24_stockreconciliation_meta.sql`, `ADD COLUMN IF NOT EXISTS`) —
**elle n'a jamais été exécutée sur la base de production**.

Le client Prisma déployé, lui, est généré depuis ce schéma : il sélectionne donc `meta`
implicitement (`inventory.service.ts:302` n'a volontairement pas de `select`), la requête part avec
la colonne, et Postgres la rejette.

Pourquoi personne ne l'a vu passer : `render.yaml:7` et `:41` lancent
`npx prisma migrate deploy` à chaque déploiement, mais `prisma/migrations/*` est gitignoré
(`backend/.gitignore:47-48`, le dossier ne contient qu'un `.gitkeep`). La commande ne trouve rien à
appliquer et réussit — **no-op silencieux**, exactement le mode de panne décrit par
[ADR-0002](../../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md).

Le déploiement conjoint requis était déjà signalé dans ce même index (avertissement du 2026-07-24,
fiches 238/241) — il n'a pas été exécuté.

## Rayon de souffle

Six requêtes touchent `meta` implicitement, pas seulement l'endpoint signalé :

| Emplacement | Chemin utilisateur |
|---|---|
| `inventory.service.ts:302` | `GET /inventory/:spaceId/reconciliations` — **le 500 signalé** |
| `inventory.service.ts:265-289` | `POST /inventory/:spaceId/reconciliations` (create avec `meta`) |
| `inventory.service.ts:902-920` | `POST …/pre-event-reconciliations` (create avec `meta`) |
| `inventory.service.ts:325` | `DELETE` — Prisma retourne la ligne supprimée, `meta` est dans le RETURNING |
| `logistics.service.ts:1611-1620` | Reset logistique (crée une réconciliation) |
| `logistics.service.ts:1741` | `GET /logistics/reconciliations/:id` et `/export` |

Sûres parce qu'elles portent un `select` explicite : `inventory.service.ts:320-323`,
`logistics.service.ts:927-935` et `:1722-1729`.

## Correction

Aucune ligne de code. Appliquer le SQL sur la base de production — un DDL passe par la connexion
**directe**, pas par le pooler :

```bash
psql "$DIRECT_URL" -f backend/prisma/sql/2026-07-24_stockreconciliation_meta.sql
```

Variante Render Shell : `prisma db execute` résout `DATABASE_URL` (le pooler), il faut donc forcer
l'URL directe.

```bash
npx prisma db execute --file prisma/sql/2026-07-24_stockreconciliation_meta.sql --url "$DIRECT_URL"
```

Vérification :

```bash
psql "$DIRECT_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='StockReconciliation' AND column_name='meta';"
```

→ une ligne, `jsonb`.

**`prisma generate` n'est PAS une étape sur Render** — contrairement à ce qu'indique
`modules/10_POST_EVENT_INVENTORY.md` §13.4. Render construit depuis le dépôt, dont le schéma déclare
déjà `meta` : le client déployé sélectionne la colonne, c'est précisément la cause du 500. La
regénération n'est nécessaire qu'en local, quand `node_modules/.prisma` date d'avant la colonne
(constaté le 2026-07-30 : le client local ignorait aussi `Event.isSimulated`, ce qui empêchait la
suite de tests backend de compiler).

Redémarrage du service : facultatif. La requête n'a jamais été préparée avec succès, il n'y a pas de
plan à purger — à ne faire que si la première requête post-migration échoue encore.

## Risque de régression / à surveiller

- Le même piège se reproduira à la **prochaine** colonne ajoutée : `migrate deploy` restera un
  no-op tant que `prisma/migrations/*` est gitignoré. Tout fichier `prisma/sql/*.sql` doit être joué
  à la main, et rien dans le dépôt ne trace ce qui a été appliqué à quelle base.
- §13.4 du module 10 prédisait un `undefined` silencieux si la colonne manquait. La réalité est un
  **P2022, donc un 500 dur** — corrigé dans ce même document (§13.5).
- Après application : vérifier que la section Réconciliation se peuple sur les DEUX écrans et que
  les bandeaux de provenance (`meta.baseline.source`, `meta.salesSource`) apparaissent sur les
  documents récents.

## Références

- [ADR-0002 — migrations manuelles, jamais par la plateforme](../../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md)
- [modules/10_POST_EVENT_INVENTORY.md](../modules/10_POST_EVENT_INVENTORY.md) §13.4 et §13.5
- Avertissement de déploiement conjoint : `00_INDEX.md` (bloc du 2026-07-24, fiches 238/241)
- [BUG-228](228_inventory_snapshot_kind_rejete_backend_perime.md) — même famille : schéma en avance
  sur le déploiement

---

JLH
