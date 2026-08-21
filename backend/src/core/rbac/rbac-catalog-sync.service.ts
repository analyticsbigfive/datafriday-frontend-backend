import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ensureSystemPermissionCatalog } from './permission-catalog';

/**
 * Propage le catalogue de permissions système au DÉMARRAGE du backend (BUG-132-01) :
 * `ensureSystemPermissionCatalog` n'était appelé que par les scripts manuels
 * (`prisma/seed.ts`, `prisma/backfill-rbac.ts`) et l'onboarding des NOUVEAUX
 * tenants — une permission ajoutée au catalogue n'atteignait donc jamais les
 * tenants existants en déployé (constaté en base le 2026-08-20 :
 * `front.fb.preInventoryPredicted` absente de tous les tenants).
 *
 * Sûr par construction : le catalogue n'accorde aux rôles existants QUE les codes
 * nouvellement créés — une permission révoquée par un admin ne peut pas être
 * ré-accordée (elle n'est pas « neuve »).
 */
@Injectable()
export class RbacCatalogSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacCatalogSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Verrou consultatif : l'unique `[tenantId, code]` de Permission ne
        // dédoublonne PAS les lignes `tenantId = null` (NULLs distincts en
        // Postgres) et le catalogue fait findFirst-puis-create — deux instances
        // qui bootent en parallèle (web + worker) dupliqueraient des codes.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rbac-catalog-sync'))`;
        await ensureSystemPermissionCatalog(tx);
      });
      this.logger.log('Catalogue de permissions système synchronisé');
    } catch (e) {
      // Un échec de sync ne doit pas empêcher le boot : le catalogue sera repris
      // au prochain démarrage (ou via prisma/backfill-rbac.ts).
      this.logger.error(
        `Synchronisation du catalogue RBAC échouée (non bloquant) : ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
