import { InventoryUnitResolverService } from './inventory-unit-resolver.service';
import { InventoryBaselineService } from './inventory-baseline.service';
import { InventoryCountService } from './inventory-count.service';
import { InventoryLogisticPushService } from './inventory-logistic-push.service';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createInventoryServices(deps: { prisma?: any; stockItemIdentityService?: any; stockLevelService?: any; spaceAccess?: any; stockReconciliationService?: any }) {
  const inventoryUnitResolverService = new InventoryUnitResolverService(deps.prisma);
  const inventoryBaselineService = new InventoryBaselineService(deps.prisma, deps.stockItemIdentityService, deps.stockLevelService, deps.spaceAccess, inventoryUnitResolverService);
  const inventoryCountService = new InventoryCountService(deps.prisma, deps.spaceAccess);
  const inventoryLogisticPushService = new InventoryLogisticPushService(deps.prisma, deps.stockReconciliationService, deps.spaceAccess, inventoryCountService, inventoryUnitResolverService, deps.stockLevelService);
  const inventoryReconciliationService = new InventoryReconciliationService(deps.prisma, deps.spaceAccess, inventoryBaselineService, inventoryCountService, inventoryLogisticPushService, inventoryUnitResolverService);
  return { inventoryUnitResolverService, inventoryBaselineService, inventoryCountService, inventoryLogisticPushService, inventoryReconciliationService };
}
