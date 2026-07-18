# BUG-76 — `EventPredictVersion.create()` : `eventId` non vérifié (existence/tenant)

- **Statut** : 🟢 Corrigé
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

**Décision (2026-07-18)** : ajouter la vérification côté création, même sans traiter le cas
symétrique (suppression d'un `Event` laissant ses `EventPredictVersion` orphelines — hors
périmètre, comportement pré-existant inchangé). `create()` fait désormais
`this.prisma.event.findFirst({ where: { id: eventId, tenantId } })` et lève `NotFoundException` si
l'event n'existe pas/n'appartient pas au tenant, avant toute écriture — même pattern que BUG-67.

## Risque de régression / à surveiller

- Vérifié : le flux Event Predict (hors périmètre de cet audit) charge toujours un event réel
  avant d'appeler cette route — pas de régression attendue sur le chemin nominal.
- `tsc --noEmit` propre sur l'ensemble du backend après ce changement.

## Références

- `docs/modules/07_EVENEMENTS.md` (section `EventPredictVersion`)
