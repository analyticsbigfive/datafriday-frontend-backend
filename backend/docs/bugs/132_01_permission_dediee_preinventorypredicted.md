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
- ~~**Aucun SQL de rattrapage** : `ensureSystemPermissionCatalog` propage automatiquement un code
  neuf aux tenants existants sans écraser les personnalisations (commentaire du catalogue,
  réf. BUG-038).~~ **Correctif 2026-08-20 (BUG-134-01)** : cette promesse était fausse en
  pratique — `ensureSystemPermissionCatalog` n'était appelée QUE par `prisma/seed.ts`,
  `prisma/backfill-rbac.ts` (scripts manuels) et l'onboarding des NOUVEAUX tenants ; rien ne
  l'exécutait au déploiement (vérifié en base dev le 20/08 : 0 ligne `preInventoryPredicted`,
  tous tenants). Désormais `RbacCatalogSyncService` (`src/core/rbac/rbac-catalog-sync.service.ts`,
  hébergé par `PermissionsModule`) rejoue le catalogue à chaque boot du backend, sous
  `pg_advisory_xact_lock` (multi-instances), échec loggé non bloquant. La propagation reste sûre :
  seuls les codes nouvellement créés sont accordés aux rôles existants.
- Gating d'**affichage** côté frontend (`canSeePredicted`, fiche web BUG-343-01) : la donnée
  vient de `GET /event-predict` versions, endpoint partagé avec l'écran Event Predict
  (`front.fb.eventPredict`) — pas de gating serveur dédié possible sans le casser.

## Risque

Chef exécutif perd le chip au déploiement (voulu — il garde les attendus). Réversible par une
ligne dans le rôle, propagation automatique.

## Références

Fiche web BUG-343-01 ; Q59 (`frontend/docs/QUESTIONS_A_BERTRAND.md`).

JLH
