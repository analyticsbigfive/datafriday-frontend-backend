import { Module } from '@nestjs/common';
import { PackagingService } from './packaging.service';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { MenuComponentsModule } from '../menu-components/menu-components.module';
import { PackagingController } from './packaging.controller';

@Module({
  imports: [MenuComponentsModule, MenuItemsModule],
  controllers: [PackagingController],
  providers: [PackagingService],
  exports: [PackagingService],
})
export class PackagingModule {}
