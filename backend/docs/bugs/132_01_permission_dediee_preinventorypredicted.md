# BUG-132-01 — RBAC : permission dédiée `front.fb.preInventoryPredicted` (chip « Besoin prédit »)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur (RBAC)
- **Domaine** : RBAC / Stock & inventaire
- **Découvert le** : 2026-08-19 (réunion Bertrand)
- **Fichiers** : `src/core/rbac/permission-catalog.ts`

## Symptôme

Réunion Bertrand 19/08 : « le champ Predicted est réservé aux administrateurs et aux directeurs
de site ». Le chip « Besoin prédit » (Event Predict) du Pre-event Inventory était gaté par
`front.fb.preInventoryExpected`, détenue aussi par **Chef exécutif** (catalogue système) — il
voyait donc le prédit alors que la demande l'exclut.

## Correction

- Nouvelle permission `front.fb.preInventoryPredicted` dans `SYSTEM_PERMISSIONS`, attribuée au
  rôle **Directeur de site** (ADMIN l'a via `ALL_CODES`). Chef exécutif exclu volontairement.
- **Aucun SQL de rattrapage** : `ensureSystemPermissionCatalog` propage automatiquement un code
  neuf aux tenants existants sans écraser les personnalisations (commentaire du catalogue,
  réf. BUG-038).
- Gating d'**affichage** côté frontend (`canSeePredicted`, fiche web BUG-343-01) : la donnée
  vient de `GET /event-predict` versions, endpoint partagé avec l'écran Event Predict
  (`front.fb.eventPredict`) — pas de gating serveur dédié possible sans le casser.

## Risque

Chef exécutif perd le chip au déploiement (voulu — il garde les attendus). Réversible par une
ligne dans le rôle, propagation automatique.

## Références

Fiche web BUG-343-01 ; Q59 (`frontend/docs/QUESTIONS_A_BERTRAND.md`).

JLH
