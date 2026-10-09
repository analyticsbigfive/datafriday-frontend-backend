import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

type ComponentWithLines = {
  id: string;
  numberOfUnitsRecipe: unknown;
  ingredients: Array<{ id?: string; ingredientId: string; unitCost: unknown; quantity: unknown }>;
  children: Array<{ id?: string; childId: string; quantity: unknown }>;
};

/** Composants et coûts d'ingrédients chargés en lot pour un calcul en mémoire. */
interface CostContext {
  components: Map<string, ComponentWithLines>;
  ingredientCost: Map<string, number>;
  memo: Map<string, number>;
}

/** Lot d'écritures par transaction lors d'un recalcul complet. */
const WRITE_CHUNK = 20;

/**
 * Coût unitaire des composants de menu, calculé depuis les ingrédients et les sous-composants.
 * Les composants (niveau par niveau pour les sous-composants) et les coûts d'ingrédients sont
 * lus en lot, puis le calcul se fait en mémoire : quelques requêtes au lieu d'une par ligne.
 */
@Injectable()
export class MenuComponentCostService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(MenuComponentCostService.name);

  /** Charge `roots` puis, niveau par niveau, tous leurs sous-composants et les ingrédients utiles. */
  private async loadCostContext(tenantId: string, roots: ComponentWithLines[]): Promise<CostContext> {
    const components = new Map(roots.map((c) => [c.id, c]));
    let pending = roots.flatMap((c) => c.children.map((l) => l.childId)).filter((id) => !components.has(id));
    while (pending.length) {
      // eslint-disable-next-line no-await-in-loop -- une requête par niveau de sous-composants
      const level = await this.prisma.menuComponent.findMany({
        where: { id: { in: [...new Set(pending)] }, tenantId, deletedAt: null },
        include: { ingredients: true, children: true },
      });
      level.forEach((c) => components.set(c.id, c as ComponentWithLines));
      pending = level.flatMap((c) => c.children.map((l) => l.childId)).filter((id) => !components.has(id));
    }
    const ingredientIds = [
      ...new Set(
        [...components.values()].flatMap((c) => c.ingredients.filter((l) => !Number(l.unitCost || 0)).map((l) => l.ingredientId)),
      ),
    ];
    const ingredients = ingredientIds.length
      ? await this.prisma.ingredient.findMany({
          where: { id: { in: ingredientIds }, tenantId, deletedAt: null },
          select: { id: true, costPerRecipeUnit: true },
        })
      : [];
    return {
      components,
      ingredientCost: new Map(ingredients.map((i) => [i.id, Number(i.costPerRecipeUnit || 0)])),
      memo: new Map(),
    };
  }

  /** Coût unitaire d'une ligne ingrédient : celui de la ligne, sinon celui de l'ingrédient. */
  private ingredientLineUnitCost(ctx: CostContext, line: ComponentWithLines['ingredients'][number]): number {
    const own = Number(line.unitCost || 0);
    if (own) return own;
    const cost = ctx.ingredientCost.get(line.ingredientId);
    if (cost === undefined) throw new BadRequestException(`Ingredient ${line.ingredientId} not found`);
    return cost;
  }

  /** Coût unitaire d'un composant à partir du contexte chargé (mémoïsé, cycles refusés). */
  private unitCostFromContext(ctx: CostContext, componentId: string, stack: string[] = []): number {
    if (stack.includes(componentId)) {
      throw new BadRequestException(`Cycle detected in components: ${[...stack, componentId].join(' -> ')}`);
    }
    const memo = ctx.memo.get(componentId);
    if (memo !== undefined) return memo;
    const component = ctx.components.get(componentId);
    if (!component) throw new BadRequestException(`MenuComponent ${componentId} not found`);

    const nextStack = [...stack, componentId];
    let total = 0;
    for (const line of component.ingredients || []) {
      total += this.ingredientLineUnitCost(ctx, line) * (Number(line.quantity) || 0);
    }
    for (const childLine of component.children || []) {
      total += this.unitCostFromContext(ctx, childLine.childId, nextStack) * (Number(childLine.quantity) || 0);
    }

    // BUG-001: `total` est le coût de la fournée entière. Une recette qui produit plusieurs
    // unités (numberOfUnitsRecipe > 1) doit voir son coût divisé par ce nombre pour obtenir le
    // coût UNITAIRE. `numberOfUnitsRecipe` est nullable/optionnel : falsy (null/undefined/0) est
    // traité comme 1 (cas par défaut d'une recette qui produit une seule unité), pour ne jamais
    // diviser par zéro.
    const numberOfUnitsRecipe = Number(component.numberOfUnitsRecipe) || 1;
    const unitCost = Math.round((total / numberOfUnitsRecipe) * 10000) / 10000;
    ctx.memo.set(componentId, unitCost);
    return unitCost;
  }

  private async computeComponentUnitCost(componentId: string, tenantId: string): Promise<number> {
    const [component] = await this.prisma.menuComponent.findMany({
      where: { id: componentId, tenantId, deletedAt: null },
      include: { ingredients: true, children: true },
    });
    if (!component) throw new BadRequestException(`MenuComponent ${componentId} not found`);
    const ctx = await this.loadCostContext(tenantId, [component as ComponentWithLines]);
    return this.unitCostFromContext(ctx, componentId);
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
    const ctx = await this.loadCostContext(tenantId, components as ComponentWithLines[]);

    let updatedComponents = 0;
    let updatedLines = 0;
    const writesByComponent: any[][] = [];

    for (const comp of components) {
      const writes: any[] = [];
      for (const line of comp.ingredients || []) {
        const unitCost = this.ingredientLineUnitCost(ctx, line);
        const cost = Math.round(unitCost * (Number(line.quantity) || 0) * 10000) / 10000;
        writes.push(this.prisma.componentIngredient.update({ where: { id: line.id }, data: { unitCost, cost } }));
      }
      for (const line of comp.children || []) {
        const childUnitCost = this.unitCostFromContext(ctx, line.childId, [comp.id]);
        const cost = Math.round(childUnitCost * (Number(line.quantity) || 0) * 10000) / 10000;
        writes.push(this.prisma.componentComponent.update({ where: { id: line.id }, data: { cost } }));
      }
      const unitCost = this.unitCostFromContext(ctx, comp.id);
      writes.push(this.prisma.menuComponent.update({ where: { id: comp.id }, data: { unitCost } }));
      writesByComponent.push(writes);

      updatedComponents++;
      updatedLines += (comp.ingredients?.length || 0) + (comp.children?.length || 0);
    }

    for (let i = 0; i < writesByComponent.length; i += WRITE_CHUNK) {
      // eslint-disable-next-line no-await-in-loop -- transactions courtes, par lots de composants
      await this.prisma.$transaction(writesByComponent.slice(i, i + WRITE_CHUNK).flat());
    }

    this.logger.log(`Refreshed costs for ${updatedComponents} components (${updatedLines} lines)`);
    return { updatedComponents, updatedLines };
  }
}
