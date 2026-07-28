# BUG-010 — Requêtes N+1 dans le toolbox Event Predict

- **Statut** : 🟢 Corrigé (fixes 2026-07-18, voir Correction — fixes front, aucun déploiement backend requis)
- **Sévérité** : 🟡 Mineur/perf
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-07

## Symptôme

Latence anormale sur le toolbox Event Predict.

## Cause racine

Deux patterns N+1 identifiés lors d'un audit statique :
- `event-timeline` interrogé par id unique en boucle au lieu d'un appel batch.
- `shopMenuItems` / `fetchForShop` refait un fetch granulaire dupliqué de données déjà chargées
  ailleurs.

## Correction

2026-07-18 — les deux patterns N+1 corrigés côté front (audit /analyse+predict+stock) :
1. **event-timeline en boucle** : le moteur predict (`usePredictiveTimeline.js`) préchauffe désormais
   son cache via l'endpoint batch existant `GET /spaces/:id/event-timeline?eventIds=` (1 requête
   pour N events, VALUES-CTE côté backend) ; la boucle single-event ne sert plus que de fallback.
   Détail : fiche front 180.
2. **shopMenuItems/fetchForShop par shop** : Space Inventory consomme désormais le batch
   `GET /space-menu/:spaceId/:configId/shop-items` (enrichi basePrice/picture côté backend).
   Détail : fiche 96 (canonique) + miroir front 185.

## Risque de régression / à surveiller

Fallbacks per-event/per-shop conservés (backend déployé antérieur, échec batch). Vérifier en
staging : onglet réseau = 1 requête timeline batch (predict) et 1 requête shop-items (inventaire).

## Références

- Audit perf toolbox Event Predict (analyse statique, 2026-07-07)
- Fiches 96, front 180, front 185 (audit 2026-07-18)
