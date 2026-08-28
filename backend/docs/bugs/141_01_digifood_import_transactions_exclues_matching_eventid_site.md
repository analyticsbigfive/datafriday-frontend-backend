# BUG-141-01 — Analyse vide après un import CSV Digifood : transactions liées au SalesEvent « site » exclues du matching d'agrégation

- **Statut** : 🟢 Corrigé (par Ulrich, develop `ebea78d`/`8c59f07` du 24/08) — re-agrégation + vérification à faire
- **Sévérité** : 🔴 Bloquant/impact business (page Analyse « Aucun détail de vente disponible », workflow de validation des données bloqué)
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (backend)
- **Découvert le** : 2026-08-24 (réunion — « l'importation de fichiers [Digifood] (ex. Le Mans) fait disparaître toutes les données d'analyse »)
- **Fichiers** : `src/features/aggregation/aggregation.service.ts`
  (`resolveSeasonContainerEventIds`, `executeProcessEvents` — `eventLinkClause`),
  `src/features/digifood/services/digifood-ingestion.service.ts:239` (`upsertSiteAsEvent`)

## En clair

Chaque vente importée d'un fichier Digifood est rattachée à un « événement » qui représente le
SITE entier (le stade), pas un match précis. Le moteur d'agrégation, lui, ne prenait en compte
que deux sortes de ventes : celles sans événement source, et celles d'un « conteneur » reconnu
comme tel parce que ses ventes s'étalent sur plus de 2 jours. Or juste après un premier import,
le site n'a que quelques heures de ventes : ni sans événement, ni conteneur → toutes les ventes
importées étaient ignorées par l'agrégation, et la page Analyse se vidait. Le correctif d'Ulrich
classe d'office tout événement Digifood comme conteneur, sans attendre 2 jours de ventes.

## Symptôme

Après import CSV Digifood, page Analyse à « Aucun détail de vente disponible » / 0 € sur les
events du space, alors que les transactions sont bien en base. Pas de crash backend.

## Cause racine

Dans `executeProcessEvents`, le rattachement fenêtre-par-date n'accepte que :
`t."eventId" IS NULL OR t."eventId" IN (<conteneurs>)`. Les conteneurs étaient détectés
uniquement par le span OBSERVÉ des transactions (`> MAX_EVENT_SPAN_DAYS = 2 jours`,
BUG-338-02). Une intégration Digifood qui démarre (un seul match importé, span de quelques
heures) a un SalesEvent « site » (`upsertSiteAsEvent`) qui n'est ni NULL ni conteneur → ses
transactions ne matchent AUCUNE clause → zéro ligne écrite dans
`SpaceRevenueMinuteAgg`/`SpaceRevenueMinuteItemAgg` → timeline/KPI item-level vides.

## Correction

Commit develop `ebea78d` (Ulrich, 24/08, mergé dans cette branche) :
`resolveSeasonContainerEventIds` ajoute d'office au set conteneur tout `SalesEvent` avec
`metadata.provider = 'digifood'` — signal structurel connu à la création, pas besoin d'attendre
le span. Les transactions Digifood retombent dans le rattachement fenêtre-par-date normal.

**Reste à faire** : re-agréger les espaces Digifood touchés
(`POST /aggregation/process-events` avec `spaceId`, suivi `GET /aggregation/progress/:jobId`),
puis vérifier sur La Beaujoire Nantes / Nantes-Rodez que timeline et KPIs se re-remplissent.
À coupler avec le réimport CSV de BUG-140-01 (heures +2 h) : réimporter D'ABORD, re-agréger
ENSUITE (une seule re-agrégation pour les deux correctifs).

## Risque de régression / à surveiller

- Un futur SalesEvent Digifood par MATCH (si l'intégration webhook v26 en crée un jour de
  précis) serait aussi classé conteneur → rattachement par fenêtre au lieu d'exact ; acceptable
  (même précision que les fenêtres actuelles), mais à revisiter si ce cas apparaît.
- Après re-agrégation, contrôler `SpaceRevenueMinuteItemAgg` non vide sur la fenêtre de l'event
  témoin et cohérence CA Analyse = source.

— JLH
