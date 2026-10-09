import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ReferenceConfig, TenantReferenceCrudService } from '../../shared/reference-data/tenant-reference-crud.service';

@Injectable()
export class BrandsService extends TenantReferenceCrudService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected get delegate() {
    return this.prisma.brand;
  }

  protected readonly config: ReferenceConfig = {
    duplicateMessage: (name) => `A brand named "${name}" already exists`,
    notFoundLabel: 'Brand',
    // BUG-85 : MenuItem.brand est onDelete: SetNull — sans cette garde, supprimer un Brand
    // encore référencé détachait silencieusement brandId de tous les MenuItem concernés.
    dependents: {
      count: (id) => this.prisma.menuItem.count({ where: { brandId: id } }),
      message: (count) =>
        `Impossible de supprimer ce brand : ${count} article(s) de menu en dépendent encore. Supprimez-les d'abord ou retirez ce brand de leur fiche.`,
    },
  };
}
