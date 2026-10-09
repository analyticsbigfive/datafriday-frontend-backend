import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ReferenceConfig, TenantReferenceCrudService } from '../../shared/reference-data/tenant-reference-crud.service';

@Injectable()
export class PromotionTypesService extends TenantReferenceCrudService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected get delegate() {
    return this.prisma.promotionType;
  }

  protected readonly config: ReferenceConfig = {
    duplicateMessage: (name) => `A promotion type "${name}" already exists`,
    notFoundLabel: 'PromotionType',
    dependents: {
      count: (id) => this.prisma.promotion.count({ where: { promotionTypeId: id } }),
      message: (count) =>
        `Impossible de supprimer ce type de promotion : ${count} promotion(s) en dépendent encore. Retirez-le de leur fiche d'abord.`,
    },
  };
}
