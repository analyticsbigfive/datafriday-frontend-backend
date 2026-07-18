# BUG-008 — manualQuantities n'est jamais envoyé au backend

- **Statut** : 🟢 Corrigé (en code, non déployé — 2026-07-18)
- **Sévérité** : 🟠 Majeur (perte de données au changement d'appareil)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : les deux (front = cause, backend déjà prêt à recevoir)
- **Découvert le** : 2026-07-15
- **Fichiers** : `useEventPredictVersions.js:144-149`, `predict-version.dto.ts` (backend, déjà prêt), `predict-versions.service.ts:49,73` (backend, déjà prêt)

## Symptôme

Éditer un item à quantité manuelle (prédiction=0), sauvegarder une version, recharger sur un autre
appareil/navigateur (localStorage non partagé) : la quantité manuelle est perdue — seuls
`menuConfig`/`quantityAdjustments` survivent au changement d'appareil, `manualQuantities` retombe
systématiquement à `{}`.

## Cause racine

Le payload construit par `useEventPredictVersions.js:144-149` n'envoie jamais `manualQuantities`
au backend, bien qu'un commentaire dise d'attendre que "la colonne + le DTO existent" — hors le DTO
backend (`CreatePredictVersionDto.manualQuantities?`) et le service (`predict-versions.service.ts:49,73`)
sont déjà prêts à le recevoir. `manualQuantities` n'a donc jamais quitté le `localStorage` local.

## Correction

2026-07-18 : `versionToPayload` (`useEventPredictVersions.js`) envoie désormais
`manualQuantities: v.manualQuantities || {}`. Vérifié avant fix : colonne Prisma
(`manualQuantities Json @default("{}")`), DTO whitelisté (`predict-version.dto.ts:69,142`) et
service (`predict-versions.service.ts:41,56`) étaient bien prêts. Le retry-sans-`predictedRecords`
sur 400 est CONSERVÉ tant que le backend déployé peut être une version antérieure — à retirer
après déploiement backend confirmé. Miroir backend : fiche 88.

## Risque de régression / à surveiller

Tester cross-device après déploiement : éditer une quantité manuelle, sauvegarder, recharger sur
un autre navigateur → la quantité doit survivre (elle retombait à `{}` avant).

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #1
