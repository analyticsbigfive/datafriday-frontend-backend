# BUG-117-02 — `PatchPredictVersionDto` dupliqué à la main au lieu de `PartialType(CreatePredictVersionDto)`

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements / Prévision
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 (audit ciblé du module backend Events)
- **Fichiers** : `src/features/events/dto/predict-version.dto.ts:89-160` (avant fix)

## Symptôme

Toutes les entités du module Events ont un DTO de mise à jour en
`extends PartialType(CreateXDto)` (`UpdateEventDto`, `UpdateEventCategoryDto`,
`UpdateEventSubcategoryDto`, `UpdateEventTypeDto`, `UpdateTeamDto`). `PatchPredictVersionDto` était
seul à déroger : ~13 champs recopiés à la main depuis `CreatePredictVersionDto` (name, spaceId,
eventSnapshot, totalRevenue, adjustedTotalRevenue, perCapita, adjustedPerCapita, menuConfig,
quantityAdjustments, manualQuantities, predictedRecords, selectedPredictionEventIds,
selectedTimeRange — tous rendus optionnels à la main). Risque de dérive silencieuse si
`CreatePredictVersionDto` gagne un nouveau champ sans que `PatchPredictVersionDto` soit mis à jour
en miroir.

## Cause racine

`isDefault` doit être exclu du patch générique (le passage en défaut ne passe que par
`PUT .../predict-versions/default`) — un simple `PartialType(CreatePredictVersionDto)` l'aurait
inclus, ce qui a probablement motivé l'écriture manuelle plutôt que d'utiliser `OmitType` en plus de
`PartialType`.

## Correction

`PatchPredictVersionDto` réécrit en
`extends PartialType(OmitType(CreatePredictVersionDto, ['isDefault'] as const)) {}` — conserve
l'exclusion volontaire d'`isDefault`, élimine la duplication manuelle des ~13 autres champs.
Comportement identique (tous les champs restent optionnels, comme avant), simplement dérivé de la
source de vérité `CreatePredictVersionDto` au lieu d'une copie figée.

## Risque de régression / à surveiller

- `PartialType` rend `eventSnapshot` optionnel dans le patch alors qu'il est requis dans
  `CreatePredictVersionDto` — comportement strictement identique à l'ancien
  `PatchPredictVersionDto` (qui avait déjà `@IsOptional()` sur ce champ), donc pas un changement
  de comportement.
- `npx tsc --noEmit` propre, suite `jest src/features/events` (67 tests, y compris
  `predict-versions.service.spec.ts`) verte.

## Références

- Aucune.
