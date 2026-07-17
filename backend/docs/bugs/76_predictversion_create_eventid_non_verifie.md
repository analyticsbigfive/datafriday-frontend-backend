# BUG-76 — `EventPredictVersion.create()` : `eventId` non vérifié (existence/tenant)

- **Statut** : ⚪ Diagnostiqué
- **Sévérité** : 🟢 Mineur
- **Domaine** : Prévision
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/predict-versions.service.ts:34-56`

## Symptôme

`POST /events/:eventId/predict-versions` ne vérifie jamais que `eventId` (pris depuis l'URL)
correspond à un `Event` existant et appartenant au tenant courant avant de créer la version. Un
`eventId` erroné/typo crée une `EventPredictVersion` orpheline (le `tenantId` de la version
elle-même reste correct — pas de fuite cross-tenant en lecture, juste une donnée sans event
parent valide).

## Cause racine

`EventPredictVersion.eventId` n'a pas de FK Prisma déclarée (même absence de contrainte que
`Event.spaceId`/`configurationId`, déjà documentée), et aucune vérification applicative ne comble
ce vide ici (contrairement à BUG-67, corrigé pour les FK de taxonomie d'`Event`).

## Correction

Aucune à ce jour — décision à prendre en cohérence avec le traitement plus large de
`EventPredictVersion` (déjà noté dans `docs/modules/07_EVENEMENTS.md` que la suppression d'un
`Event` laisse ses `EventPredictVersion` orphelines, même famille de risque). Ajouter la
vérification isolément ici sans traiter le cas symétrique (suppression) ne referme qu'une partie du
risque.

## Risque de régression / à surveiller

Si corrigé : vérifier que le flux Event Predict (hors périmètre de cet audit) crée toujours ses
versions correctement — l'`eventId` y provient normalement toujours d'un event réellement chargé.

## Références

- `docs/modules/07_EVENEMENTS.md` (section `EventPredictVersion`)
