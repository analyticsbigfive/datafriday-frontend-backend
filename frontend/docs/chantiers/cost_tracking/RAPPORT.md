# Rapport Cost tracking (2026-10-22)

Branche `feat/cost-tracking` (worktree `datafriday-cost-tracking`, depuis `develop`). Rien commité, rien poussé, aucune migration appliquée, aucune base touchée, aucun build.

## Lots livrés (un agent Sonnet par lot, aucun n'a atteint 140k)
- Lot 0 : ADR_LOT0.md (constats, modèle, points d'appel).
- Lot 1 : table MenuItemCostSnapshot (migration écrite, non appliquée), service recordIfChanged idempotent, appels branchés, script de baseline (non lancé).
- Lot 2 : module backend `features/cost-tracking` (series, catalog, history, costsAsOf), permission `front.fb.costTracking`.
- Lot 3a/3b : couche données frontend, page et 21 composants, route, entrée de menu, i18n FR/EN.
- Lot 4a/4b : endpoint `GET /analyse/:spaceId/event-costs` et branchement de l'Analyse avec repli sur le coût actuel.

## Décisions prises
- Pas de propagation composant vers articles dans ce chantier (lot 1bis à part, elle change les coûts affichés).
- Marge Weezevent par jointure latérale : NON faite (dupliquerait resolveEventReference en SQL).
- Boutons partage/export de la maquette non repris.

## À faire par un humain avant tout déploiement
1. Appliquer la migration en local, lancer `scripts/check-schema-indexes.mjs`.
2. EXPLAIN (begin read only, jamais de SET sur le pooleur 6543) : requête CA top 10, lectures snapshots, event-costs sur 100 events.
3. Lancer la baseline en `--dry-run` puis en local ; mesurer le volume du JSON recipe.
4. Recette navigateur : page Cost tracking (graphique, étiquettes 40 degrés, thème sombre, tiroir) et Analyse sur 1 ou 2 events de référence (les chiffres changent si le snapshot diffère du coût actuel).
5. Vérifier la sync RBAC au premier boot (front.fb.costTracking).
6. Ordre des PR vers staging : 1, 2, 3, puis 4 (le plus risqué), jamais de push develop sans go.

## Points ouverts (§9 du plan)
Fournée contre pièce dans l'Analyse (conservé : fournée), prix global contre par espace (global), rétention, axe Temps | Matchs, période "depuis le début du suivi" remplacée par des durées fixes.
