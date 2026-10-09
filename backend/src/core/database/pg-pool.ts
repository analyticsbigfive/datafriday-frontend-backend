import { Pool } from 'pg';

/** Taille du pool sans `connection_limit` dans l'URL. */
export const DEFAULT_POOL_MAX = 10;

/**
 * Attente maximale d'une connexion libre. Sans borne (défaut de `pg` : 0), une requête
 * attend indéfiniment quand tout le pool est occupé ou que le pooler Supabase refuse de
 * nouveaux clients (EMAXCONNSESSION, 2026-10-09) : les requêtes s'empilent au lieu
 * d'échouer avec une erreur lisible.
 */
export const POOL_CONNECTION_TIMEOUT_MS = 10_000;

/** Taille du pool : `connection_limit` de l'URL (gardé pour la compatibilité Prisma), sinon défaut. */
export function poolMaxFromUrl(url: string): number {
  try {
    const limit = Number(new URL(url).searchParams.get('connection_limit'));
    return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_POOL_MAX;
  } catch {
    // URL absente/invalide : $connect échouera avec un vrai message d'erreur.
    return DEFAULT_POOL_MAX;
  }
}

/**
 * Pool node-postgres de PrismaService (driver adapter).
 *
 * Gestionnaire `error` obligatoire : quand le pooler coupe une connexion INACTIVE
 * (saturation, redémarrage de Supavisor, coupure réseau), `pg` émet `error` sur le pool.
 * Sans écouteur, Node arrête le processus (API ou worker). La connexion fautive est
 * déjà retirée du pool par `pg` : la prochaine requête en ouvre une neuve.
 */
export function buildPgPool(url: string, onIdleError: (err: Error) => void): Pool {
  const pool = new Pool({
    connectionString: url,
    max: poolMaxFromUrl(url),
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
  });
  pool.on('error', (err) => onIdleError(err));
  return pool;
}
