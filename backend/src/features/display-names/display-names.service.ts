import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ReferenceConfig, TenantReferenceCrudService } from '../../shared/reference-data/tenant-reference-crud.service';

@Injectable()
export class DisplayNamesService extends TenantReferenceCrudService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected get delegate() {
    return this.prisma.displayName;
  }

  protected readonly config: ReferenceConfig = {
    duplicateMessage: (name) => `A display name "${name}" already exists`,
    notFoundLabel: 'DisplayName',
    // BUG-85 : MenuItem.displayName est onDelete: SetNull — sans cette garde, supprimer un
    // DisplayName encore référencé détachait silencieusement displayNameId de tous les
    // MenuItem concernés.
    dependents: {
      count: (id) => this.prisma.menuItem.count({ where: { displayNameId: id } }),
      message: (count) =>
        `Impossible de supprimer ce display name : ${count} article(s) de menu en dépendent encore. Supprimez-les d'abord ou retirez ce display name de leur fiche.`,
    },
  };
}
