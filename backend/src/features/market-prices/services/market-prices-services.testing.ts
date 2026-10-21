import { MarketPriceQueryService } from './market-price-query.service';
import { MarketPriceRecipeSyncService } from './market-price-recipe-sync.service';
import { MarketPriceCostPropagationService } from './market-price-cost-propagation.service';
import { MarketPricesService } from '../market-prices.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createMarketPricesServices(deps: { prisma?: any; spaceAccess?: any; storage?: any; componentCost?: any; menuItemCost?: any }) {
  const marketPriceQueryService = new MarketPriceQueryService(deps.prisma, deps.spaceAccess);
  const marketPriceRecipeSyncService = new MarketPriceRecipeSyncService(deps.prisma);
  const costPropagation = new MarketPriceCostPropagationService(
    deps.prisma,
    deps.componentCost ?? { refreshCosts: async () => ({}) },
    deps.menuItemCost ?? { refreshCosts: async () => ({}), refreshComboCost: async () => 0 },
  );
  const marketPricesService = new MarketPricesService(deps.prisma, deps.storage, marketPriceQueryService, marketPriceRecipeSyncService, costPropagation);
  return { marketPriceQueryService, marketPriceRecipeSyncService, marketPricesService, costPropagation };
}
