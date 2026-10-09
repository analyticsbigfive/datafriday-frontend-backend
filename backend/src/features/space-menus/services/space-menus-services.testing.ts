import { SpaceMenuScopeService } from './space-menu-scope.service';
import { ShopMenuService } from './shop-menu.service';
import { ShopStockInventoryService } from './shop-stock-inventory.service';
import { SpaceMenuAvailabilityService } from './space-menu-availability.service';
import { SpaceMenuConfigurationService } from './space-menu-configuration.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createSpaceMenusServices(deps: { prisma?: any; pricing?: any; spaceAccess?: any; redis?: any }) {
  const spaceMenuScopeService = new SpaceMenuScopeService();
  const shopMenuService = new ShopMenuService(deps.prisma, deps.pricing, deps.spaceAccess, spaceMenuScopeService);
  const shopStockInventoryService = new ShopStockInventoryService(deps.prisma, deps.spaceAccess, spaceMenuScopeService);
  const spaceMenuAvailabilityService = new SpaceMenuAvailabilityService(deps.prisma, deps.pricing, deps.spaceAccess, spaceMenuScopeService);
  const spaceMenuConfigurationService = new SpaceMenuConfigurationService(deps.prisma, deps.redis);
  return { spaceMenuScopeService, shopMenuService, shopStockInventoryService, spaceMenuAvailabilityService, spaceMenuConfigurationService };
}
