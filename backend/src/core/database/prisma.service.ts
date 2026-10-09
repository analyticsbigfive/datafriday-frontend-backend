import { Injectable, OnModuleInit, OnModuleDestroy, Logger, InternalServerErrorException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Pool } from 'pg';
import { buildPgPool } from './pg-pool';
import { ClsService, CLS_REQ } from 'nestjs-cls';
import { AppConfigService } from '../../config/app-config.service';
import {
  BYPASS_TENANT_KEY,
  TENANT_ID_KEY,
} from '../tenant/tenant-context.constants';
import {
  applyTenantScope,
  buildTenantScopedModelSet,
  decideTenantScope,
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
   * Construction, attente maximale et gestion des erreurs : ./pg-pool.ts.
   */
  private readonly pool: Pool;

  /** Tenant et route de la requête HTTP en cours (vide hors requête), pour le journal des requêtes lentes. */
  private queryContext(): string {
    if (!this.cls.isActive()) return '';
    const tenantId = this.cls.get<string | undefined>(TENANT_ID_KEY);
    const req = this.cls.get<{ method?: string; url?: string } | undefined>(CLS_REQ);
    const parts = [tenantId && `tenant=${tenantId}`, req?.url && `${req.method ?? ''} ${req.url.split('?')[0]}`.trim()].filter(Boolean);
    return parts.length ? ` [${parts.join(' ')}]` : '';
  }

  /** État du pool pg (connexions ouvertes, libres, requêtes en attente), exposé par les métriques. */
  poolStats(): { total: number; idle: number; waiting: number; max: number | undefined } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      max: this.pool.options.max,
    };
  }

  /**
   * Models that carry a REQUIRED `tenantId` scalar — the ones eligible for
   * automatic tenant scoping. Derived from the Prisma DMMF so it stays in sync
   * with the schema. Models with a nullable tenantId (e.g. Permission, whose
   * system catalog rows have tenantId = null) are intentionally excluded.
   */
  private readonly tenantScopedModels: Set<string> = buildTenantScopedModelSet(
    Prisma.dmmf.datamodel.models as any,
  );

  constructor(
    private readonly cls: ClsService,
    private readonly appConfig: AppConfigService,
  ) {
    // `this` n'existe pas avant super() : le logger de l'erreur est créé ici.
    const poolLogger = new Logger(PrismaService.name);
    const pool = buildPgPool(appConfig.databaseUrl, (err) =>
      poolLogger.warn(`Connexion inactive perdue (retirée du pool) : ${err?.message ?? err}`),
    );
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

    const slowQueryThresholdMs = appConfig.prismaSlowQueryMs;
    const isProduction = appConfig.isProduction;

    // Log queries:
    //  - en développement: tout (debug)
    //  - en production: uniquement les requêtes lentes (> seuil) en warn
    this.$on('query' as never, (e: any) => {
      if (!isProduction) {
        this.logger.debug(`Query: ${e.query} | Params: ${e.params} | ${e.duration}ms`);
        return;
      }
      if (slowQueryThresholdMs > 0 && e.duration >= slowQueryThresholdMs) {
        this.logger.warn(`SLOW QUERY (${e.duration}ms)${this.queryContext()}: ${e.query}`);
      }
    });

    // L'erreur est aussi relancée à l'appelant, qui décide (un P2002 d'idempotence est normal) :
    // ici on garde une trace lisible. Le message Prisma commence par un saut de ligne et
    // embarque un extrait de code ; seule sa dernière ligne décrit l'erreur.
    this.$on('error' as never, (e: { message?: string; target?: string }) => {
      const summary = String(e.message ?? '').trim().split('\n').pop() || 'erreur sans message';
      this.logger.warn(`Prisma ${e.target ?? 'query'} : ${summary}`);
    });

    this.registerTenantScopeMiddleware();
  }

  /**
   * Isolation multi-tenant automatique (décision : decideTenantScope).
   *
   * Injecte `tenantId` dans le WHERE (lectures, mises à jour, suppressions) et dans
   * `data` (créations) pour chaque modèle tenant-scopé, à partir du tenant du contexte
   * CLS. Hors de tout contexte (job, cron, script), une requête sur un modèle
   * tenant-scopé est refusée (TENANT_SCOPE_MODE=strict) ou signalée (warn).
   *
   * Prisma 5 « extended where unique » : ajouter `tenantId` à côté d'un sélecteur
   * unique est valide pour findUnique/update/delete, l'action n'est jamais réécrite.
   */
  private registerTenantScopeMiddleware(): void {
    const strict = this.appConfig.tenantScopeMode === 'strict';
    const warned = new Set<string>();

    this.$use(async (params, next) => {
      const hasContext = this.cls?.isActive?.() ?? false;
      const decision = decideTenantScope({
        model: params.model,
        scopedModels: this.tenantScopedModels,
        hasContext,
        bypass: hasContext && this.cls.get<boolean>(BYPASS_TENANT_KEY) === true,
        tenantId: hasContext ? this.cls.get<string | undefined>(TENANT_ID_KEY) : undefined,
      });

      if (decision.kind === 'reject') {
        const where = `${params.model}.${params.action}`;
        const message =
          `[tenant-scope] ${where} hors contexte tenant : ouvrir un contexte avec ` +
          `TenantContextService.runForTenant() ou runWithoutTenantScope().`;
        if (strict) throw new InternalServerErrorException(message);
        if (!warned.has(where)) {
          warned.add(where);
          this.logger.warn(message);
        }
        return next(params);
      }
      if (decision.kind === 'scope') applyTenantScope(params, decision.tenantId);
      return next(params);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      // Avec le driver adapter, $connect est paresseux : un vrai ping est requis
      // pour conserver la sémantique fail-fast (prod) / démarrage sans DB (dev).
      await this.ping();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Database connection failed', error);
      
      // En développement, on permet à l'API de démarrer sans DB
      // Les endpoints qui nécessitent Prisma échoueront, mais le health check fonctionnera
      if (this.appConfig.isDevelopment) {
        this.logger.warn('⚠️  Continuing in development mode without database connection');
        this.logger.warn('⚠️  Check your DATABASE_URL in envFiles/.env.development');
        return;
      }
      
      // En production, on bloque le démarrage si la DB est inaccessible
      throw error;
    }
  }

  /** Aller-retour minimal vers la base (sondes de santé). */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
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
        // eslint-disable-next-line no-await-in-loop -- nouvelle tentative après échec, avec attente exponentielle
        return await this.$transaction(async (tx) => callback(tx as PrismaClient));
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Transaction attempt ${attempt}/${maxRetries} failed: ${(error as Error).message}`,
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          // eslint-disable-next-line no-await-in-loop -- nouvelle tentative après échec, avec attente exponentielle
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
    if (this.appConfig.isProduction) {
      throw new InternalServerErrorException('Cannot clean database in production!');
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
