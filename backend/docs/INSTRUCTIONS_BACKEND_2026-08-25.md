# Instructions backend — chantier Analyse Jean Bouin (25/08/2026)

> Document autonome pour la personne qui gère le backend (déploiement, base de production,
> Render). Tout est expliqué en clair : **ce que chaque action modifie (avant → après)**, dans
> quel ordre l'appliquer, comment vérifier, et comment revenir en arrière. Les fiches de
> référence sont citées en bas mais leur lecture n'est pas nécessaire pour agir.

## Le contexte en 5 lignes

Le Stade Jean Bouin héberge deux clubs (Stade Français rugby, Paris FC foot). Les jours où
les deux jouent, l'application attribue les ventes aux matchs uniquement par l'horaire, sans
vérifier le club → les ventes du rugby sont comptées dans le match de foot ET dans le match
de rugby (80 343,07 € comptés deux fois sur la saison, vérifié en base le 24/08). Bertrand a
décidé le 25/08 : une vente compte pour un match si elle vient de la caisse du bon club ET
tombe entre l'ouverture des portes et l'heure de fin. Ce document applique cette décision.

## Vue d'ensemble — l'ordre exact

| # | Action | Type |
|---|---|---|
| §1 | Sauvegardes SELECT (avant tout) | SQL lecture |
| §2 | Corriger la date de SFP-Montauban | SQL écriture |
| §3 | Poser le lien match ↔ club (77 events) | SQL écriture |
| §4 | Déployer le code (nouvelle attribution) | Déploiement |
| §5 | Relancer l'agrégation de Jean Bouin | Appel API |
| §6 | Purger les agrégats orphelins | SQL écriture |
| §7 | Vérifications finales | SQL lecture + UI |

Ne pas changer l'ordre : la purge (§6) vient APRÈS la ré-agrégation (§5), et la
ré-agrégation n'a de sens qu'avec le code déployé (§4) et le lien club posé (§3).
Les fichiers SQL sont dans `backend/prisma/migrations/` (application manuelle, ADR-0002 —
ils ne passent PAS par `prisma migrate deploy` automatique de la plateforme).

## §1 — Sauvegardes avant tout

Exécuter et **conserver le résultat** (c'est le retour arrière) :

```sql
SELECT id, name, "eventDate", "eventStartDate", "eventEndDate", "weezeventEventId"
FROM "Event"
WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo' AND "tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz';
```

## §2 — Date de SFP-Montauban

Fichier : `backend/prisma/migrations/20260825100000_fix_montauban_event_dates/migration.sql`
(les requêtes de contrôle avant/après et le retour arrière sont dans le fichier).

- **Ce que ça modifie** : 1 ligne de `Event` — `eventDate` passe du 2025-09-20 (saisie
  erronée) au 2025-09-06 (la vraie date du match, déjà portée par `eventStartDate`).
- **Effet visible** : SFP-Montauban cesse d'afficher 0 € dans l'Analyse.

## §3 — Lien match ↔ club

Fichier : `backend/prisma/migrations/20260825100001_backfill_event_weezevent_container/migration.sql`.

- **Ce que ça modifie** : la colonne `weezeventEventId` de ~76 lignes `Event` (espace Jean
  Bouin), aujourd'hui vide — elle reçoit l'identifiant du « conteneur » Weezevent du club
  (PFC% → Paris FC ; SFP%/STREAM FOR HUMANITY/Dragons catalans → Stade Français, les deux
  derniers vérifiés par leurs ventes réelles). Aucun changement de schéma.
- ⚠️ Lancer d'abord le **CONTRÔLE AVANT** du fichier : il liste l'affectation proposée des
  77 events. S'il affiche une ligne « ?? A ARBITRER », STOP — demander à JLH.
- **Effet visible** : aucun avant §4+§5.

## §4 — Déploiement du code

Fichiers modifiés (branche du chantier) et ce qu'ils font maintenant :

| Fichier | Avant → Après |
|---|---|
| `src/features/aggregation/aggregation.service.ts` | Un event lié à un conteneur de club retombait sur la fenêtre horaire seule → nouveau mode `container-range` : ne prend que les ventes TAGUÉES du conteneur du club ET dans la fenêtre portes→fin. Les autres modes (lien exact, CSV sans tag) sont inchangés. |
| `src/features/spaces/spaces.service.ts` | La page Analyse comptait de minuit à l'heure de fin, sans vérifier le club → même fenêtre portes→fin (±2 h) que l'agrégation, même lecture de date (`eventStartDate` en priorité), et filtre par conteneur du club quand le lien existe. Les 3 endpoints batch (timeline, paniers, non-mappés) suivent. |
| `src/features/events/events.service.ts` (+ dto) | Aucune validation de dates → une date de fin antérieure au début est refusée à la création et à la modification (plus jamais un Montauban). |
| `src/features/spaces/spaces.controller.ts` + service | La timeline de montage servait le détail minute (~2 Mo par match) → nouveau paramètre `?granularity=summary` : totaux match × buvette × article (~100× plus léger, SQL plus rapide). Sans le paramètre, comportement inchangé (la courbe horaire l'utilise toujours). |
| `src/features/mappings/mappings.service.ts` + `src/shared/constants/event-batch-cache.ts` + `src/shared/utils/semaphore.ts` (nouveau) | Protections serveur : file d'attente des requêtes lourdes (2 à la fois, au-delà 503 « réessayez »), cache du volume « non mappé » purgé à chaque écriture de mapping. |

- **Comportement observable qui change** : les jours à deux matchs, chaque match ne compte
  plus que les ventes de son club ; l'Analyse compte depuis l'ouverture des portes ; le CA
  de la bande KPI de l'Analyse (sans filtre PdV/article/horaire) est lu depuis
  `Event.revenue` — identique à Events Library et à l'accueil au centime.
- Tests verts avant déploiement : `npx jest src/features/aggregation src/features/events`
  (les suites spaces ont un échec PRÉEXISTANT sans rapport, voir note en bas).

## §5 — Ré-agrégation de Jean Bouin

Après §2+§3+§4, relancer l'agrégation de l'espace pour CHACUNE des deux intégrations
(l'endpoint traite une intégration à la fois) :

```
POST /aggregation/process-events   (authentifié admin du tenant)
Body 1 : { "spaceId": "cmsufah9p0c08gpkz2wsg5pzo", "integrationId": "cms9h9tfy00blqdroy0ahs1rd" }   # SFP
Body 2 : { "spaceId": "cmsufah9p0c08gpkz2wsg5pzo", "integrationId": "cms82c09u8tdhkgsmovyrzzlk" }   # PFC
```

Chaque appel retourne un `jobId` — suivre `GET /aggregation/jobs/:jobId` jusqu'à
`completed`. (Équivalent UI : relancer l'agrégation depuis le wizard Data Integration de
chaque intégration.) La complétion du job purge d'elle-même les caches Redis des endpoints
batch (BUG-143-01) — rien d'autre à vider.

## §6 — Purge des agrégats orphelins

Fichier : `backend/prisma/migrations/20260825100002_purge_space_revenue_agg_orphan_spaces/migration.sql`.

- **Ce que ça modifie** : supprime les lignes `SpaceRevenueMinuteAgg` /
  `SpaceRevenueMinuteItemAgg` dont le `spaceId` ne correspond plus à aucun espace
  (restes d'anciens espaces par club supprimés — un quasi-doublon complet de la table).
- **Effet visible** : aucun (lignes déjà filtrées partout). Gain : taille des tables.
  Lancer le comptage AVANT (dans le fichier) et garder le chiffre.

## §7 — Vérifications finales

```sql
-- Les 4 matchs des jours à double affiche (avant → attendu) :
SELECT e.name, e."eventDate"::date, ROUND(e.revenue::numeric,2) AS revenue, e."transactionCount"
FROM "Event" e
WHERE e.id IN ('96ac5186-5a66-48d6-8038-27c0cecf755c',  -- PFC-Dijon (fem)   35 301,39 → ≈ 1 975
               '9b9a2ee3-c087-4d35-a812-b73fcc148a72',  -- SFP-Montauban     89 182,24 → ≈ 87 207
               '811452df-5e31-4588-a1a2-9062a7ddf782',  -- PFC-Le Havre (fem) 45 041,68 → ≈ 478
               'd1f0ad2f-3bb8-472e-bda6-f25cae9afe4f'); -- SFP-Cardiff       67 442,89 → ≈ 67 002

-- Plus AUCUNE paire d'events dont les plages d'agrégats se chevauchent (attendu : 0 ligne) :
WITH r AS (
  SELECT a."weezeventEventId" AS ev, MIN(a.minute) AS mn, MAX(a.minute) AS mx
  FROM "SpaceRevenueMinuteAgg" a
  WHERE a."spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo'
  GROUP BY 1)
SELECT a.ev, b.ev FROM r a JOIN r b ON a.ev < b.ev AND a.mn <= b.mx AND b.mn <= a.mx;

-- Cohérence des 3 pages (les deux totaux doivent être égaux au centime) :
SELECT
  (SELECT ROUND(SUM(revenue)::numeric,2) FROM "Event"
    WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo') AS total_library,
  (SELECT ROUND(SUM("revenueHt")::numeric,2) FROM "SpaceRevenueMinuteAgg"
    WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo') AS total_accueil;
```

Et côté UI/infra : ouvrir l'Analyse Jean Bouin à froid → la bande KPI = la somme Events
Library ; Render stable pendant le chargement (plus de « Instance restarted »).

## Si ça se passe mal

- §2 et §3 : requête de retour arrière dans chaque fichier SQL (ou restauration depuis la
  sauvegarde §1).
- §5 : la ré-agrégation est rejouable à volonté — elle réécrit les agrégats de l'event
  avant de les recalculer, aucun état intermédiaire à craindre. Pour revenir à l'attribution
  d'AVANT : rejouer le retour arrière §3 (liens à NULL) puis relancer §5.
- §6 : irréversible mais sans consommateur (lignes orphelines) ; le comptage AVANT fait foi.
- §4 : rollback de déploiement standard ; l'ancien code lit les mêmes tables.

## Note — tests préexistants en échec (sans rapport avec ce chantier)

`src/features/spaces/spaces.service.spec.ts` : « findAll › should return paginated spaces »
échoue déjà sur la branche AVANT ce chantier (mock du spec pas à jour d'une seconde requête
billetterie dans `getRevenueSummaries`). Une tâche séparée est ouverte pour le réparer.

---

Fiches de référence : `bugs/144_01`, `bugs/145_01`, `bugs/146_01` (backend) ·
`frontend/docs/bugs/364_01` · réconciliation des 77 events :
https://claude.ai/code/artifact/5ee261f8-61c7-434a-918e-aa9b2cb1e00d

JLH
