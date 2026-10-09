import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LiveSyncCadenceConfig,
  readCadenceConfig,
} from '../features/weezevent/services/live/live-sync-cadence';

export type NodeEnv = 'development' | 'staging' | 'production' | 'test';

/**
 * Accès typé à la configuration validée (env.validation.ts). Seul point de lecture
 * de l'environnement hors de src/config, main.ts et worker.ts (règle ESLint).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): NodeEnv {
    return this.config.get<NodeEnv>('NODE_ENV', 'development');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  get tenantScopeMode(): 'strict' | 'warn' {
    return this.config.get<'strict' | 'warn'>('TENANT_SCOPE_MODE', 'strict');
  }

  get logLevel(): string {
    return this.config.get<string>('LOG_LEVEL', 'info');
  }

  /** Seuil de log des requêtes lentes ; 0 = désactivé. Défaut : 500 ms en production. */
  get prismaSlowQueryMs(): number {
    return Number(this.config.get('PRISMA_SLOW_QUERY_MS') ?? (this.isProduction ? 500 : 0));
  }

  get weezeventHttp(): {
    timeoutMs: number;
    breakerThresholdPercent: number;
    breakerResetMs: number;
    collectConcurrency: number;
  } {
    return {
      timeoutMs: Number(this.config.get('WEEZEVENT_HTTP_TIMEOUT_MS', 15000)),
      breakerThresholdPercent: Number(this.config.get('WEEZEVENT_BREAKER_THRESHOLD', 50)),
      breakerResetMs: Number(this.config.get('WEEZEVENT_BREAKER_RESET_MS', 30000)),
      collectConcurrency: Number(this.config.get('WEEZEVENT_COLLECT_CONCURRENCY', 5)),
    };
  }

  get liveSyncCadence(): LiveSyncCadenceConfig {
    return readCadenceConfig({
      LIVE_SYNC_INTERVAL_SEC: this.config.get('LIVE_SYNC_INTERVAL_SEC'),
      LIVE_SYNC_INTERVAL_WEBHOOK_SEC: this.config.get('LIVE_SYNC_INTERVAL_WEBHOOK_SEC'),
      LIVE_SYNC_INTERVAL_RATE_LIMITED_SEC: this.config.get('LIVE_SYNC_INTERVAL_RATE_LIMITED_SEC'),
      IDLE_SYNC_INTERVAL_SEC: this.config.get('IDLE_SYNC_INTERVAL_SEC'),
      LIVE_SYNC_QUIET_AFTER_MIN: this.config.get('LIVE_SYNC_QUIET_AFTER_MIN'),
      LIVE_SYNC_INTERVAL_QUIET_SEC: this.config.get('LIVE_SYNC_INTERVAL_QUIET_SEC'),
    });
  }
}
