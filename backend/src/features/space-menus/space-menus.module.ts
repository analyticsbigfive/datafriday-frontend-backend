import { Module } from '@nestjs/common';
import { SpaceMenusController } from './space-menus.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { PricingModule } from '../../shared/pricing/pricing.module';
import { ShopMenuService } from './services/shop-menu.service';
import { ShopStockInventoryService } from './services/shop-stock-inventory.service';
import { SpaceMenuAvailabilityService } from './services/space-menu-availability.service';
import { SpaceMenuConfigurationService } from './services/space-menu-configuration.service';
import { SpaceMenuScopeService } from './services/space-menu-scope.service';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [SpaceMenusController],
  providers: [
    SpaceMenuScopeService,
    ShopMenuService,
    SpaceMenuAvailabilityService,
    ShopStockInventoryService,
    SpaceMenuConfigurationService,
  ],
  // Catalogue invité d'un stockage (GuestPinAccessModule) : PdV de la config et leurs articles.
  exports: [SpaceMenuConfigurationService],
})
export class SpaceMenusModule {}
