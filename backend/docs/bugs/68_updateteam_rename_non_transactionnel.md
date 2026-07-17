# BUG-68 — `updateTeam` : renommage + repropagation `Event.visitingTeamName` non transactionnels

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.service.ts:478-500`

## Symptôme

`PATCH /teams/:id` avec un nouveau `name` fait deux appels Prisma séparés, non transactionnels :
`team.update()` puis `event.updateMany()` pour repropager le nouveau nom dénormalisé sur tous les
`Event.visitingTeamName` qui référencent cette équipe. Si le process/la connexion DB échoue entre
les deux appels, le nom canonique de la `Team` change mais les copies dénormalisées sur les
`Event` restent périmées — incohérence durable jusqu'à un futur renommage sans lien.

## Cause racine

Les deux écritures auraient dû être groupées dans `prisma.$transaction([...])`, comme c'est déjà le
cas pour `setDefault()` dans `PredictVersionsService` (voir BUG-65) — le pattern existe déjà dans le
même module, juste pas appliqué ici.

## Correction

`updateTeam` regroupe désormais `team.update()` et le `event.updateMany()` conditionnel dans un seul
`prisma.$transaction([...])`.

## Risque de régression / à surveiller

Vérifier qu'un renommage d'équipe sans events rattachés (updateMany sur 0 ligne) fonctionne toujours
dans la transaction, et que le retour de la méthode reste bien l'objet `Team` mis à jour.

## Références

- `docs/modules/07_EVENEMENTS.md`
