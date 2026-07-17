# BUG-65 — `PredictVersionsService.setDefault` : écriture cross-tenant sans scoping

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business (faille de sécurité)
- **Domaine** : Événements / Prévision
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/predict-versions.service.ts:105-122`

## Symptôme

`PUT /events/:eventId/predict-versions/default` permet à n'importe quel utilisateur authentifié
(avec `menu.events.manage`) de définir comme "version par défaut" une `EventPredictVersion`
appartenant à **un autre tenant**, ou à un autre `event` du même tenant, en passant simplement son
`id` dans le body (`{ "versionId": "<id-etranger>" }`).

## Cause racine

`setDefault()` construit deux opérations Prisma dans un `$transaction` :
1. `updateMany({ where: { eventId, tenantId }, data: { isDefault: false } })` — correctement scopée.
2. `update({ where: { id: versionId }, data: { isDefault: true } })` — **sans** filtre `tenantId`
   ni `eventId`, et sans lookup préalable d'ownership (contrairement à `patch()`/`removeById()`, qui
   appellent tous deux `findById(id, tenantId)` avant d'écrire).

N'importe quel `versionId` existant, appartenant à n'importe quel tenant, est donc accepté tel
quel par la deuxième opération.

## Correction

Ajout d'une vérification d'ownership (`findById(versionId, tenantId)`, qui lève déjà un
`NotFoundException` si la version n'appartient pas au tenant courant) avant de construire
l'opération d'update, avant le `$transaction`.

## Risque de régression / à surveiller

Vérifier qu'un `PUT .../predict-versions/default` avec un `versionId` valide du même tenant
fonctionne toujours (cas nominal), et qu'un `versionId` d'un autre tenant renvoie désormais 404 au
lieu de réussir silencieusement. Régression couverte par `predict-versions.service.spec.ts`
(nouveau fichier — ce module n'avait aucun test avant ce fix).

## Références

- `docs/modules/07_EVENEMENTS.md` (domaine Prévision, `EventPredictVersion`)
