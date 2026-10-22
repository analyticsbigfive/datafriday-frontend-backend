import { Module } from '@nestjs/common';
import { MenuComponentsController } from './menu-components.controller';
import { ComponentTaxonomyService } from './component-taxonomy.service';
import {
  ComponentTypesController,
  ComponentCategoriesController,
} from './component-taxonomy.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { MenuComponentCostService } from './services/menu-component-cost.service';
import { MenuComponentValidationService } from './services/menu-component-validation.service';
import { MenuComponentItemPropagationService } from './services/menu-component-item-propagation.service';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { MenuComponentsService } from './menu-components.service';

@Module({
  imports: [PrismaModule, MenuItemsModule],
  controllers: [MenuComponentsController, ComponentTypesController, ComponentCategoriesController],
  providers: [ ComponentTaxonomyService,
    MenuComponentValidationService,
    MenuComponentCostService,
    MenuComponentItemPropagationService,
    MenuComponentsService,
  ],
  exports: [ ComponentTaxonomyService,
    MenuComponentsService,
    MenuComponentCostService,
    MenuComponentItemPropagationService,
  ],
})
export class MenuComponentsModule {}
