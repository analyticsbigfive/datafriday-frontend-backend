# BUG-104 — Sync par job (bissection) échoue systématiquement : `organizationId manquant`

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (Weezevent — mécanisme B, sync par job/bissection)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-07-20, en test manuel dans le navigateur sur `/data-integration/fb`
  (screenshot d'un job "Aix Arena" échouant immédiatement avec ce message)
- **Fichiers** : `src/features/weezevent/services/weezevent-collect-worker.service.ts:29-40`

## Symptôme

Toute synchronisation lancée avec des dates "From"/"Until" renseignées (route vers le mécanisme de
sync par job / bissection) échoue **immédiatement**, phase 1 ("Collecte") toujours à 0 transactions,
avec le message : `organizationId manquant pour l'intégration <id>`. Reproductible sur **100% des
intégrations Weezevent**, quelle que soit leur configuration — ce n'est pas propre à une intégration
mal configurée.

## Cause racine

`WeezeventCollectWorkerService.start()` lisait `job.integration.organizationId` directement, en
n'incluant que la relation `integration: true` (sans sa relation imbriquée `weezevent`) :

```ts
include: { integration: true },
...
const organizationId = (job as any).integration.organizationId as string | null;
```

Or `organizationId` n'existe **plus** sur le modèle `Integration` depuis la migration de schéma
décrite dans `PLAN_INTEGRATION_DIGIFOOD` — il vit exclusivement sur la table 1-1
`WeezeventIntegrationConfig.organizationId` (`schema.prisma:272-280`). Le cast `(job as any)` est
le signe révélateur : sans lui, TypeScript aurait rejeté la compilation (`organizationId` n'existe
pas sur le type `Integration`) — le cast faisait taire l'erreur et laissait le bug planter
silencieusement au runtime à chaque exécution.

Vérifié que ce bug est **isolé à ce fichier** : `WeezeventIncrementalSyncService` (mécanisme A,
sync legacy sans dates) résout correctement `organizationId` partout via
`integration.weezevent.organizationId` (`weezevent-incremental-sync.service.ts:373-385,609`) — la
sync legacy (dates vides) n'est pas affectée par ce bug.

## Correction

`include: { integration: { include: { weezevent: true } } }`, puis lecture via
`job.integration.weezevent?.organizationId ?? null` — plus de cast `any`, TypeScript vérifie
maintenant le chemin d'accès.

## Risque de régression / à surveiller

- Nécessite un redémarrage du serveur backend pour prendre effet (pas de hot-reload en prod).
- Tous les jobs `WeezeventSyncJob` bloqués en `COLLECTING`/`INSERTING` avant ce fix, créés lors de
  tentatives de sync par job antérieures, sont des jobs orphelins qui ne se termineront jamais
  d'eux-mêmes (ils ont échoué avant ce fix). Voir `frontend/docs/bugs/195_...md`/196/204 (audit
  frontend du même jour) — le frontend permet maintenant de les annuler/supprimer manuellement
  depuis l'historique (bouton visible, garde de 2 min déjà présente côté
  `DELETE sync/jobs/:jobId`).
- Vérifier manuellement : lancer une sync avec dates renseignées sur une intégration réelle,
  confirmer que la phase 1 progresse au-delà de 0 transactions.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (Piège n°2, mécanisme B — sync par job).
- `frontend/docs/bugs/195,196,204,206_*.md` — audit frontend du même jour sur les jobs bloqués/UI
  de sync, découvert en creusant ce même symptôme.
