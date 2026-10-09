# Déploiement de la remédiation backend (branche `chore/backend-remediation-v2`)

État au 2026-10-09 : base de production déjà migrée (20261009140000, 150000 et 160000, aucune donnée
effacée), code de la branche non déployé. Render : un seul service, `datafriday-backend` (web), pas de
worker. Le code actuellement en production exécute crons et files dans l'API ; la branche les déplace
dans un worker dédié (`node dist/worker`).

À faire hors match : entre le déploiement de l'API et le démarrage du worker, aucun cron ne tourne
(cycle d'inventaire, clôture des PIN, envoi vers Logistic, synchro Weezevent).

## 1. Groupe de variables (Render, Env Groups)

Créer le groupe `datafriday-backend-env` avec **toutes** les variables actuelles de
`datafriday-backend` (onglet Environment), sauf `PORT`, puis :

| Variable | Valeur |
|---|---|
| `REDIS_QUEUE_URL` | si absente : la même valeur que `REDIS_URL` |
| `TENANT_SCOPE_MODE` | `warn` (passer à `strict` une fois les journaux propres) |
| `GUEST_PIN_JWT_SECRET`, `GUEST_PIN_HMAC_SECRET` | déjà présentes sur l'API, à reprendre telles quelles |

Retirer les variables devenues sans effet : `WEEZEVENT_CRON_ENABLED`, `INVENTORY_LIVE_INIT_CRON_ENABLED`,
`INVENTORY_CYCLE_CRON_ENABLED`, `INVENTORY_LOGISTIC_SYNC_CRON_ENABLED`,
`INVENTORY_WINDOW_LIFECYCLE_CRON_ENABLED`.

## 2. Service API `datafriday-backend`

- Lier le groupe `datafriday-backend-env` ; garder en propre `PORT` et ajouter
  `BACKGROUND_JOBS_IN_API=false` (sans effet tant que l'ancien code tourne).
- Settings, Start Command : `node dist/main`, sans `prisma migrate deploy` (ADR-0002).

## 3. Déployer le code

Fusionner `chore/backend-remediation-v2` dans la branche suivie par `datafriday-backend` (Settings,
Build & Deploy, Branch). Le déploiement automatique reconstruit l'API.

## 4. Créer le worker `datafriday-worker` (New, Background Worker)

| Champ | Valeur |
|---|---|
| Dépôt et branche | les mêmes que `datafriday-backend` |
| Root Directory | `backend` |
| Runtime, région | Node, Frankfurt |
| Build Command | `npm install -g pnpm@10 && pnpm install --frozen-lockfile && npx prisma generate && npx @nestjs/cli build` |
| Start Command | `node dist/worker` |
| Instance | Starter suffit (une seule instance : les crons ne se partagent pas entre instances) |
| Environment | lier le groupe `datafriday-backend-env` |

## 5. Vérifier

- Worker, onglet Logs : `✅ BullMQ worker started — waiting for jobs`, puis chaque minute des lignes
  `[InventoryCycleCronService]` et `[InventoryWindowLifecycleCronService]`.
- API : `/api/v1/health` répond 200 ; aucun `[tenant-scope]` dans les journaux (sinon le signaler avant
  de passer en `strict`).
- `/api/v1/metrics/queues` : les files se vident (jobs `completed`), aucune ne s'accumule en `waiting`.

## Retour arrière

Mettre `BACKGROUND_JOBS_IN_API=true` sur l'API et suspendre le worker : l'API reprend crons et files.
Pour revenir à l'ancien code, redéployer le commit précédent de la branche suivie ; la base migrée
reste compatible avec lui (vérifié : son `prisma migrate deploy` ne trouve rien à appliquer).
