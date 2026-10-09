import { MarketPriceQueryService } from './market-price-query.service';
import { MarketPriceRecipeSyncService } from './market-price-recipe-sync.service';
import { MarketPricesService } from '../market-prices.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createMarketPricesServices(deps: { prisma?: any; spaceAccess?: any; storage?: any }) {
  const marketPriceQueryService = new MarketPriceQueryService(deps.prisma, deps.spaceAccess);
  const marketPriceRecipeSyncService = new MarketPriceRecipeSyncService(deps.prisma);
  const marketPricesService = new MarketPricesService(deps.prisma, deps.storage, marketPriceQueryService, marketPriceRecipeSyncService);
  return { marketPriceQueryService, marketPriceRecipeSyncService, marketPricesService };
}
