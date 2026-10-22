import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuComponentCostService } from '../../menu-components/services/menu-component-cost.service';
import { MenuItemCostService } from '../../menu-items/services/menu-item-cost.service';
import { MenuItemCostSnapshotService } from '../../menu-items/services/menu-item-cost-snapshot.service';

/**
 * Répercute un changement de prix du marché sur tous les coûts qui en dépendent, sans toucher
 * aux recettes : ingrédients/emballages (déjà resynchronisés par MarketPriceRecipeSyncService),
 * puis composants (et leurs parents), menu items qui les utilisent, et combos parents.
 *
 * Un seul appel groupé par lot (import CSV compris) : les `refreshCosts` chargent les coûts de
 * tout le tenant, les appeler par ligne importée serait trop coûteux sur la base.
 */
@Injectable()
export class MarketPriceCostPropagationService {
  constructor(
    private prisma: PrismaService,
    private readonly componentCostService: MenuComponentCostService,
    private readonly menuItemCostService: MenuItemCostService,
    private readonly costSnapshotService: MenuItemCostSnapshotService,
  ) {}

  private readonly logger = new Logger(MarketPriceCostPropagationService.name);

  async propagate(marketPriceIds: string[], tenantId: string) {
    const ids = [...new Set(marketPriceIds.filter(Boolean))];
    if (!ids.length) return { components: 0, menuItems: 0 };
    try {
      const [ingredients, packagings] = await Promise.all([
        this.prisma.ingredient.findMany({
          where: { marketPriceId: { in: ids }, tenantId, deletedAt: null },
          select: { id: true },
        }),
        this.prisma.packaging.findMany({
          where: { marketPriceId: { in: ids }, tenantId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      const ingredientIds = ingredients.map((i) => i.id);
      const packagingIds = packagings.map((p) => p.id);

      const directComponents = ingredientIds.length
        ? await this.prisma.componentIngredient.findMany({
            where: { ingredientId: { in: ingredientIds } },
            select: { componentId: true },
          })
        : [];
      const componentIds = await this.withAncestorComponents(directComponents.map((c) => c.componentId));

      const [viaIngredient, viaPackaging, viaComponent] = await Promise.all([
        ingredientIds.length
          ? this.prisma.menuItemIngredient.findMany({ where: { ingredientId: { in: ingredientIds } }, select: { menuItemId: true } })
          : [],
        packagingIds.length
          ? this.prisma.menuItemPackaging.findMany({ where: { packagingId: { in: packagingIds } }, select: { menuItemId: true } })
          : [],
        componentIds.length
          ? this.prisma.menuItemComponent.findMany({ where: { componentId: { in: componentIds } }, select: { menuItemId: true } })
          : [],
      ]);
      const directItems = [...viaIngredient, ...viaPackaging, ...viaComponent].map((l) => l.menuItemId);
      const itemIds = await this.withAncestorItems(directItems);

      if (componentIds.length) {
        await this.componentCostService.refreshCosts(tenantId, { componentIds });
      }
      if (itemIds.length) {
        await this.menuItemCostService.refreshCosts(tenantId, { itemIds, skipSnapshot: true });
        // refreshCosts est plat : la part combo se recalcule ensuite, pour les parents de combo.
        const comboParents = await this.prisma.menuItemCombo.findMany({
          where: { parentId: { in: itemIds } },
          select: { parentId: true },
          distinct: ['parentId'],
        });
        for (const { parentId } of comboParents) {
          // eslint-disable-next-line no-await-in-loop -- un combo à la fois, calcul récursif court
          await this.menuItemCostService.refreshComboCost(tenantId, parentId, { skipSnapshot: true });
        }
        // Un seul lot après la part combo, pour ne figer aucun coût de parent de combo incomplet.
        await this.costSnapshotService.recordIfChanged(tenantId, itemIds, 'market_price', { marketPriceIds: ids });
      }
      this.logger.log(`Cost propagation: ${ids.length} market price(s) -> ${componentIds.length} component(s), ${itemIds.length} menu item(s)`);
      return { components: componentIds.length, menuItems: itemIds.length };
    } catch (error) {
      // Non bloquant : le prix est déjà enregistré, un refresh global reste possible.
      this.logger.warn(`Cost propagation failed for ${ids.length} market price(s): ${error.message}`);
      return { components: 0, menuItems: 0 };
    }
  }

  /** Composants donnés + tous leurs parents (sous-composants), niveau par niveau. */
  private async withAncestorComponents(seed: string[]): Promise<string[]> {
    const all = new Set(seed);
    let pending = [...all];
    while (pending.length) {
      // eslint-disable-next-line no-await-in-loop -- une requête par niveau de parents
      const parents = await this.prisma.componentComponent.findMany({
        where: { childId: { in: pending } },
        select: { parentId: true },
      });
      pending = parents.map((p) => p.parentId).filter((id) => !all.has(id));
      pending.forEach((id) => all.add(id));
    }
    return [...all];
  }

  /** Menu items donnés + tous leurs parents de combo, niveau par niveau. */
  private async withAncestorItems(seed: string[]): Promise<string[]> {
    const all = new Set(seed);
    let pending = [...all];
    while (pending.length) {
      // eslint-disable-next-line no-await-in-loop -- une requête par niveau de combos
      const parents = await this.prisma.menuItemCombo.findMany({
        where: { childId: { in: pending } },
        select: { parentId: true },
      });
      pending = parents.map((p) => p.parentId).filter((id) => !all.has(id));
      pending.forEach((id) => all.add(id));
    }
    return [...all];
  }
}
