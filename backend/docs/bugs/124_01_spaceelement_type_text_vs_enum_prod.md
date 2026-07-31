# BUG-124-01 — `SpaceElement.type` en `text` en prod : 500 sur event-timeline, transaction-baskets et live-status

- **Statut** : 🟡 Corrigé non déployé (SQL écrit, à appliquer sur la base prod)
- **Sévérité** : 🔴 Bloquant/impact business (page /analyse sans timeline ni paniers, live-status KO pour tous les espaces)
- **Domaine** : Espaces & builder / Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (backend) — fix côté base de données uniquement
- **Découvert le** : 2026-07-31
- **Fichiers** : `backend/src/features/spaces/spaces.service.ts:1092` (`resolveShopIdsForSpace`, code correct — non modifié), `backend/prisma/schema.prisma:846`, `backend/prisma/sql/2026-07-31_spaceelement_type_text_vers_enum.sql`

## Symptôme

Sur la prod (`datafriday-api.onrender.com`, base Supabase `datafriday-dev` / `alsgdtewqeldrrquypdy`),
trois endpoints renvoient 500 pour **tous** les espaces (constaté depuis /analyse et depuis la liste
des espaces) :

- `GET /spaces/:id/event-timeline` (batch et unitaire)
- `GET /spaces/:id/transaction-baskets`
- `GET /spaces/:id/live-status`

Message renvoyé au client :
`Invalid prisma.spaceElement.findMany() invocation … You might need to add explicit type casts.`

## Cause racine

Dérive DDL entre la base prod et le schéma Prisma, invisible depuis le repo (ADR 0002 : migrations
100 % manuelles, `prisma migrate deploy` est un no-op, rien ne trace ce qui a été appliqué — même
mode de panne que BUG-248 côté frontend).

Introspection de la base prod (2026-07-31, lecture seule) :

- Le type enum `"ElementType"` **existe** avec les 19 valeurs attendues (dont `merchshop` et
  `fnb_icecream`).
- Mais la colonne `"SpaceElement"."type"` est restée en **`text`** — l'enum a été créé hors-bande
  sans jamais convertir la colonne.

Le schéma Prisma (`backend/prisma/schema.prisma:846`) déclare `type ElementType` : le client Prisma
type donc ses paramètres en `"ElementType"[]`, et Postgres refuse la comparaison
`text = "ElementType"` (« operator does not exist … add explicit type casts »).

Chemin commun aux trois endpoints : `resolveShopIdsForSpace`
(`backend/src/features/spaces/spaces.service.ts:1092`) — trois `spaceElement.findMany` filtrant
`type: { in: EVENT_TIMELINE_SHOP_TYPES }`. Le cache Redis `spaces:shopids:*` (TTL 30 s) ne met pas
en cache les erreurs, donc chaque requête re-frappe la base.

Balayage de **tous** les autres champs enum du schéma (Tenant.plan/status, User·UserTenant·
UserSpaceAccess.role, Permission.scope, Role.systemKey, Zone.kind, StockMovement.reason,
MenuItem·MenuComponent.kitchenType, MenuItem.diet, Ingredient.ingredientCategory) : tous corrects
en prod. **Seule** `SpaceElement.type` a dérivé.

## Correction

Aucun changement de code. Une migration manuelle :
`backend/prisma/sql/2026-07-31_spaceelement_type_text_vers_enum.sql`

```sql
ALTER TABLE "SpaceElement"
  ALTER COLUMN "type" TYPE "ElementType" USING "type"::"ElementType";
```

précédée d'un garde-fou `DO $$ … RAISE EXCEPTION` si une valeur hors enum apparaissait entre-temps.

Pré-vérifications faites sur la base prod : 804 lignes, 0 valeur non castable, pas de `DEFAULT`,
colonne `NOT NULL`, aucun index sur `type`, RPC `get_space_shop_details` compatible (littéraux
chaîne + `::text`). L'ALTER est instantané. Aucun redéploiement Render nécessaire : le code déployé
est correct, seule la base dérivait.

## Risque de régression / à surveiller

- Après application : `information_schema.columns` doit donner `udt_name = 'ElementType'` pour
  `SpaceElement.type`, et `SELECT type, COUNT(*) FROM "SpaceElement" GROUP BY 1` doit être inchangé.
- Recharger `/spaces/:id?config=…` : `event-timeline`, `transaction-baskets` et `live-status`
  doivent répondre 200.
- Risque systémique inchangé tant que l'ADR 0002 n'a pas de registre d'application : toute DDL
  appliquée sur une base et pas l'autre reproduira ce type de panne. À l'introspection, les tables
  `SalesLocation`, `SalesProduct`, `SalesTransaction`, `IntegrationWebhookEvent`, `Integration`
  n'ont renvoyé aucune colonne `provider` (probablement absentes de la prod) — aucun endpoint en
  erreur aujourd'hui, mais même famille de risque.

## Références

- `backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md` — pourquoi la dérive est
  invisible depuis le repo.
- `frontend/docs/bugs/248_01_stockreconciliation_meta_non_appliquee_prod.md` — précédent du même
  mode de panne (schéma déclaré, SQL jamais appliqué en prod).
- `backend/docs/bugs/103_event_timeline_articles_vides_jointure_mapping.md` — rôle du filtre zones
  dans `resolveShopIdsForSpace`.

JLH
