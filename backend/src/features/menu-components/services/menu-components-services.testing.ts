import { MenuComponentCostService } from './menu-component-cost.service';
import { MenuComponentValidationService } from './menu-component-validation.service';
import { MenuComponentItemPropagationService } from './menu-component-item-propagation.service';
import { MenuComponentsService } from '../menu-components.service';
import type { SpaceAccessService } from '../../../core/auth/space-access.service';
import type { SupabaseStorageService } from '../../../core/supabase/supabase-storage.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createMenuComponentsServices(deps: {
  prisma?: any;
  redis?: any;
  spaceAccess?: SpaceAccessService;
  storage?: SupabaseStorageService;
  itemPropagation?: Pick<MenuComponentItemPropagationService, 'propagate'>;
}) {
  const menuComponentCostService = new MenuComponentCostService(deps.prisma);
  const menuComponentValidationService = new MenuComponentValidationService(deps.prisma);
  const menuComponentsService = new MenuComponentsService(
    deps.prisma,
    deps.redis,
    deps.spaceAccess,
    deps.storage ?? ({ resolveImage: async (v: unknown) => v } as unknown as SupabaseStorageService),
    menuComponentCostService,
    menuComponentValidationService,
    (deps.itemPropagation ?? { propagate: async () => ({ components: 0, menuItems: 0 }) }) as MenuComponentItemPropagationService,
  );
  return { menuComponentCostService, menuComponentValidationService, menuComponentsService };
}
