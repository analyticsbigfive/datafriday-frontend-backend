import * as Joi from 'joi';

/**
 * Schéma unique des variables d'environnement, partagé par l'API (main.ts) et le
 * worker (worker.ts). Un process qui démarre avec une configuration invalide
 * s'arrête immédiatement avec la liste complète des erreurs.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  DATABASE_URL: Joi.string().required(),
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  JWT_SECRET: Joi.string().required(),
  // Accès invité PIN (managers PDV sans compte, cf. GuestPinAccessModule). Secrets
  // DÉDIÉS, jamais partagés avec JWT_SECRET (celui-ci vérifie les tokens Supabase).
  // Requis aussi par le worker : le cron de clôture des fenêtres passe par GuestPinAccessModule.
  GUEST_PIN_JWT_SECRET: Joi.string().required(),
  GUEST_PIN_HMAC_SECRET: Joi.string().required(),
  GUEST_PIN_JWT_TTL: Joi.string().default('1d'),
  REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
  // Redis des files BullMQ. Doit être IDENTIQUE dans l'API (producteur) et le worker
  // (consommateur), sinon le worker ne voit aucun job.
  REDIS_QUEUE_URL: Joi.string().uri().optional(),
  PORT: Joi.number().default(3000),
  // Rate limiting (par tenant, cf. TenantThrottlerGuard) : 3 paliers indépendants,
  // chacun surchargeable via env sans redéploiement de code.
  RATE_LIMIT_SHORT_TTL: Joi.number().default(1000),
  RATE_LIMIT_SHORT_MAX: Joi.number().default(20),
  RATE_LIMIT_MEDIUM_TTL: Joi.number().default(60000),
  RATE_LIMIT_MEDIUM_MAX: Joi.number().default(300),
  RATE_LIMIT_LONG_TTL: Joi.number().default(3600000),
  RATE_LIMIT_LONG_MAX: Joi.number().default(5000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  PRISMA_SLOW_QUERY_MS: Joi.number().min(0).optional(),
  WEEZEVENT_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).default(15000),
  WEEZEVENT_BREAKER_THRESHOLD: Joi.number().min(1).max(100).default(50),
  WEEZEVENT_BREAKER_RESET_MS: Joi.number().integer().min(1000).default(30000),
  WEEZEVENT_COLLECT_CONCURRENCY: Joi.number().integer().min(1).max(50).default(5),
  // Cadence du live sync (live-sync-cadence.ts) : valeurs absentes = défauts du code.
  LIVE_SYNC_INTERVAL_SEC: Joi.number().positive().optional(),
  LIVE_SYNC_INTERVAL_WEBHOOK_SEC: Joi.number().positive().optional(),
  LIVE_SYNC_INTERVAL_RATE_LIMITED_SEC: Joi.number().positive().optional(),
  IDLE_SYNC_INTERVAL_SEC: Joi.number().positive().optional(),
  LIVE_SYNC_QUIET_AFTER_MIN: Joi.number().positive().optional(),
  LIVE_SYNC_INTERVAL_QUIET_SEC: Joi.number().positive().optional(),
  // Requête sur un modèle tenant hors de tout contexte : `strict` lève une erreur,
  // `warn` la journalise (premier déploiement, pour repérer un chemin oublié).
  TENANT_SCOPE_MODE: Joi.string().valid('strict', 'warn').default('strict'),
  // Repli si aucun worker n'est déployé : l'API consomme alors les jobs et exécute les
  // crons. Ne JAMAIS activer quand un worker tourne (double consommation).
  BACKGROUND_JOBS_IN_API: Joi.boolean().default(false),
});
