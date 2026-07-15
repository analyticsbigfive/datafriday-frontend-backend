import { Module } from '@nestjs/common';
import { IndustrialsController } from './industrials.controller';
import { IndustrialsService } from './industrials.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IndustrialsController],
  providers: [IndustrialsService],
  exports: [IndustrialsService],
})
export class IndustrialsModule {}
