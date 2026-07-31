# BUG-123-02 — Weezevent : `organizationId` manquant fait échouer le cron de sync indéfiniment (log error toutes les 10 min) + un PATCH pouvait le vider silencieusement

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-31, log de production :
  `Error: Weezevent organizationId not configured for integration cmrho4imk000hb3s6e9nnc5eq`,
  levée dans `WeezeventIncrementalSyncService.getIntegrationConfig`, remontée via
  `syncTransactionsIncremental` → `WeezeventCronService.syncRecentTransactions`, loggée en
  `error` (`"Transactions sync failed"`).
- **Fichiers** :
  - `src/features/weezevent/services/weezevent-cron.service.ts` (`syncRecentTransactions`,
    `syncReferenceData`, `fullHistoricalSync` — requêtes `integration.findMany`)
  - `src/features/weezevent/services/weezevent-incremental-sync.service.ts`
    (`getIntegrationConfig`, throw ligne 384)
  - `src/features/integrations/dto/weezevent-instance.dto.ts`
    (`UpdateWeezeventInstanceDto.organizationId`)
  - `src/features/integrations/services/weezevent-integration.service.ts` (`updateInstance`)
  - `prisma/schema.prisma:271` (`WeezeventIntegrationConfig.organizationId`, nullable)

## Symptôme

Le cron `syncRecentTransactions` (toutes les 10 minutes, `@Cron(CronExpression.EVERY_10_MINUTES)`)
échoue systématiquement pour l'intégration `cmrho4imk000hb3s6e9nnc5eq` avec
`"Weezevent organizationId not configured for integration ..."`, loggé en `error` à chaque
passage — soit ~144 fois/jour, sans jamais se résoudre seul.

## Cause racine

Deux causes combinées :

1. **Aucun garde-fou au niveau des crons.** `WeezeventCronService` récupère les intégrations à
   syncer avec `integration.findMany({ where: { tenantId, enabled: true, provider: 'WEEZEVENT' } })`
   dans ses 3 méthodes (`syncRecentTransactions`, `syncReferenceData`, `fullHistoricalSync`) — sans
   filtrer celles dont la config Weezevent (`organizationId`) est incomplète. `getIntegrationConfig`
   (`weezevent-incremental-sync.service.ts:369-388`) est le seul point qui vérifie
   `integration.weezevent?.organizationId` et jette si absent (ligne 384) — mais seulement une fois
   le sync déjà lancé, à chaque tentative.
2. **Le DTO de mise à jour laissait passer un vidage silencieux.** `organizationId` est nullable en
   base (`WeezeventIntegrationConfig.organizationId String?`, `schema.prisma:271`) — cohérent avec
   le fait qu'une intégration existe en base avant d'être entièrement configurée. Mais
   `CreateWeezeventInstanceDto.organizationId` est obligatoire (`@IsString() @MinLength(1)`), donc
   en théorie toujours rempli à la création. Le problème vient de la mise à jour :
   `UpdateWeezeventInstanceDto.organizationId` (`weezevent-instance.dto.ts`) était
   `@IsOptional() @IsString()` **sans** `@MinLength(1)` — contrairement à `name`, `clientId` et
   `clientSecret` du même DTO, qui ont tous `@MinLength(1)`. Un PATCH avec `organizationId: ''`
   passait donc la validation, et `updateInstance()`
   (`weezevent-integration.service.ts:152-153`) fait
   `configData.organizationId = dto.organizationId?.trim() || null` — vidant silencieusement une
   valeur existante en base, sans erreur ni avertissement.

Je n'ai pas pu confirmer laquelle des deux causes explique concrètement comment
`cmrho4imk000hb3s6e9nnc5eq` s'est retrouvée sans `organizationId` (vidée via ce chemin, ou
incomplète depuis un autre moyen — script, migration, insertion manuelle) — seule la classe de bug
est corrigée ici, pas l'historique de ce cas précis.

## Correction

1. `UpdateWeezeventInstanceDto.organizationId` : ajout de `@MinLength(1)`, alignée sur ses voisins
   du même DTO — un PATCH ne peut plus vider silencieusement `organizationId` avec une chaîne vide.
2. `WeezeventCronService` : ajout du filtre `weezevent: { organizationId: { not: null } }` dans le
   `where` des 3 requêtes `integration.findMany` (`syncRecentTransactions`, `syncReferenceData`,
   `fullHistoricalSync`) — les intégrations incomplètes sont désormais exclues du cron au lieu de
   tenter un sync voué à l'échec, et re-échouer, à chaque passage.

## Risque de régression / à surveiller

- **Donnée existante non corrigée** : l'intégration `cmrho4imk000hb3s6e9nnc5eq` a toujours
  `organizationId` vide en base après ce fix — le correctif l'empêche seulement de spammer les
  logs et de retenter un sync inutile. Reste à décider côté produit/ops : renseigner manuellement
  son `organizationId` (PATCH une fois la vraie valeur connue), ou désactiver cette intégration si
  elle n'est plus utilisée. Je n'ai pas touché aux données de production moi-même — hors scope
  d'un fix de code, à valider explicitement avant toute modification de données existantes.
- Après déploiement, vérifier que les logs cron ne remontent plus cette erreur pour les
  intégrations désormais filtrées — et confirmer avec l'équipe si `cmrho4imk...` doit rester
  active (auquel cas son `organizationId` doit être renseigné) ou être désactivée.
- Le manual trigger (`WeezeventCronService.triggerSync`, utilisé pour les tests/debug) n'a
  volontairement pas ce filtre — un appel manuel explicite sur une intégration précise doit
  continuer à remonter l'erreur telle quelle (feedback utile pour du debug interactif).
- Pas de test unitaire ajouté (pas de suite de tests existante trouvée pour `WeezeventCronService`
  ni pour cette portion de `weezevent-integration.service.ts` dans le temps imparti) — à couvrir
  si cette zone est retouchée.

## Références

- Aucun bug existant trouvé sur ce sujet précis.
