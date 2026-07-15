import { Module } from '@nestjs/common';
import { MenuComponentsService } from './menu-components.service';
import { MenuComponentsController } from './menu-components.controller';
import { ComponentTaxonomyService } from './component-taxonomy.service';
import {
  ComponentTypesController,
  ComponentCategoriesController,
} from './component-taxonomy.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MenuComponentsController, ComponentTypesController, ComponentCategoriesController],
  providers: [MenuComponentsService, ComponentTaxonomyService],
  exports: [MenuComponentsService, ComponentTaxonomyService],
})
export class MenuComponentsModule {}
