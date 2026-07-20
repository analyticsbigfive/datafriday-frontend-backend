# BUG-103 — `event-timeline` : item-level vide (0 article) alors que le shop-level affiche du CA — INNER JOIN mapping trop strict

- **Statut** : 🟡 Corrigé non déployé (2026-07-18)
- **Sévérité** : 🔴 Bloquant/impact business (écran Analyse inutilisable au grain article)
- **Domaine** : Analyse & agrégation (module `Spaces`, pas `Analyse`)
- **Repo(s) concerné(s)** : les deux (`api-datafriday-staging` cause, `datafriday-web` symptôme + hardening — fiche miroir front 187)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/spaces/spaces.service.ts:1057-1200` (`getEventTimelineBatch`),
  référence de sémantique : `supabase/migrations/20260704200000_shop_details_rpc_builder_v2_zones.sql:154-171`

## Symptôme

Sur `/spaces/:id` (Analyse), le CA total s'affiche (ex. 243 793 €) mais **aucun article** :
donuts « Top 10 sur 0 articles / 0 types / 0 catégories », filtre « Aucun article disponible pour
cette configuration », chaque PdV à « Moy. : 0 / Total : 0 / Événements : 0 ». Le paramètre
`?config=` est innocent (filtrage 100 % client-side ; le message « empty-no-items » prouve même
que la config matche des events porteurs de données shop-level).

## Cause racine

Deux chemins de données indépendants pour le même écran :

- **Shop-level (OK)** : RPC `get_space_shop_details` lit `SpaceRevenueMinuteAgg` avec
  `LEFT JOIN WeezeventLocationShopMapping` + `COALESCE(lsm."spaceElementId", srma."weezeventLocationId")`
  — les ventes de PdV non mappés survivent (bucket gris « Non rattachés » côté front).
- **Item-level (KO)** : `getEventTimelineBatch` lit les transactions brutes
  (`WeezeventTransaction`/`WeezeventTransactionItem`) avec
  `INNER JOIN "WeezeventLocationShopMapping" mem ON mem."weezeventLocationId" = t."locationId"
  AND mem."spaceElementId" = ANY(shopIds)` : **toute vente dont la location n'a pas de mapping
  vers un `SpaceElement` du space est silencieusement supprimée**. Espace sans mappings step-2
  (ou mappings keyés autrement, voir ci-dessous) → 0 ligne pour tous les events, tous les PdV.

**Ambiguïté aggravante découverte au diagnostic** : la colonne
`WeezeventLocationShopMapping."weezeventLocationId"` est jointe sur `t."locationId"` ici et dans
la partie granular de la RPC, mais sur `t."merchantId"` dans
`space-aggregation.service.ts:184-186` (et le commentaire du modèle `schema.prisma:2293` dit
« Maps Weezevent Merchant »). Des lignes legacy keyées merchant ne matchent donc jamais la
jointure par `locationId`. Cf. Piège n°3 de `datafriday-web/docs/modules/02_ANALYSE.md`
(double convention sans discriminant) — décision à trancher (QUESTIONS_A_BERTRAND front).

Le front aggrave le diagnostic : un échec HTTP du batch est avalé et caché comme `[]`
(`useAnalyseItemRecords.js`) — indistinguable d'un « 0 article » légitime (fiche front 187).

## Diagnostic — SQL à coller dans le Supabase SQL editor (read-only)

Requêtes paramétrées **par nom** (cas signalé : espace « Auxerre », tenant « Big Five Org ») —
rien à éditer avant collage ; pour un autre cas, changer les deux motifs `ILIKE` du CTE `params`.
La première étape qui tombe à 0 désigne la cause.

### Q0 — sanity check : la résolution par nom est-elle unique ?

À lancer d'abord. Si plusieurs lignes → remplacer le `params` des requêtes suivantes par les ids
exacts voulus.

```sql
SELECT s.id AS space_id, s.name AS space_name, t.id AS tenant_id, t.name AS tenant_name
FROM "Space" s
JOIN "Tenant" t ON t.id = s."tenantId"
WHERE s.name ILIKE '%auxerre%' AND t.name ILIKE '%big five%';
```

### Q1 — funnel (réplique `getEventTimelineBatch` étape par étape)

```sql
WITH params AS (
  SELECT s.id AS space_id, s."tenantId" AS tenant_id
  FROM "Space" s
  JOIN "Tenant" t ON t.id = s."tenantId"
  WHERE s.name ILIKE '%auxerre%' AND t.name ILIKE '%big five%'
  LIMIT 1
),
shop_ids AS ( -- réplique resolveShopIdsForSpace (spaces.service.ts:1009-1037)
  SELECT se.id
  FROM "SpaceElement" se, params p
  WHERE se.type IN ('shop','fnb_food','fnb_beverages','fnb_bar','fnb_snack','fnb_icecream','merchshop')
    AND (
      EXISTS (SELECT 1 FROM "Floor" f      JOIN "Config" c ON c.id = f."configId"  WHERE f.id  = se."floorId"     AND c."spaceId" = p.space_id)
      OR EXISTS (SELECT 1 FROM "Forecourt" fc JOIN "Config" c ON c.id = fc."configId" WHERE fc.id = se."forecourtId" AND c."spaceId" = p.space_id)
      OR EXISTS (SELECT 1 FROM "Zone" z WHERE z.id = se."zoneId" AND z."spaceId" = p.space_id)
    )
),
integ AS ( -- integrationId (convention : WeezeventLocationSpaceMapping stocke l'integrationId)
  SELECT lsm."weezeventLocationId" AS integration_id
  FROM "WeezeventLocationSpaceMapping" lsm, params p
  WHERE lsm."tenantId" = p.tenant_id AND lsm."spaceId" = p.space_id
  LIMIT 1
),
windows AS ( -- fenêtres de dates des events DataFriday du space
  SELECT e.id AS event_id, e."eventDate" AS win_start,
         COALESCE(e."eventEndDate", e."eventDate") + interval '1 day' AS win_end
  FROM "Event" e, params p
  WHERE e."tenantId" = p.tenant_id AND e."spaceId" = p.space_id
),
tx AS (
  SELECT t.*, w.event_id
  FROM "WeezeventTransaction" t
  JOIN windows w ON t."transactionDate" >= w.win_start AND t."transactionDate" < w.win_end
  JOIN params p ON t."tenantId" = p.tenant_id
  WHERE t.status = 'V'
)
SELECT
  (SELECT COUNT(*) FROM shop_ids)                                        AS s0_shop_ids,           -- 0 → resolveShopIdsForSpace vide (early return)
  (SELECT COUNT(*) FROM windows)                                         AS s1_event_windows,      -- 0 → Event.spaceId/tenantId ne matchent pas (fiche 34)
  (SELECT COUNT(*) FROM tx)                                              AS s2_tx_in_window,       -- 0 → fenêtre de dates rate les transactions
  (SELECT COUNT(*) FROM tx WHERE "integrationId" = (SELECT integration_id FROM integ)) AS s3_tx_integration, -- 0 avec s2>0 → clause integration tue tout
  (SELECT COUNT(*) FROM tx JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = tx.id) AS s4_item_rows, -- 0 avec s2>0 → items non synchronisés
  (SELECT COUNT(*) FROM tx
     JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = tx.id
     JOIN "WeezeventLocationShopMapping" mem ON mem."weezeventLocationId" = tx."locationId"
      AND mem."tenantId" = (SELECT tenant_id FROM params))               AS s5_mapped_by_location,  -- 0 avec s4>0 → mapping absent/pas keyé locationId
  (SELECT COUNT(*) FROM tx
     JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = tx.id
     JOIN "WeezeventLocationShopMapping" mem ON mem."weezeventLocationId" = tx."merchantId"
      AND mem."tenantId" = (SELECT tenant_id FROM params))               AS s5b_mapped_by_merchant, -- >0 avec s5=0 → mapping legacy keyé MERCHANT
  (SELECT COUNT(*) FROM tx
     JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = tx.id
     JOIN "WeezeventLocationShopMapping" mem ON mem."weezeventLocationId" = tx."locationId"
      AND mem."tenantId" = (SELECT tenant_id FROM params)
      AND mem."spaceElementId" IN (SELECT id FROM shop_ids))             AS s6_final_current_query; -- 0 avec s5>0 → spaceElementId hors shopIds
```

### Q2 — nature des clés du mapping shop

```sql
WITH params AS (
  SELECT t.id AS tenant_id FROM "Tenant" t WHERE t.name ILIKE '%big five%' LIMIT 1
)
SELECT
  COUNT(*)                                                  AS mapping_rows,
  COUNT(*) FILTER (WHERE loc.id IS NOT NULL)                AS keyed_as_location_id,
  COUNT(*) FILTER (WHERE mer.id IS NOT NULL)                AS keyed_as_merchant_id,
  COUNT(*) FILTER (WHERE loc.id IS NULL AND mer.id IS NULL) AS keyed_as_neither
FROM "WeezeventLocationShopMapping" m
JOIN params p ON m."tenantId" = p.tenant_id
LEFT JOIN "WeezeventLocation" loc ON loc.id = m."weezeventLocationId"
LEFT JOIN "WeezeventMerchant" mer ON mer.id = m."weezeventLocationId";
```

### Q3 — contre-témoin agrégat vs fenêtres Event

```sql
WITH params AS (
  SELECT s.id AS space_id, s."tenantId" AS tenant_id
  FROM "Space" s
  JOIN "Tenant" t ON t.id = s."tenantId"
  WHERE s.name ILIKE '%auxerre%' AND t.name ILIKE '%big five%'
  LIMIT 1
)
SELECT DATE(srma.minute) AS day, SUM(srma."revenueHt") AS ca_ht,
       SUM(srma."itemsCount") AS items, COUNT(DISTINCT srma."weezeventLocationId") AS locations
FROM "SpaceRevenueMinuteAgg" srma, params p
WHERE srma."tenantId" = p.tenant_id AND srma."spaceId" = p.space_id
GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
-- un day présent ici mais hors de toute fenêtre [eventDate, eventEndDate+1j) → cause fenêtre de dates
```

### Résultats du diagnostic (2026-07-18, MCP Supabase, projet `datafriday-dev`)

Q0 : résolution unique — space `cmovsjbiz01lzvwyn30wweqpf` (Auxerre) / tenant
`cmovsic1g01lvvwyndt2qqwkw` (Big Five Org).

Q1 (funnel) : **aucune étape à 0** — s0=18 shops, s1=14 events, s2=16 327 tx,
s3=16 316 (integration OK), s4=28 791 items, s5=28 766 mappés par `locationId`,
**s5b=0** (aucun mapping legacy keyé merchant), s6=28 766.

Q2 : 70 mappings, **100 % keyés `locationId`**, 0 merchant, 0 orphelin — l'ambiguïté
merchant/location du schéma ne s'exprime pas sur ce tenant.

Q3 : agrégat cohérent avec les fenêtres Event (12 jours de CA, 47 k€ max le 2026-05-10).

Rejeu de la requête déployée (HEAD, INNER JOIN strict) avec les vrais paramètres :
**22 541 lignes agrégées sur 11 events** → la requête « cassée » renvoie bien des données
pour cet espace. **La cause du « 0 article » n'est pas la base ni la jointure** pour Auxerre.

**Découverte structurante** : les 18 shops d'Auxerre sont rattachés **exclusivement via
`Zone`** (builder v2) — 0 via `Floor`, 0 via `Forecourt`. Tout backend déployé dont
`resolveShopIdsForSpace` ignore les zones → `shopIds = []` → early return → `[]` pour
tous les events (symptôme exact, shop-level RPC intact car côté DB). La branche
`production` de ce repo inclut les zones depuis l'init (15/07), mais si Render déploie
encore `api-datafriday-staging` (repo cause cité en tête de fiche) ou un commit antérieur,
c'est la cause la plus probable. **Test décisif** : Network sur la page Analyse —
`event-timeline` en 200 avec `{"<eventId>": []}` partout → code déployé sans zones
(redéployer) ; timeout/5xx → cause transport ci-dessous.

Cause aggravante côté transport : l'API déployée (Render) répond en **53 s à froid**
(cold start, mesuré le 2026-07-18) contre 0,5 s à chaud ; le timeout axios par défaut du
front est de 30 s (`utils/api.js:103`) → le batch `event-timeline` est avorté au premier
chargement, avalé en `[]` (fiche front 187), et le cache par event du front fige le vide
jusqu'à un hard reload. Le LEFT JOIN de la correction reste pertinent (autres espaces sans
mappings). Mitigation front livrée le 2026-07-18 (`datafriday-web/src/api/client.js`, détail
fiche front 187) : warm-up `GET /health` au chargement + retry unique des GET en timeout si
`/health` répond vite (preuve cold start). Le vrai fix infra reste keep-alive externe ou
upgrade du plan Render.

### Check navigateur (cause « échec avalé »)

Network filtré `event-timeline` sur la page Analyse (hard reload — cache par event) :
HTTP 500/4xx → échec avalé côté front (fiche front 187) ; 200 avec `{ "<eventId>": [] }` →
backend renvoie réellement vide → causes Q1.

## Correction

`spaces.service.ts` `getEventTimelineBatch` aligné sur la sémantique résiliente de la RPC
(2026-07-18, non déployé, aucune migration nécessaire — SQL brut du service uniquement) :

- `INNER JOIN` mapping + `SpaceElement` → **`LEFT JOIN`** ; le filtre
  `spaceElementId = ANY(shopIds)` sort du `ON` vers un `WHERE
  (mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(shopIds))` — les ventes non
  mappées sont conservées, celles mappées vers les shops d'un autre espace restent exclues.
- `shopId` → `COALESCE(mem."spaceElementId", t."locationId")`, `shopName` →
  `COALESCE(se.name, t."locationName", t."locationId")` ; `GROUP BY` mis à jour sur ces
  expressions. Le front route les lignes inconnues vers le bucket gris `UNATTACHED_SHOP_KEY`
  (`analyseReconciliation.js`) — même comportement que le shop-level.
- **Garde-fou** : la branche `IS NULL` n'est autorisée que si un `integrationId` scope la requête
  (sinon, mode dégradé tenant-wide : garder les non-mappés ferait fuiter les ventes d'autres
  espaces dans les fenêtres de dates de celui-ci → on exige alors le mapping, comme avant).
- Early return `shopIds.length === 0` inchangé.
- **Volontairement non fait** : fallback de jointure sur `t."merchantId"` pour les mappings
  legacy keyés merchant (s5b>0 en Q1) — avec le LEFT JOIN ces ventes remontent déjà en
  « Non rattachés » au lieu de disparaître ; la ré-attribution propre est une décision
  data-migration / double clé → QUESTIONS_A_BERTRAND (front).

## Risque de régression / à surveiller

- **Les totaux item-level augmentent** (ventes précédemment supprimées désormais visibles en
  gris) — c'est le but (cohérence avec le CA shop-level), mais à signaler aux utilisateurs.
- `GET /spaces/:id/event-timeline/:eventId` (wrapper single) nourrit aussi EventPredictView →
  smoke-tester Predict après déploiement (pas de double comptage des lignes non rattachées).
- Transactions à `locationId` NULL : `COALESCE(NULL, NULL)` → bucket shopId NULL (gris),
  acceptable.
- Rejouer Q1 après déploiement : s6 « équivalent » doit devenir >0 via la nouvelle requête.

## Références

- Fiche miroir front : `datafriday-web/docs/bugs/187_analyse_articles_echec_event_timeline_silencieux.md`
  (échec HTTP avalé → snackbar une fois/session).
- Fiches liées : 14 (colonnes agrégation erronées), 16 (périmètres divergents des agrégats),
  21 (jointure Event↔Weezevent par date seule), 34 (`Event.spaceId` sans FK), 80 (RPC shop-details).
- Doc domaine : `datafriday-web/docs/modules/02_ANALYSE.md` (Pièges n°1 et n°3).
