# Déploiement de la remédiation backend (branche `chore/backend-remediation-v2`)

État au 2026-10-09 : base de production déjà migrée (20261009140000, 150000 et 160000, aucune donnée
effacée), code de la branche non déployé. Render (offre pro) : un seul service, `datafriday-backend` (web,
branche `staging`), pas de worker. Le code actuellement en production exécute crons et files dans l'API ; la branche les déplace
dans un worker dédié (`node dist/worker`).

À faire hors match : entre le déploiement de l'API et le démarrage du worker, aucun cron ne tourne
(cycle d'inventaire, clôture des PIN, envoi vers Logistic, synchro Weezevent).

## 1. Variables de l'API `datafriday-backend`

Ajouter `BACKGROUND_JOBS_IN_API=false` et `TENANT_SCOPE_MODE=warn` (sans effet tant que l'ancien code
tourne). `REDIS_QUEUE_URL` est déjà présente et égale à `REDIS_URL`.

## 2. Déployer le code

Fusionner `chore/backend-remediation-v2` dans `develop`, puis `develop` dans `staging` : Render déploie
automatiquement `staging` sur `datafriday-backend`. Sa commande de démarrage applique les migrations ;
il n'y en a aucune en attente (base de production déjà migrée).

## 3. Créer le worker `datafriday-worker` (Background Worker)

| Champ | Valeur |
|---|---|
| Dépôt et branche | les mêmes que `datafriday-backend` (`staging`) |
| Root Directory | `backend` |
| Runtime, région | Node, Frankfurt |
| Build Command | `npm install -g pnpm@10 && pnpm install --frozen-lockfile && npx prisma generate && npx @nestjs/cli build` |
| Start Command | `node dist/worker` (jamais de migration ici) |
| Instance | Starter, une seule instance (les crons ne se partagent pas entre instances) |
| Environment | copie des variables de l'API, sauf `PORT`, `DOCS_USER`, `DOCS_PASSWORD` |

Toute variable modifiée ensuite sur l'API doit l'être aussi sur le worker.

## 4. Vérifier

- Worker, onglet Logs : `✅ BullMQ worker started — waiting for jobs`, puis chaque minute des lignes
  `[InventoryCycleCronService]` et `[InventoryWindowLifecycleCronService]`.
- API : `/api/v1/health` répond 200 ; aucun `[tenant-scope]` dans les journaux (sinon le signaler avant
  de passer en `strict`).
- `/api/v1/metrics/queues` : les files se vident (jobs `completed`), aucune ne s'accumule en `waiting`.

## Retour arrière

Mettre `BACKGROUND_JOBS_IN_API=true` sur l'API et suspendre le worker : l'API reprend crons et files.
Pour revenir à l'ancien code, redéployer sur Render le commit précédent de `staging` ; la base migrée
reste compatible avec lui (vérifié : son `prisma migrate deploy` ne trouve rien à appliquer).
