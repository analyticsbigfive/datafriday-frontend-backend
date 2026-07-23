# BUG-028 — markTransactionAsDeleted ne fait rien de réel malgré son nom

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🟡 Faible
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `webhook-event.handler.ts` (`markTransactionAsDeleted`), `schema.prisma`
  (`SalesTransaction.deletedAt`), `aggregation.service.ts` (2 requêtes),
  `weezevent-analytics.controller.ts` (4 endpoints), `weezevent.controller.ts` (`getTransactions`)

## Symptôme

Les transactions supprimées côté Weezevent restent visibles côté Data Friday.

## Cause racine

La méthode `markTransactionAsDeleted` se contentait de mettre à jour `syncedAt` — elle ne marquait
réellement rien comme supprimé malgré son nom. `SalesTransaction` n'avait par ailleurs aucun champ
`deletedAt`/`isDeleted` pour porter cette information. Découverte annexe en creusant : l'agrégation
ne filtrait déjà par aucun statut de transaction Weezevent (remboursée/annulée comptée pareil qu'une
vente valide) — un problème plus large que ce seul ticket, non traité ici (nécessiterait de
statuer sur la sémantique de chaque statut Weezevent, hors périmètre).

## Correction

- Ajout de `SalesTransaction.deletedAt DateTime?` (+ index) au schéma, appliqué via `ALTER TABLE`
  (comme BUG-104/105 : `prisma migrate dev`/`db push` restent bloqués par un drift de schéma
  préexistant sans rapport).
- `markTransactionAsDeleted` renseigne maintenant `deletedAt` (en plus de `syncedAt`), avec un
  guard `deletedAt: null` dans le `where` pour rester idempotent sur un retry webhook.
- `deletedAt IS NULL` ajouté aux 2 requêtes SQL d'agrégation (`SpaceRevenueMinuteAgg` et
  `SpaceProductRevenueDailyAgg`) — une transaction supprimée n'est plus comptée dans le CA d'un
  event déjà traité (un "Re-traiter" suffit à répercuter la suppression, même design idempotent que
  BUG-014/015/019).
- `deletedAt: null` ajouté aux 4 endpoints de `weezevent-analytics.controller.ts` qui calculent des
  métriques de vente directement depuis `SalesTransaction` (même classe de défaut que
  l'agrégation, mais un chemin de calcul parallèle qui l'aurait reproduit silencieusement) et à
  `GET /weezevent/transactions` (listing principal, le endpoint le plus directement concerné par le
  symptôme).

## Risque de régression / à surveiller

- `GET /weezevent/transactions/:id` (lookup direct par id) n'exclut volontairement pas les
  transactions supprimées — un soft-delete reste consultable si on connaît déjà son id (usage
  support/debug), seul le listing par défaut les masque.
- Tests ajoutés (`webhook-event.handler.spec.ts`) : vérifie que `updateMany` reçoit bien
  `deletedAt`/`syncedAt` sur le webhook `delete`, et que `syncSingleTransaction` n'est pas appelé
  dans ce cas. Tests existants de `weezevent-analytics.controller.spec.ts` mis à jour pour le
  nouveau filtre.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #4
