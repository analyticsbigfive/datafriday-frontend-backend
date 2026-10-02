import { MenuComponentCostService } from './menu-component-cost.service';
import { MenuComponentValidationService } from './menu-component-validation.service';
import { MenuComponentsService } from '../menu-components.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createMenuComponentsServices(deps: { prisma?: any; redis?: any; spaceAccess?: any; storage?: any }) {
  const menuComponentCostService = new MenuComponentCostService(deps.prisma);
  const menuComponentValidationService = new MenuComponentValidationService(deps.prisma);
  const menuComponentsService = new MenuComponentsService(
    deps.prisma,
    deps.redis,
    deps.spaceAccess,
    deps.storage ?? { resolveImage: async (v: unknown) => v },
    menuComponentCostService,
    menuComponentValidationService,
  );
  return { menuComponentCostService, menuComponentValidationService, menuComponentsService };
}
