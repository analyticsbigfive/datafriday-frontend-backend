import { Module } from '@nestjs/common';
import { MappingsController } from './mappings.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { SpacesModule } from '../spaces/spaces.module';
import { PricingModule } from '../../shared/pricing/pricing.module';
import { LocationMappingService } from './services/location-mapping.service';
import { MappingProgressService } from './services/mapping-progress.service';
import { MappingSupportService } from './services/mapping-support.service';
import { MerchantMappingService } from './services/merchant-mapping.service';
import { ProductMappingService } from './services/product-mapping.service';

@Module({
  imports: [PrismaModule, SpacesModule, PricingModule],
  controllers: [MappingsController],
  providers: [
    MappingSupportService,
    LocationMappingService,
    MerchantMappingService,
    ProductMappingService,
    MappingProgressService,
  ],
  exports: [
    MappingProgressService,
  ],
})
export class MappingsModule {}
