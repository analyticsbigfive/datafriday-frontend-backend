import { Module } from '@nestjs/common';
import { PromotionTypesController } from './promotion-types.controller';
import { PromotionTypesService } from './promotion-types.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PromotionTypesController],
  providers: [PromotionTypesService],
  exports: [PromotionTypesService],
})
export class PromotionTypesModule {}
