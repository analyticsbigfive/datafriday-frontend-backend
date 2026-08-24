# Runbook — mise en service des correctifs Analyse (24/08/2026)

Couvre le déploiement des correctifs BUG-353→356 (web) / BUG-135→137 (api), le recalcul
de l'historique des transactions, et le rattrapage des 81 transactions Weezevent jamais
importées sur « Le Mans-Brest ». **Ordre des étapes obligatoire.**

Contexte détaillé : fiches `docs/bugs/135_01`, `136_01`, `137_01`, `138_01` (api) et
`web/docs/bugs/353_01` → `356_01`.

Référence de l'événement témoin :

| Clé | Valeur |
|---|---|
| Espace | Le Mans FC — `cms81300i001bkgsmlrhnuygz` |
| Event | Le Mans-Brest 22/08/2026 — `5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89` |
| Intégration active | Le Mans FC Weez — `cmt01vzza007dqw011q4js95x` |
| Attendu final | **5 802 transactions · 26 268 unités · ~66 452 € HT** (= export Weezevent) |

---

## 0. Redémarrer le backend avec les correctifs

Redis **d'abord**, backend **après** — pas de reconnexion auto : un backend démarré avant
Redis renvoie 500 « Connection is closed » sur toute route authentifiée.

```bash
cd backend && npm run docker:up
```

```bash
cd backend && npm run start:dev
```

En déploiement : **backend avant (ou avec) le frontend**. Le KPI transactions du front lit
désormais l'endpoint paniers ; face à un vieux backend, les espaces à plusieurs
intégrations (7 sur 31) affichent **0 transaction** le temps du décalage.

## 1. Recalcul de l'historique des transactions (SQL manuel — ADR-0002)

Fichier : `prisma/migrations/20260824120000_fix_transactions_count/migration.sql`
(idempotent, zéro backtick, validé à blanc sur dev : somme 13 925 → 5 721 sur l'événement
témoin). À appliquer **à la main** via psql `$DIRECT_URL` — jamais par un agent ni par la
plateforme.

Contrôle AVANT (attendu : `13925`) :

```sql
SELECT SUM("transactionsCount") FROM "SpaceRevenueMinuteAgg" WHERE "weezeventEventId" = '5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89';
```

Appliquer le fichier, puis contrôles APRÈS :

```sql
SELECT SUM("transactionsCount") FROM "SpaceRevenueMinuteAgg" WHERE "weezeventEventId" = '5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89';
```

→ attendu `5721`.

```sql
SELECT "transactionCount", "avgSpendPerTx" FROM "Event" WHERE id = '5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89';
```

→ attendu `5721` / `~11.46`.

**Limite connue** : le SQL ne répare que les lignes rattachables au grain courant
(282 250 / 547 954). **109 événements** (55 partiels + 54 pas du tout, aucun postérieur au
19/06/2026) restent faux et passent par la re-agrégation (étape 3). La requête qui les
liste est en commentaire d'en-tête du fichier de migration.

## 2. Rattraper les 81 transactions Weezevent manquantes (892 € HT)

Diagnostic (comparaison CSV export ↔ base, 24/08) : deux blocs **contigus** d'IDs
Weezevent jamais importés — signature de deux fenêtres de sync incrémentale ratées pendant
la seconde mi-temps, pas d'anomalies éparses.

| Bloc d'IDs | Transactions | Lignes | CA HT | Horaire (local) |
|---|---|---|---|---|
| 7148 → 7162 | 15 | 40 | 158,15 € | 21:44 → 21:45 |
| 7663 → 7728 | 66 | 172 | 733,52 € | 21:54 → 21:55 |
| **Total** | **81** | **212** | **891,67 €** (1 037 € TTC, 401 unités) | |

Heure locale 21:44–21:55 = **19:44–19:55 UTC** (`transactionDate` est stocké en UTC).
Bornes exactes des deux blocs, en `transactionDate` UTC : 19:44:49,605 → 19:45:08,041 et
19:54:06,214 → 19:55:10,216.

> **Correction du 24/08 18:40 — les commandes ci-dessous ont été réécrites.**
> La version initiale (sans `"full": true`, 2e fenêtre 19:35→19:56) **ne pouvait pas
> fonctionner** : voir [BUG-139-01](bugs/139_01_resync_manuelle_fromdate_ignore.md). En mode
> incrémental, `fromDate` est écrasé par `lastSyncedAt − 5 min` tandis que `toDate` est
> honoré, ce qui envoie à Weezevent `created_at__gte` (jour J) **>** `created_at__lte`
> (22/08) : ensemble vide par construction. `"full": true` est le seul contournement tant
> que le fix n'est pas fait.
>
> **Le bouton « Re-synchroniser » de Data Integration ne remplace pas ces commandes** : il
> poste `{type, integrationId}` sans aucune borne de date (`DataIntegrationView.vue:1679`),
> donc une fenêtre ≈ maintenant. Il ne peut pas réimporter le 22/08 — et son dialogue
> affiche le **total en base** (`res.count`), pas ce qui vient d'être importé
> (`itemsCreated`), donc un rattrapage nul y ressemble à un succès.
>
> Vérification faite le 24/08 : `WeezeventSyncState` ne peut pas servir de preuve d'exécution
> ici — le cron 10 min l'écrase (relevé de 18:50 : 19 intégrations balayées en ~300 ms
> chacune, toutes à `lastSyncCount = 0`). Le contrôle qui fait foi est la requête de
> contiguïté des IDs ci-dessous.

⚠ **BUG-138-01** : la sync ne lit qu'UNE page de 500 par appel (pagination cassée +
curseur horloge murale — voir la fiche). Deux conséquences ici : (1) la full sync hebdo ne
rattrapera PAS ces transactions (vérifié : celle du 23/08 02:00 s'est arrêtée à 500) ;
(2) la resync manuelle doit utiliser des fenêtres **étroites** (< 500 transactions
chacune) — une fenêtre large de 20 min contient ~1 100 transactions et se ferait plafonner
pareil. D'où DEUX appels ciblés, **chacun avec `"full": true`** :

```bash
curl -X POST "$API_URL/api/v1/weezevent/sync" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"integrationId":"cmt01vzza007dqw011q4js95x","type":"transactions","full":true,"fromDate":"2026-08-22T19:44:00Z","toDate":"2026-08-22T19:46:00Z"}'
```

```bash
curl -X POST "$API_URL/api/v1/weezevent/sync" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"integrationId":"cmt01vzza007dqw011q4js95x","type":"transactions","full":true,"fromDate":"2026-08-22T19:54:00Z","toDate":"2026-08-22T19:56:00Z"}'
```

Le 1er couvre le bloc 7148-7162, le 2e le bloc 7663-7728. Volumes mesurés sur
l'intégration témoin complète (`cmt7k46lk00gqm36ljmtwaonx`, 5 802/5 802) : **110** et
**104** transactions par fenêtre — largement sous le plafond de 500. La dédup
(`processBatchTransactions:788` + `createMany({skipDuplicates:true})`) rend les appels
rejouables sans risque.

N'élargissez **pas** ces fenêtres pour « attraper les ventes hors-ligne » : le filtre API
porte sur `created`, qui vaut exactement `transactionDate` en base (vérifié au
millième — `weezeventId` 6908 : `created` `2026-08-22T19:40:00.246427Z` ↔ `transactionDate`
`2026-08-22 19:40:00.246`). Ce sont `validated` / `started_at` qui sont antérieurs, et ils
ne sont pas filtrés.

Contrôle — la requête doit renvoyer **zéro ligne** :

```sql
SELECT g FROM generate_series(7148,7162) g WHERE NOT EXISTS (SELECT 1 FROM "WeezeventTransaction" WHERE "weezeventId" = g::text AND "integrationId" = 'cmt01vzza007dqw011q4js95x')
UNION ALL
SELECT g FROM generate_series(7663,7728) g WHERE NOT EXISTS (SELECT 1 FROM "WeezeventTransaction" WHERE "weezeventId" = g::text AND "integrationId" = 'cmt01vzza007dqw011q4js95x');
```

## 3. Re-agréger

Après l'étape 2, pour l'événement témoin :

```bash
curl -X POST "$API_URL/api/v1/aggregation/process-events" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"spaceId":"cms81300i001bkgsmlrhnuygz","eventIds":["5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89"],"integrationId":"cmt01vzza007dqw011q4js95x"}'
```

Suivi : `GET /aggregation/progress/:jobId`.

Même appel (sans `eventIds`, ou par lots) pour les **109 événements** listés à l'étape 1,
sur leurs espaces respectifs. Nota : le writer corrigé écrit désormais
`COUNT(DISTINCT t."id")` — re-agréger un événement le répare aussi ; le SQL de l'étape 1
ne sert qu'à traiter l'historique en masse sans tout re-agréger.

## 4. Contrôle final

```bash
cd backend && npx tsx scripts/verify-event-analytics.ts --event=5d8d0500-f7ad-4bdf-9767-bbe5a5e15a89
```

Attendu après les 4 étapes : **5 802 transactions · 26 268 unités · ~66 452 € HT** — au
centime de l'export Weezevent (« Ligue 1 Brest »). Sur la page Analyse : « Product
category mix per transaction » et le KPI transactions affichent le **même** nombre ;
panier moyen ≈ 11,45 €.

Rappels de comportement attendu (pas des bugs) :

- Bud 33cl : **916 unités / 14 PdV**, insensible au SpaceMenu (test
  `web/tests/unit/analyseReconciliation.spec.js`, bloc BUG-353-01) ;
- ventes non mappées : **comptées**, affichées « Non mappées », bandeau informatif avec le
  volume + lien Data Integration (décision JLH 24/08, aller-retour tracé en fiche
  BUG-137-01 — ne pas « corriger » en excluant) ;
- l'agrégat shop-level (`Event.revenue`, carte Home) reste toutes-ventes : un écart
  Home > Analyse sur un espace mal mappé mesure le travail de mapping restant.

---

*JLH — 24/08/2026*
