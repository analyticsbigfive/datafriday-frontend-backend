import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { BYPASS_TENANT_KEY, TENANT_ID_KEY } from './tenant-context.constants';

/**
 * Typed accessor over the request-scoped CLS context for the current tenant.
 *
 * Used by app services that need to read the active tenant or temporarily
 * disable Prisma auto-scoping for legitimate cross-tenant / system operations
 * (onboarding tenant lookup, system-permission seeding, auth user lookup).
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  /** Active tenant id, or undefined when outside an HTTP request (jobs, seeds). */
  getTenantId(): string | undefined {
    if (!this.cls.isActive()) {
      return undefined;
    }
    return this.cls.get<string | undefined>(TENANT_ID_KEY);
  }

  setTenantId(tenantId: string | null | undefined): void {
    if (!this.cls.isActive()) {
      return;
    }
    this.cls.set(TENANT_ID_KEY, tenantId ?? undefined);
  }

  /** True when tenant scoping is disabled (no context, or inside a bypass block). */
  isBypassed(): boolean {
    if (!this.cls.isActive()) {
      return true;
    }
    return this.cls.get<boolean>(BYPASS_TENANT_KEY) === true;
  }

  /**
   * Exécute `fn` dans un contexte restreint à `tenantId` (jobs, crons, webhooks
   * différés). Toujours un contexte neuf : n'hérite d'aucun tenant ni contournement.
   */
  runForTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    if (!tenantId) throw new InternalServerErrorException('runForTenant : tenantId requis');
    // `await` DANS le contexte : une requête Prisma est paresseuse et ne s'exécute qu'au
    // moment où elle est attendue ; la renvoyer telle quelle la ferait partir hors contexte.
    return this.cls.run({ ifNested: 'override' }, async () => {
      this.cls.set(TENANT_ID_KEY, tenantId);
      return await fn();
    });
  }

  /**
   * Exécute `fn` sans restriction tenant, pour les opérations volontairement
   * transverses (cron qui parcourt tous les tenants, catalogue système). Chaque usage
   * doit être justifié en commentaire. Restaure l'état précédent à la sortie.
   */
  async runWithoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.cls.isActive()) {
      return this.cls.run(async () => {
        this.cls.set(BYPASS_TENANT_KEY, true);
        return await fn();
      });
    }
    const previous = this.cls.get<boolean>(BYPASS_TENANT_KEY);
    this.cls.set(BYPASS_TENANT_KEY, true);
    try {
      return await fn();
    } finally {
      this.cls.set(BYPASS_TENANT_KEY, previous);
    }
  }
}
