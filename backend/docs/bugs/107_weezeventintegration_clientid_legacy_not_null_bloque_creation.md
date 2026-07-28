# BUG-107 — `WeezeventIntegration.clientId`/`clientSecret` legacy NOT NULL bloque toute création d'instance

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business (empêchait toute création de nouvelle intégration
  Weezevent OU Digifood sur cette base)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-21, en testant end-to-end le fix de BUG-106 (webhook par intégration)
- **Corrigé le** : 2026-07-21
- **Fichiers** : `prisma/schema.prisma` (`model Integration`, `@@map("WeezeventIntegration")`) ;
  `src/features/integrations/services/weezevent-integration.service.ts` (`createInstance`) ;
  `src/features/integrations/services/digifood-integration.service.ts` (`createInstance`) ;
  migration `prisma/migrations/20260710120000_digifood_integration_provider/migration.sql`
  (commentaire "drop différé") ; fix :
  `prisma/migrations/20260721220000_weezeventintegration_drop_legacy_notnull/migration.sql`

## Symptôme

`POST .../weezevent/instances` (et probablement `.../digifood/instances`, même table sous-jacente)
échoue avec une erreur Prisma `P2011` (`Null constraint violation on the fields: (clientId)`) sur
la base pointée par `backend/.env` — reproduit en essayant de créer une intégration de test via
`prisma.integration.create({ data: { tenantId, provider, name, enabled, weezevent: { create: {...} } } })`,
exactement l'appel que fait `WeezeventIntegrationService.createInstance()` en production.

## Cause racine

La table physique `WeezeventIntegration` (mappée par le modèle Prisma `Integration`) a encore ses
colonnes historiques `clientId`/`clientSecret` en `NOT NULL` sans `DEFAULT` :

```
 clientId       | text | not null |
 clientSecret   | text | not null |
```

La migration `20260710120000_digifood_integration_provider` (introduction de
`WeezeventIntegrationConfig`/`DigifoodIntegrationConfig`, détail 1-1 par provider) a
délibérément laissé ces colonnes en place, backfillées mais **gelées** :

> "Les colonnes clientId/clientSecret/organizationId de WeezeventIntegration restent
> physiquement en place (gelées, hors modèle Prisma après l'étape 2) — drop différé."

Le modèle Prisma `Integration` actuel ne déclare plus `clientId`/`clientSecret` du tout (ils sont
sur `WeezeventIntegrationConfig`/`DigifoodIntegrationConfig`) — donc tout `INSERT` généré par
Prisma sur `WeezeventIntegration` ne fournit plus ces colonnes, alors que la contrainte `NOT NULL`
existe toujours en base. Le "drop différé" annoncé dans le commentaire n'a jamais été fait (aucune
migration ultérieure ne touche ces colonnes — vérifié sur tout `prisma/migrations/`).

Les intégrations créées **avant** cette migration ont ces colonnes déjà remplies (backfill), donc
`updateInstance`/`getConfig`/etc. sur une intégration existante fonctionnent normalement — seul le
chemin de **création** d'une intégration toute neuve est cassé.

## Correction

**Corrigée le 2026-07-21**, après confirmation par reproduction du symptôme avec des données
réalistes (voir Vérification) — d'abord signalée comme hors scope de la session qui l'a découverte
(fix BUG-021/BUG-106), corrigée dans la foulée sur demande explicite après démonstration du bug.

- Vérifié avant fix (lecture seule, `grep` sur `src/`) : aucun code ne lit/écrit plus
  `WeezeventIntegration.clientId`/`clientSecret` directement — seuls
  `WeezeventIntegrationConfig.clientId/clientSecret` (Weezevent) et
  `DigifoodIntegrationConfig.webhookSecret` (Digifood) sont utilisés aujourd'hui. Rendre les
  colonnes legacy nullable ne casse donc rien de lu actuellement.
- Migration manuelle (même contrainte `P3006` shadow DB que les migrations précédentes de cette
  session, cf. BUG-70) :
  `prisma/migrations/20260721220000_weezeventintegration_drop_legacy_notnull/migration.sql` —
  `ALTER TABLE "WeezeventIntegration" ALTER COLUMN "clientId" DROP NOT NULL, ALTER COLUMN
  "clientSecret" DROP NOT NULL;`. Complète le "drop différé" annoncé dans la migration
  `20260710120000_digifood_integration_provider` sans aller jusqu'au `DROP COLUMN` (les valeurs
  historiques backfillées restent en place par prudence — un vrai `DROP COLUMN` pourra suivre une
  fois confirmé qu'aucun outil externe n'en dépend).
- Déployée via `prisma migrate deploy` sur autorisation explicite de l'utilisateur, contre la base
  pointée par `backend/.env` ([ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)).

### Vérification

Reproduit puis re-testé en appelant directement `WeezeventIntegrationService.createInstance()`
(le vrai code de production, pas un mock) avec des valeurs réalistes (`name`, `clientId`,
`clientSecret`, `organizationId` — exactement les 4 champs du formulaire "Configure Weezevent"),
sur un tenant de test jetable créé puis supprimé après coup :
- **Avant fix** : `P2011 Null constraint violation on the fields: (clientId)`.
- **Après fix** : création réussie, `listInstances()` retourne bien la nouvelle instance.

## Risque de régression / à surveiller

Aucun identifié : les colonnes legacy restent en base (juste non-bloquantes), aucun code ne les lit.
À surveiller si un outil externe (export, requête ad hoc) dépendait silencieusement de leur
présence `NOT NULL` — aucun trouvé lors de la vérification.

## Références

- BUG-025 (`25_weezevent_multi_instance_auth_croisee.md`) — introduit le modèle multi-instance dont
  cette table est le support physique.
- BUG-106 (`106_webhook_secret_tenant_global_pas_par_integration.md`) — découverte faite en testant
  ce fix end-to-end.
