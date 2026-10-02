import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Coût unitaire des composants de menu, calculé depuis les ingrédients et les sous-composants.
 */
@Injectable()
export class MenuComponentCostService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(MenuComponentCostService.name);

  private async resolveIngredientUnitCost(ingredientId: string, tenantId: string): Promise<number> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, tenantId, deletedAt: null },
      select: { costPerRecipeUnit: true },
    });
    if (!ingredient) throw new BadRequestException(`Ingredient ${ingredientId} not found`);
    return Number(ingredient.costPerRecipeUnit || 0);
  }

  private async computeComponentUnitCost(
    componentId: string,
    tenantId: string,
    stack: string[] = [],
  ): Promise<number> {
    if (stack.includes(componentId)) {
      throw new BadRequestException(
        `Cycle detected in components: ${[...stack, componentId].join(' -> ')}`,
      );
    }

    const component = await this.prisma.menuComponent.findFirst({
      where: { id: componentId, tenantId, deletedAt: null },
      include: {
        ingredients: true,
        children: true,
      },
    });
    if (!component) throw new BadRequestException(`MenuComponent ${componentId} not found`);

    const nextStack = [...stack, componentId];

    let total = 0;
    for (const line of component.ingredients || []) {
      const unitCost =
        Number(line.unitCost || 0) ||
        (await this.resolveIngredientUnitCost(line.ingredientId, tenantId));
      total += unitCost * (Number(line.quantity) || 0);
    }

    for (const childLine of component.children || []) {
      const childUnitCost = await this.computeComponentUnitCost(
        childLine.childId,
        tenantId,
        nextStack,
      );
      total += childUnitCost * (Number(childLine.quantity) || 0);
    }

    // BUG-001: `total` est le coût de la fournée entière. Une recette qui produit plusieurs
    // unités (numberOfUnitsRecipe > 1) doit voir son coût divisé par ce nombre pour obtenir le
    // coût UNITAIRE. `numberOfUnitsRecipe` est nullable/optionnel : falsy (null/undefined/0) est
    // traité comme 1 (cas par défaut d'une recette qui produit une seule unité), pour ne jamais
    // diviser par zéro.
    const numberOfUnitsRecipe = Number(component.numberOfUnitsRecipe) || 1;

    return Math.round((total / numberOfUnitsRecipe) * 10000) / 10000;
  }

  async refreshCosts(tenantId: string, opts?: { componentIds?: string[] }) {
    const componentIds = opts?.componentIds;
    this.logger.log(
      `Refreshing menu component costs for tenant ${tenantId}${componentIds?.length ? ` (ids=${componentIds.length})` : ''}...`,
    );

    const components = await this.prisma.menuComponent.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(componentIds?.length ? { id: { in: componentIds } } : {}),
      },
      include: {
        ingredients: true,
        children: true,
      },
    });

    let updatedComponents = 0;
    let updatedLines = 0;

    for (const comp of components) {
      const ingredientLineUpdates = [] as any[];
      for (const line of comp.ingredients || []) {
        const unitCost =
          Number(line.unitCost || 0) ||
          (await this.resolveIngredientUnitCost(line.ingredientId, tenantId));
        const cost = Math.round(unitCost * (Number(line.quantity) || 0) * 10000) / 10000;
        ingredientLineUpdates.push(
          this.prisma.componentIngredient.update({
            where: { id: line.id },
            data: { unitCost, cost },
          }),
        );
      }

      const childLineUpdates = [] as any[];
      for (const line of comp.children || []) {
        const childUnitCost = await this.computeComponentUnitCost(line.childId, tenantId, [
          comp.id,
        ]);
        const cost = Math.round(childUnitCost * (Number(line.quantity) || 0) * 10000) / 10000;
        childLineUpdates.push(
          this.prisma.componentComponent.update({
            where: { id: line.id },
            data: { cost },
          }),
        );
      }

      const unitCost = await this.computeComponentUnitCost(comp.id, tenantId);

      await this.prisma.$transaction([
        ...ingredientLineUpdates,
        ...childLineUpdates,
        this.prisma.menuComponent.update({ where: { id: comp.id }, data: { unitCost } }),
      ]);

      updatedComponents++;
      updatedLines += (comp.ingredients?.length || 0) + (comp.children?.length || 0);
    }

    this.logger.log(`Refreshed costs for ${updatedComponents} components (${updatedLines} lines)`);
    return { updatedComponents, updatedLines };
  }
}
