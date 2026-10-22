import { Injectable, Logger } from '@nestjs/common';
import { withAncestorComponents, withAncestorItems } from '../../../shared/cost-propagation/cost-ancestry';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemCostService } from '../../menu-items/services/menu-item-cost.service';
import { CostSnapshotReason, MenuItemCostSnapshotService } from '../../menu-items/services/menu-item-cost-snapshot.service';
import { MenuComponentCostService } from './menu-component-cost.service';

/** Articles recalculés par passe : borne les transactions et la mémoire d'un composant très utilisé. */
const ITEM_CHUNK_SIZE = 200;

/**
 * Répercute l'édition d'un composant sur les articles qui l'utilisent (directement, via un
 * composant parent ou via un combo), puis enregistre un snapshot `component_edit` par article
 * dont le coût a réellement changé. Même patron que MarketPriceCostPropagationService.
 *
 * Jamais bloquant : l'édition du composant est déjà persistée, un échec est loggué et un refresh
 * global reste possible. Les appelants ne l'attendent pas (`void`).
 */
@Injectable()
export class MenuComponentItemPropagationService {
  constructor(
    private prisma: PrismaService,
    private readonly componentCostService: MenuComponentCostService,
    private readonly menuItemCostService: MenuItemCostService,
    private readonly costSnapshotService: MenuItemCostSnapshotService,
  ) {}

  private readonly logger = new Logger(MenuComponentItemPropagationService.name);

  async propagate(componentId: string, tenantId: string): Promise<{ components: number; menuItems: number }> {
    try {
      // Le composant lui-même est déjà rafraîchi par l'appelant ; ses parents doivent l'être
      // pour que les articles qui les utilisent lisent un coût à jour.
      const ancestorIds = (await withAncestorComponents(this.prisma, [componentId])).filter((id) => id !== componentId);
      if (ancestorIds.length) {
        await this.componentCostService.refreshCosts(tenantId, { componentIds: ancestorIds });
      }
      const componentIds = [componentId, ...ancestorIds];

      const lines = await this.prisma.menuItemComponent.findMany({
        where: { componentId: { in: componentIds }, menuItem: { tenantId, deletedAt: null } },
        select: { menuItemId: true },
      });
      const itemIds = await withAncestorItems(this.prisma, [...new Set(lines.map((l) => l.menuItemId))]);
      if (!itemIds.length) return { components: componentIds.length, menuItems: 0 };

      await this.refreshItemsAndSnapshot(tenantId, itemIds, 'component_edit', { componentId });
      this.logger.log(`Component cost propagation: component ${componentId} -> ${componentIds.length} component(s), ${itemIds.length} menu item(s)`);
      return { components: componentIds.length, menuItems: itemIds.length };
    } catch (error) {
      this.logger.warn(`Component cost propagation failed for ${componentId}: ${error?.message}`);
      return { components: 0, menuItems: 0 };
    }
  }

  /**
   * Édition directe d'un ingrédient ou d'un emballage : rafraîchit les composants qui utilisent
   * les ingrédients (et leurs parents), puis les articles concernés (ligne ingrédient, ligne
   * emballage, via composant, parents de combo) et enregistre le snapshot. Jamais bloquant.
   */
  async propagateFromBricks(
    bricks: { ingredientIds?: string[]; packagingIds?: string[] },
    tenantId: string,
    reason: 'ingredient_edit' | 'packaging_edit',
    sourceRef: Record<string, unknown>,
  ): Promise<{ components: number; menuItems: number }> {
    const ingredientIds = [...new Set((bricks.ingredientIds ?? []).filter(Boolean))];
    const packagingIds = [...new Set((bricks.packagingIds ?? []).filter(Boolean))];
    if (!ingredientIds.length && !packagingIds.length) return { components: 0, menuItems: 0 };
    try {
      const directComponents = ingredientIds.length
        ? await this.prisma.componentIngredient.findMany({
            where: { ingredientId: { in: ingredientIds }, component: { tenantId, deletedAt: null } },
            select: { componentId: true },
          })
        : [];
      const componentIds = await withAncestorComponents(this.prisma, [...new Set(directComponents.map((c) => c.componentId))]);
      if (componentIds.length) {
        await this.componentCostService.refreshCosts(tenantId, { componentIds });
      }

      const itemScope = { menuItem: { tenantId, deletedAt: null } };
      const [viaIngredient, viaPackaging, viaComponent] = await Promise.all([
        ingredientIds.length
          ? this.prisma.menuItemIngredient.findMany({ where: { ingredientId: { in: ingredientIds }, ...itemScope }, select: { menuItemId: true } })
          : [],
        packagingIds.length
          ? this.prisma.menuItemPackaging.findMany({ where: { packagingId: { in: packagingIds }, ...itemScope }, select: { menuItemId: true } })
          : [],
        componentIds.length
          ? this.prisma.menuItemComponent.findMany({ where: { componentId: { in: componentIds }, ...itemScope }, select: { menuItemId: true } })
          : [],
      ]);
      const directItems = [...new Set([...viaIngredient, ...viaPackaging, ...viaComponent].map((l) => l.menuItemId))];
      const itemIds = await withAncestorItems(this.prisma, directItems);
      if (itemIds.length) await this.refreshItemsAndSnapshot(tenantId, itemIds, reason, sourceRef);
      this.logger.log(`Brick cost propagation (${reason}): ${componentIds.length} component(s), ${itemIds.length} menu item(s)`);
      return { components: componentIds.length, menuItems: itemIds.length };
    } catch (error) {
      this.logger.warn(`Brick cost propagation (${reason}) failed: ${error?.message}`);
      return { components: 0, menuItems: 0 };
    }
  }

  /** Recalcule les articles par lots, la part combo des parents de combo, puis un seul snapshot. */
  private async refreshItemsAndSnapshot(
    tenantId: string,
    itemIds: string[],
    reason: CostSnapshotReason,
    sourceRef: Record<string, unknown>,
  ): Promise<void> {
    for (let i = 0; i < itemIds.length; i += ITEM_CHUNK_SIZE) {
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      await this.menuItemCostService.refreshCosts(tenantId, { itemIds: itemIds.slice(i, i + ITEM_CHUNK_SIZE), skipSnapshot: true });
    }
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
    // Un seul passage après la part combo, pour ne figer aucun coût de parent de combo incomplet.
    await this.costSnapshotService.recordIfChanged(tenantId, itemIds, reason, sourceRef);
  }
}
