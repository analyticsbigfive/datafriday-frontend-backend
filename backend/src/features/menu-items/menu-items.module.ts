import { Module } from '@nestjs/common';
import { MenuItemsController, ProductTypesController, ProductCategoriesController } from './menu-items.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { PricingModule } from '../../shared/pricing/pricing.module';
import { MenuItemCompositionService } from './services/menu-item-composition.service';
import { MenuItemCostService } from './services/menu-item-cost.service';
import { MenuItemRecipeService } from './services/menu-item-recipe.service';
import { MenuItemSupportService } from './services/menu-item-support.service';
import { MenuItemWeezeventPriceService } from './services/menu-item-weezevent-price.service';
import { ProductTaxonomyService } from './services/product-taxonomy.service';
import { MenuItemBulkCreateService } from './services/menu-item-bulk-create.service';
import { MenuItemCommandService } from './services/menu-item-command.service';
import { MenuItemQueryService } from './services/menu-item-query.service';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [MenuItemsController, ProductTypesController, ProductCategoriesController],
  providers: [
    MenuItemSupportService,
    MenuItemCostService,
    
    MenuItemRecipeService,
    MenuItemCompositionService,
    MenuItemWeezeventPriceService,
    ProductTaxonomyService,
    MenuItemQueryService,
    MenuItemCommandService,
    MenuItemBulkCreateService,
  ],
  exports: [
    MenuItemRecipeService,
  ],
})
export class MenuItemsModule {}
