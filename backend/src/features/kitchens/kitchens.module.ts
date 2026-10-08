import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { KitchensController } from './kitchens.controller';
import { KitchensService } from './kitchens.service';

@Module({
  imports: [PrismaModule],
  controllers: [KitchensController],
  providers: [KitchensService],
  exports: [KitchensService],
})
export class KitchensModule {}
