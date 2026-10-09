import { buildPgPool, poolMaxFromUrl, DEFAULT_POOL_MAX, POOL_CONNECTION_TIMEOUT_MS } from './pg-pool';

/** Pool de PrismaService : taille, attente maximale, erreurs de connexion inactive (2026-10-09). */
describe('buildPgPool', () => {
  const url = 'postgresql://u:p@localhost:6543/postgres?pgbouncer=true&connection_limit=7';

  it('taille du pool : connection_limit de l’URL, sinon défaut', () => {
    expect(poolMaxFromUrl(url)).toBe(7);
    expect(poolMaxFromUrl('postgresql://u:p@localhost:5432/postgres')).toBe(DEFAULT_POOL_MAX);
    expect(poolMaxFromUrl('postgresql://u:p@localhost/db?connection_limit=0')).toBe(DEFAULT_POOL_MAX);
    expect(poolMaxFromUrl('pas une url')).toBe(DEFAULT_POOL_MAX);
  });

  it('attente bornée et erreur d’une connexion inactive remontée au journal, sans arrêter le processus', async () => {
    const onIdleError = jest.fn();
    const pool = buildPgPool(url, onIdleError);
    try {
      expect(pool.options.max).toBe(7);
      expect(pool.options.connectionTimeoutMillis).toBe(POOL_CONNECTION_TIMEOUT_MS);
      // Sans écouteur, `emit('error')` lèverait ici (et arrêterait Node en production).
      expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
      expect(onIdleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Connection terminated unexpectedly' }));
    } finally {
      await pool.end();
    }
  });
});
