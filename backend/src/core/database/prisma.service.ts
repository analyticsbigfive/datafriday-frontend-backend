import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ClsService } from 'nestjs-cls';
import {
  BYPASS_TENANT_KEY,
  TENANT_ID_KEY,
} from '../tenant/tenant-context.constants';
import {
  applyTenantScope,
  buildTenantScopedModelSet,
} from './tenant-scope.util';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Pool node-postgres derrière le driver adapter (previewFeatures driverAdapters).
   *
   * Pourquoi : le moteur natif Prisma + pooler transaction (6543) exige
   * `pgbouncer=true`, qui enveloppe CHAQUE requête dans
   * BEGIN → DEALLOCATE ALL → requête → COMMIT, soit 3 round-trips perdus par
   * requête (~360ms/requête en dev, mesuré). node-postgres utilise des prepared
   * statements NON nommés, sûrs en pooling transaction : 1 requête = 1 round-trip.
   * Vérifié contre Supavisor : sans adapter ni flag, la concurrence casse
   * (« prepared statement s34 does not exist »).
   *
   * `pgbouncer=true`/`connection_limit` peuvent rester dans DATABASE_URL : pg les
   * ignore (et le CLI prisma, qui n'utilise pas l'adapter, passe par DIRECT_URL
   * pour les migrations). La taille du pool reprend `connection_limit` de l'URL.
   */
  private static buildPool(): Pool {
    const url = process.env.DATABASE_URL || '';
    let max = 10;
    try {
      const limit = new URL(url).searchParams.get('connection_limit');
      if (limit && Number(limit) > 0) max = Number(limit);
    } catch {
      /* URL absente/invalide : $connect échouera avec un vrai message d'erreur */
    }
    return new Pool({ connectionString: url, max });
  }

  private readonly pool: Pool;

  /**
   * Models that carry a REQUIRED `tenantId` scalar — the ones eligible for
   * automatic tenant scoping. Derived from the Prisma DMMF so it stays in sync
   * with the schema. Models with a nullable tenantId (e.g. Permission, whose
   * system catalog rows have tenantId = null) are intentionally excluded.
   */
  private readonly tenantScopedModels: Set<string> = buildTenantScopedModelSet(
    Prisma.dmmf.datamodel.models as any,
  );

  constructor(private readonly cls: ClsService) {
    const pool = PrismaService.buildPool();
    super({
      adapter: new PrismaPg(pool),
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'colorless',
    });
    this.pool = pool;

    const slowQueryThresholdMs = Number(
      process.env.PRISMA_SLOW_QUERY_MS ||
        (process.env.NODE_ENV === 'production' ? 500 : 0),
    );

    // Log queries:
    //  - en développement: tout (debug)
    //  - en production: uniquement les requêtes lentes (> seuil) en warn
    this.$on('query' as never, (e: any) => {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`Query: ${e.query} | Params: ${e.params} | ${e.duration}ms`);
        return;
      }
      if (slowQueryThresholdMs > 0 && e.duration >= slowQueryThresholdMs) {
        this.logger.warn(`SLOW QUERY (${e.duration}ms): ${e.query}`);
      }
    });

    // Log errors
    this.$on('error' as never, (e: any) => {
      this.logger.error(`Prisma Error: ${e.message}`, e.target);
    });

    this.registerTenantScopeMiddleware();
  }

  /**
   * Automatic multi-tenant isolation.
   *
   * Injects `tenantId` into the WHERE clause (reads/updates/deletes) and into
   * `data` (creates) for every tenant-scoped model, using the tenant resolved
   * for the current request (CLS).
   *
   * No-ops when:
   *  - there is no active request context (background jobs, seeds, webhooks);
   *  - scoping is explicitly bypassed (TenantContextService.runWithoutTenantScope);
   *  - the model is not tenant-scoped;
   *  - the caller already constrained `tenantId` (we never override it).
   *
   * Relies on Prisma 5 "extended where unique": adding a `tenantId` scalar
   * filter alongside a unique selector is valid for findUnique/update/delete,
   * so we never need to rewrite the query action.
   */
  private registerTenantScopeMiddleware(): void {
    this.$use(async (params, next) => {
      const model = params.model;

      const hasContext = this.cls?.isActive?.() ?? false;
      const bypass = hasContext
        ? this.cls.get<boolean>(BYPASS_TENANT_KEY) === true
        : true;
      const tenantId = hasContext
        ? this.cls.get<string | undefined>(TENANT_ID_KEY)
        : undefined;

      if (!model || bypass || !tenantId || !this.tenantScopedModels.has(model)) {
        return next(params);
      }

      applyTenantScope(params, tenantId);
      return next(params);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      // Avec le driver adapter, $connect est paresseux : un vrai ping est requis
      // pour conserver la sémantique fail-fast (prod) / démarrage sans DB (dev).
      await this.$queryRaw`SELECT 1`;
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Database connection failed', error);
      
      // En développement, on permet à l'API de démarrer sans DB
      // Les endpoints qui nécessitent Prisma échoueront, mais le health check fonctionnera
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn('⚠️  Continuing in development mode without database connection');
        this.logger.warn('⚠️  Check your DATABASE_URL in envFiles/.env.development');
        return;
      }
      
      // En production, on bloque le démarrage si la DB est inaccessible
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database disconnected');
  }

  /**
   * Enable transaction with retry logic
   */
  async executeTransaction<T>(
    callback: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(async (tx) => callback(tx as PrismaClient));
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Transaction attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          await this.sleep(Math.pow(2, attempt) * 100);
        }
      }
    }

    this.logger.error(
      `Transaction failed after ${maxRetries} attempts`,
      lastError.stack,
    );
    throw lastError;
  }

  /**
   * Clean database (for testing)
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => key[0] !== '_' && key[0] !== '$',
    );

    await Promise.all(
      models.map((modelKey) => {
        const model = this[modelKey as keyof this];
        if (model && typeof model === 'object' && 'deleteMany' in model) {
          return (model as any).deleteMany();
        }
      }),
    );

    this.logger.log('Database cleaned');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
