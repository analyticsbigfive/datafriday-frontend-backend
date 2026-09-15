import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * BUG-384-02 : intégrations rattachées à un espace (étape 1 du wizard, `LocationSpaceMapping`
 * où `salesLocationId` porte l'id d'intégration). C'est LA frontière que les writers d'agrégats
 * doivent respecter : une transaction d'une intégration mappée à un autre espace n'a rien à
 * faire dans les agrégats de celui-ci, quel que soit le mode de fenêtre.
 *
 * Le lecteur (`SpacesService.resolveEventSalesScope`) applique déjà cette liste ; jusqu'ici le
 * writer ne connaissait que l'intégration DU JOB, optionnelle. Un job sans integrationId en
 * mode `range` ramenait donc toutes les ventes du tenant tombant dans la fenêtre jour de
 * l'event (Le Mans-Brest 22/08 : + 46 k€ de FC Nantes Digifood, rollup 112 k€ au lieu de 66 k€).
 */
@Injectable()
export class SpaceIntegrationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string, spaceId: string): Promise<string[]> {
    const rows = await this.prisma.locationSpaceMapping.findMany({
      where: { tenantId, spaceId },
      select: { salesLocationId: true },
    });
    return rows.map((r) => r.salesLocationId).filter(Boolean);
  }

  /**
   * Purge les lignes d'agrégats de l'espace écrites sous une intégration qui ne lui est pas
   * mappée (résidu d'un job non scopé). Sans liste (espace sans mapping), on ne peut pas
   * qualifier une ligne d'étrangère : rien n'est supprimé.
   * `integrationId NULL` (lignes antérieures à la colonne) n'est pas touché par `notIn`.
   */
  async purgeForeignRows(
    tenantId: string,
    spaceId: string,
    spaceIntegrationIds: string[],
  ): Promise<number> {
    if (!spaceIntegrationIds.length) return 0;
    const where = { tenantId, spaceId, integrationId: { notIn: spaceIntegrationIds } };
    // Trois deleteMany séquentiels, pas de transaction : purge idempotente, rejouée à chaque job.
    const minute = await this.prisma.spaceRevenueMinuteAgg.deleteMany({ where });
    const item = await this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where });
    const daily = await this.prisma.spaceProductRevenueDailyAgg.deleteMany({ where });
    return minute.count + item.count + daily.count;
  }
}
