import { Module } from '@nestjs/common';
import { BuilderV2Controller } from './builder-v2.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
// SpacesModule exporte SpaceCacheService : builder-v2 réutilise son invalidation Redis
// (space_shops / space_configs / detail) pour que Space Menu et Data Integration
// voient immédiatement les mutations du builder.
import { SpacesModule } from '../spaces/spaces.module';
// Auto-remplissage Staff (2026-07-30) : réutilise StaffingCalculatorService
// (applySinkingRules/hourlyRateFrom, déjà pur et testé) — un seul moteur de
// règles Sinking RH pour la génération d'événement ET le Builder.
import { StaffingModule } from '../staffing/staffing.module';
import { BuilderV2ConfigurationService } from './services/builder-v2-configuration.service';
import { BuilderV2ElementService } from './services/builder-v2-element.service';
import { BuilderV2ElementSettingsService } from './services/builder-v2-element-settings.service';
import { BuilderV2SupportService } from './services/builder-v2-support.service';
import { BuilderV2ZoneService } from './services/builder-v2-zone.service';

@Module({
  imports: [PrismaModule, RedisModule, SpacesModule, StaffingModule],
  controllers: [BuilderV2Controller],
  providers: [
    BuilderV2SupportService,
    BuilderV2ZoneService,
    BuilderV2ElementService,
    BuilderV2ElementSettingsService,
    BuilderV2ConfigurationService,
  ],
  exports: [
    BuilderV2SupportService,
    BuilderV2ZoneService,
    BuilderV2ElementService,
    BuilderV2ElementSettingsService,
    BuilderV2ConfigurationService,
  ],
})
export class BuilderV2Module {}
