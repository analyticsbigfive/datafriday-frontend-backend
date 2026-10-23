import { Module } from '@nestjs/common';
import { IngredientsService } from './ingredients.service';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { MenuComponentsModule } from '../menu-components/menu-components.module';
import { IngredientsController } from './ingredients.controller';

@Module({
  imports: [MenuComponentsModule, MenuItemsModule],
  controllers: [IngredientsController],
  providers: [IngredientsService],
  exports: [IngredientsService],
})
export class IngredientsModule {}
