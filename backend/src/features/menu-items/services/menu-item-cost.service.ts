import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemSupportService } from './menu-item-support.service';

/**
 * Coûts des articles (recette et combos) recalculés depuis leurs composants.
 */
@Injectable()
export class MenuItemCostService {
  constructor(
    private prisma: PrismaService,
    private readonly menuItemSupportService: MenuItemSupportService,
  ) {}

  private readonly logger = new Logger(MenuItemCostService.name);

  /**
   * Calcule récursivement le coût total d'un MenuItem en tenant compte de sa propre recette
   * (components/ingredients/packagings, coût déjà résolu par ailleurs) PLUS sa composition combo
   * (comboChildren → autres MenuItem vendables). Garde anti-cycle a posteriori (pile de
   * `parentId` traversés), même principe que `MenuComponentCostService.computeComponentUnitCost` —
   * un cycle A→B→A lève une BadRequestException plutôt que de boucler indéfiniment.
   */
  private async computeMenuItemComboCost(itemId: string, tenantId: string, stack: string[] = []): Promise<number> {
    if (stack.includes(itemId)) {
      throw new BadRequestException(`Cycle detected in combo composition: ${[...stack, itemId].join(' -> ')}`);
    }
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, tenantId, deletedAt: null },
      include: {
        components: { include: { component: true } },
        ingredients: { include: { ingredient: true } },
        packagings: { include: { packaging: true } },
        comboChildren: true,
      },
    });
    if (!item) return 0;

    // Recalculé ligne par ligne à chaque appel (jamais lu depuis `totalCost` déjà persisté) :
    // `totalCost` est RÉÉCRIT par ce même calcul (voir refreshComboCost ci-dessous) — le relire
    // comme point de départ ferait doubler la contribution combo à chaque recalcul successif
    // (un item déjà combo-mis-à-jour verrait son ancien total combo-inclusive réutilisé comme
    // base, puis re-additionné). Duplique volontairement la sommation flat de `refreshCosts()`
    // (components/ingredients/packagings) pour rester sans état.
    let total = 0;
    for (const line of item.components || []) {
      total += this.menuItemSupportService.toNumber((line as any).component?.unitCost, 0) * this.menuItemSupportService.toNumber(line.numberOfUnits);
    }
    for (const line of item.ingredients || []) {
      total += this.menuItemSupportService.toNumber((line as any).ingredient?.costPerRecipeUnit, 0) * this.menuItemSupportService.toNumber(line.numberOfUnits);
    }
    for (const line of item.packagings || []) {
      total += this.menuItemSupportService.toNumber((line as any).packaging?.costPerRecipeUnit, 0) * this.menuItemSupportService.toNumber(line.numberOfUnits);
    }

    const nextStack = [...stack, itemId];
    for (const combo of item.comboChildren || []) {
      // eslint-disable-next-line no-await-in-loop -- transaction courte par article (pooler) ; combos parcourus récursivement
      const childCost = await this.computeMenuItemComboCost(combo.childId, tenantId, nextStack);
      total += childCost * this.menuItemSupportService.toNumber(combo.quantity);
    }

    return Math.round(total * 10000) / 10000;
  }

  /**
   * Recalcule et persiste `totalCost` pour UN item en tenant compte de sa composition combo.
   * Distinct de `refreshCosts()` (plat, sans récursion, utilisé par les 3 autres routes
   * `PUT :id/xxx` et le refresh global) — limite connue et assumée : `refreshCosts()` global
   * (bulk/refresh-costs) ne recalcule PAS la contribution combo, seul un appel explicite à
   * `replaceComboItems()`/`create()`/`update()` avec `comboItems` la met à jour.
   */
  async refreshComboCost(tenantId: string, itemId: string) {
    const totalCost = await this.computeMenuItemComboCost(itemId, tenantId);
    await this.prisma.menuItem.update({ where: { id: itemId }, data: { totalCost } });
    return totalCost;
  }

  async refreshCosts(tenantId: string, opts?: { itemIds?: string[] }) {
    const itemIds = opts?.itemIds;
    this.logger.log(`Refreshing menu item costs for tenant ${tenantId}${itemIds?.length ? ` (ids=${itemIds.length})` : ''}...`);
    try {
      const items = await this.prisma.menuItem.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(itemIds?.length ? { id: { in: itemIds } } : {}),
        },
        include: {
          components: { include: { component: true } },
          ingredients: { include: { ingredient: true } },
          packagings: { include: { packaging: true } },
        },
      });

      // P1: Batch load all costs in 3 queries instead of N queries
      const [allComponents, allIngredients, allPackagings] = await Promise.all([
        this.prisma.menuComponent.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, unitCost: true, storageType: true },
        }),
        this.prisma.ingredient.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, costPerRecipeUnit: true, storageType: true },
        }),
        this.prisma.packaging.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, costPerRecipeUnit: true, storageType: true },
        }),
      ]);

      // Create lookup maps for O(1) access
      const componentCostMap = new Map(
        allComponents.map(c => [c.id, { unitCost: this.menuItemSupportService.toNumber(c.unitCost, 0), storageType: c.storageType }])
      );
      const ingredientCostMap = new Map(
        allIngredients.map(i => [i.id, { unitCost: this.menuItemSupportService.toNumber(i.costPerRecipeUnit, 0), storageType: i.storageType }])
      );
      const packagingCostMap = new Map(
        allPackagings.map(p => [p.id, { unitCost: this.menuItemSupportService.toNumber(p.costPerRecipeUnit, 0), storageType: p.storageType }])
      );

      let updated = 0;
      let updatedLines = 0;

      for (const item of items as any[]) {
        const tx: any[] = [];
        let totalCost = 0;

        for (const line of item.components || []) {
          const costData = componentCostMap.get(line.componentId);
          if (!costData) {
            this.logger.warn(`Component ${line.componentId} not found in cost map`);
            continue;
          }
          const { unitCost, storageType } = costData;
          const numberOfUnits = this.menuItemSupportService.toNumber(line.numberOfUnits);
          const lineTotal = Math.round((unitCost * numberOfUnits) * 10000) / 10000;
          totalCost += lineTotal;
          tx.push(
            this.prisma.menuItemComponent.update({
              where: { id: line.id },
              data: { unitCost, totalCost: lineTotal, storageType: storageType || undefined },
            }),
          );
          updatedLines++;
        }

        for (const line of item.ingredients || []) {
          const costData = ingredientCostMap.get(line.ingredientId);
          if (!costData) {
            this.logger.warn(`Ingredient ${line.ingredientId} not found in cost map`);
            continue;
          }
          const { unitCost, storageType } = costData;
          const numberOfUnits = this.menuItemSupportService.toNumber(line.numberOfUnits);
          const lineTotal = Math.round((unitCost * numberOfUnits) * 10000) / 10000;
          totalCost += lineTotal;
          tx.push(
            this.prisma.menuItemIngredient.update({
              where: { id: line.id },
              data: { unitCost, totalCost: lineTotal, storageType: storageType || undefined },
            }),
          );
          updatedLines++;
        }

        for (const line of item.packagings || []) {
          const costData = packagingCostMap.get(line.packagingId);
          if (!costData) {
            this.logger.warn(`Packaging ${line.packagingId} not found in cost map`);
            continue;
          }
          const { unitCost, storageType } = costData;
          const numberOfUnits = this.menuItemSupportService.toNumber(line.numberOfUnits);
          const lineTotal = Math.round((unitCost * numberOfUnits) * 10000) / 10000;
          totalCost += lineTotal;
          tx.push(
            this.prisma.menuItemPackaging.update({
              where: { id: line.id },
              data: { unitCost, totalCost: lineTotal, storageType: storageType || undefined },
            }),
          );
          updatedLines++;
        }

        // Marge calculée sur le coût PAR PIÈCE (totalCost = fournée) face au prix d'UNE portion.
        const pieces = Math.max(this.menuItemSupportService.toNumber(item.numberOfPiecesRecipe, 1), 1);
        const costPerPiece = totalCost / pieces;
        const margin = this.menuItemSupportService.toNumber(item.basePrice) > 0
          ? ((this.menuItemSupportService.toNumber(item.basePrice) - costPerPiece) / this.menuItemSupportService.toNumber(item.basePrice)) * 100
          : null;

        tx.push(
          this.prisma.menuItem.update({
            where: { id: item.id },
            data: { totalCost, margin },
          }),
        );

        // eslint-disable-next-line no-await-in-loop -- transaction courte par article (pooler) ; combos parcourus récursivement
        await this.prisma.$transaction(tx);
        updated++;
      }

      this.logger.log(`✅ P1: Refreshed costs for ${updated} menu items (${updatedLines} lines) with batch optimization`);
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return { updated, total: items.length, updatedLines };
    } catch (error) {
      this.logger.error(`Failed to refresh costs: ${error.message}`, error.stack);
      throw error;
    }
  }
}
