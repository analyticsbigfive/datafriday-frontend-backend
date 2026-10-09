import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ReferenceConfig, TenantReferenceCrudService } from '../../shared/reference-data/tenant-reference-crud.service';

@Injectable()
export class IndustrialsService extends TenantReferenceCrudService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected get delegate() {
    return this.prisma.industrial;
  }

  protected readonly config: ReferenceConfig = {
    duplicateMessage: (name) => `An industrial "${name}" already exists`,
    notFoundLabel: 'Industrial',
    // BUG-86 : MarketPrice.industrial est onDelete: SetNull — sans cette garde, supprimer un
    // Industrial encore référencé détachait silencieusement industrialId de tous les
    // MarketPrice concernés.
    dependents: {
      count: (id) => this.prisma.marketPrice.count({ where: { industrialId: id } }),
      message: (count) =>
        `Impossible de supprimer cet industrial : ${count} prix marché en dépendent encore. Supprimez-les d'abord ou retirez cet industrial de leur fiche.`,
    },
  };
}
