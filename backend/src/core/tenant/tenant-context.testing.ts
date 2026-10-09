import { TenantContextService } from './tenant-context.service';

/** Contexte tenant transparent pour les tests unitaires : exécute `fn` tel quel. */
export function passthroughTenantContext(): TenantContextService {
  return {
    runForTenant: (_tenantId: string, fn: () => Promise<unknown>) => fn(),
    runWithoutTenantScope: (fn: () => Promise<unknown>) => fn(),
    getTenantId: () => undefined,
    setTenantId: () => undefined,
    isBypassed: () => true,
  } as unknown as TenantContextService;
}
