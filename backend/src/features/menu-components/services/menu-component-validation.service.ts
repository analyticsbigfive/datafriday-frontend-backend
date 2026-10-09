import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Contrôles d'un composant de menu : ingrédients et sous-composants existants, type et catégorie accessibles, conversion des quantités.
 */
@Injectable()
export class MenuComponentValidationService {
  constructor(
    private prisma: PrismaService,
  ) {}

  toDecimalOrUndefined(value: unknown): any {
    if (value === null || value === undefined || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private uniqueStringList(values: unknown[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      if (typeof v !== 'string') continue;
      const id = v.trim();
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  async assertIngredientsExist(ingredientIds: unknown[], tenantId: string) {
    const ids = this.uniqueStringList(ingredientIds);
    if (!ids.length) return;

    const found = await this.prisma.ingredient.findMany({
      where: {
        id: { in: ids },
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const foundIds = new Set(found.map((i) => i.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Unknown ingredient ID(s): ${missing.join(', ')}. ` +
          `Make sure these IDs belong to the "ingredients" table, not "market_prices". ` +
          `Use POST /market-prices/sync-ingredients to auto-create missing ingredients from market prices.`,
      );
    }
  }

  async assertChildrenExist(childIds: unknown[], tenantId: string) {
    const ids = this.uniqueStringList(childIds);
    if (!ids.length) return;

    const found = await this.prisma.menuComponent.findMany({
      where: {
        id: { in: ids },
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const foundIds = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(`Invalid childId(s): ${missing.join(', ')}`);
    }
  }

  // BUG-80 : componentTypeId/componentCategoryId étaient assignés directement depuis le payload
  // client sans vérifier qu'ils pointent vers un ComponentType/ComponentCategory accessible au
  // tenant courant (privé au tenant ou global) — la contrainte FK Prisma ne garantit que
  // l'existence de la ligne, pas son appartenance tenant. Pattern "accessible"
  // (OR: [{tenantId}, {tenantId: null}]) identique à findAccessibleEventTypeOrThrow
  // (events.service.ts) — PAS la variante "owned" stricte, qui rejetterait à tort les entrées
  // globales (voir BUG-77, régression évitée).
  async assertComponentTypeAccessible(componentTypeId: unknown, tenantId: string) {
    if (componentTypeId === undefined || componentTypeId === null) return;
    if (typeof componentTypeId !== 'string' || !componentTypeId.trim()) return;

    const type = await this.prisma.componentType.findFirst({
      where: { id: componentTypeId, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    if (!type) {
      throw new BadRequestException('componentTypeId must reference an accessible component type');
    }
  }

  async assertComponentCategoryAccessible(componentCategoryId: unknown, tenantId: string) {
    if (componentCategoryId === undefined || componentCategoryId === null) return;
    if (typeof componentCategoryId !== 'string' || !componentCategoryId.trim()) return;

    const category = await this.prisma.componentCategory.findFirst({
      where: { id: componentCategoryId, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('componentCategoryId must reference an accessible component category');
    }
  }
}
