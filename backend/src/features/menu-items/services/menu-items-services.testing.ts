import { MenuItemSupportService } from '././menu-item-support.service';
import { MenuItemBulkCreateService } from '././menu-item-bulk-create.service';
import { MenuItemCostService } from '././menu-item-cost.service';
import { MenuItemQueryService } from '././menu-item-query.service';
import { MenuItemCommandService } from '././menu-item-command.service';
import { MenuItemCompositionService } from '././menu-item-composition.service';
import { MenuItemRecipeService } from '././menu-item-recipe.service';
import { MenuItemWeezeventPriceService } from '././menu-item-weezevent-price.service';
import { ProductTaxonomyService } from '././product-taxonomy.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createMenuItemsServices(deps: { prisma?: any; redis?: any; pricing?: any; storage?: any; spaceAccess?: any }) {
  const menuItemSupportService = new MenuItemSupportService(deps.prisma, deps.redis, deps.pricing);
  const menuItemBulkCreateService = new MenuItemBulkCreateService(deps.prisma, deps.storage, menuItemSupportService);
  const menuItemCostService = new MenuItemCostService(deps.prisma, menuItemSupportService);
  const menuItemQueryService = new MenuItemQueryService(deps.prisma, deps.redis, deps.spaceAccess, menuItemSupportService);
  const menuItemCommandService = new MenuItemCommandService(deps.prisma, deps.storage, menuItemCostService, menuItemSupportService, menuItemQueryService);
  const menuItemCompositionService = new MenuItemCompositionService(deps.prisma, menuItemCostService, menuItemQueryService, menuItemSupportService);
  const menuItemRecipeService = new MenuItemRecipeService(deps.prisma, deps.spaceAccess, menuItemSupportService);
  const menuItemWeezeventPriceService = new MenuItemWeezeventPriceService(deps.prisma, deps.pricing, deps.spaceAccess, menuItemQueryService, menuItemSupportService);
  const productTaxonomyService = new ProductTaxonomyService(deps.prisma);
  return { menuItemSupportService, menuItemBulkCreateService, menuItemCostService, menuItemQueryService, menuItemCommandService, menuItemCompositionService, menuItemRecipeService, menuItemWeezeventPriceService, productTaxonomyService };
}
