import { BuilderV2SupportService } from './builder-v2-support.service';
import { BuilderV2ConfigurationService } from './builder-v2-configuration.service';
import { BuilderV2ElementSettingsService } from './builder-v2-element-settings.service';
import { BuilderV2ElementService } from './builder-v2-element.service';
import { BuilderV2ZoneService } from './builder-v2-zone.service';

/** Instancie les services du dossier pour les tests unitaires (dépendances externes fournies par le test). */
export function createBuilderV2Services(deps: { prisma?: any; spaceCacheService?: any; spaceAccess?: any; staffingCalculator?: any; storage?: any }) {
  const builderV2SupportService = new BuilderV2SupportService(deps.prisma, deps.spaceCacheService, deps.spaceAccess);
  const builderV2ConfigurationService = new BuilderV2ConfigurationService(deps.prisma, builderV2SupportService);
  const builderV2ElementSettingsService = new BuilderV2ElementSettingsService(deps.prisma, deps.staffingCalculator, builderV2SupportService);
  const builderV2ElementService = new BuilderV2ElementService(deps.prisma, deps.storage, deps.spaceAccess, builderV2SupportService);
  const builderV2ZoneService = new BuilderV2ZoneService(deps.prisma, deps.spaceAccess, builderV2SupportService);
  return { builderV2SupportService, builderV2ConfigurationService, builderV2ElementSettingsService, builderV2ElementService, builderV2ZoneService };
}
