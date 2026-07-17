# BUG-74 — `PredictVersionsService.remove()`/`findOne()` : code mort (au-delà de BUG-13)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Prévision
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/predict-versions.service.ts:18-24` (findOne),
  `:95-98` (remove)

## Symptôme

`PredictVersionsService.remove(eventId, versionId, tenantId)` n'est appelée par aucun contrôleur
— seule `removeById(id, tenantId)` est câblée dans `PredictVersionsStandaloneController`. `remove()`
est le seul appelant de `findOne(eventId, versionId, tenantId)` en dehors de la méthode `update()`
déjà documentée comme morte (BUG-13, `PredictVersionsService.update() jamais appelée`) — les deux
méthodes sont donc transitivement inatteignables.

## Cause racine

Vestige d'une version antérieure de l'API où `DELETE` était scopé par `eventId` en plus de
`versionId` ; le contrôleur actuel n'utilise que la route standalone `DELETE /predict-versions/:id`.

## Correction

Suppression de `remove()` et `findOne()`. `update()` (déjà documentée morte, [[13_predictversion_update_jamais_appelee]])
était le seul autre appelant de `findOne()` — supprimée dans la foulée avec son DTO
`UpdatePredictVersionDto`, sans quoi elle référençait une méthode inexistante.

## Risque de régression / à surveiller

`findAll`/`findById`/`create`/`patch`/`removeById`/`setDefault` restent inchangées.
Vérifié qu'aucun autre fichier (tests, controller) n'importait `update()`/`UpdatePredictVersionDto`
(grep exhaustif sur `src/`).

## Références

- `docs/bugs/13_predictversion_update_jamais_appelee.md`
