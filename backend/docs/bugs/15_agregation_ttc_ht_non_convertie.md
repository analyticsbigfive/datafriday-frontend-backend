# BUG-015 — La formule de CA du pipeline d'agrégation vivant ne convertit jamais TTC→HT

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant (montants HT faux dans les agrégats)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-20 dans la même session que BUG-014 (même
  bloc de code)
- **Fichiers** : `aggregation.service.ts:276-311` (`executeProcessEvents`, vivant),
  `services/space-aggregation.service.ts:171-178` (mort, référence), `spaces.service.ts:1156-1159`
  (calcul live `getEventTimelineBatch`, référence correcte)

## Symptôme

Comparer `SpaceRevenueMinuteAgg.revenueHt` d'un event à la somme calculée par
`GET /spaces/:id/event-timeline/:eventId` pour le même event : les deux divergent.

**Vérifié en base le 2026-07-20** sur l'event "Match Noel" (Aix Arena) : l'ancienne formule
(`SUM(unitPrice*quantity - reduction)`, sans détaxe) donne **6745,50 €** — exactement le montant
affiché à l'écran comme "CA HT". La formule corrigée (avec `/ (1 + vat/100)`) donne **6075,58 €**
pour les mêmes transactions — environ 10% de moins, cohérent avec le retrait de la TVA. Le "CA HT"
affiché à l'utilisateur était donc en réalité du TTC.

## Cause racine

`aggregation.service.ts` (le pipeline réellement exécuté) ne divisait jamais par `1+vat/100` pour
passer du TTC au HT — contrairement au pipeline mort `SpaceAggregationService` et au calcul
live `getEventTimelineBatch`, qui font tous deux la conversion correctement.

## Correction

Ajout de `/ (1 + ti."vat" / 100)` autour du calcul existant (remise déjà soustraite avant division,
donc net TTC → net HT), aligné sur la formule de référence de `spaces.service.ts:1156-1159`
(`ti."unitPrice" * ti.quantity / (1 + ti."vat" / 100)`, qui utilise le taux de TVA stocké
directement sur la ligne de transaction — pas besoin de jointure vers le produit).

## Risque de régression / à surveiller

- **Aucun backfill manuel nécessaire** : corrigé dans le même bloc que BUG-014
  (`executeProcessEvents`), qui supprime déjà les anciennes lignes de l'event avant de ré-agréger
  — un "Re-traiter" par événement suffit à réécrire des montants HT corrects.
- Vérifier après un "Re-traiter" que le "CA HT" affiché baisse d'environ le taux de TVA moyen des
  articles vendus (pas une baisse à zéro, pas une hausse).
- La formule ne gère toujours pas explicitement un `ti."vat"` à `NULL` (le champ est non-nullable
  en base avec défaut 0 à l'écriture — cf. `weezevent-incremental-sync.service.ts`, `vat: row.vat
  ?? 0` — donc `1 + vat/100` ne peut jamais être `NULL` ni tomber à 0 avec un taux de TVA réel).

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #2
- BUG-014 (`14_aggregation_colonnes_mal_ecrites.md`) — corrigé dans le même bloc de code, même
  session.
