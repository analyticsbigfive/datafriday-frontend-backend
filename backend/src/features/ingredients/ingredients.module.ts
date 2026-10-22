import { Module } from '@nestjs/common';
import { IngredientsService } from './ingredients.service';
import { MenuComponentsModule } from '../menu-components/menu-components.module';
import { IngredientsController } from './ingredients.controller';

@Module({
  imports: [MenuComponentsModule],
  controllers: [IngredientsController],
  providers: [IngredientsService],
  exports: [IngredientsService],
})
export class IngredientsModule {}
