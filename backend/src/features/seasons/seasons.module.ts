import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { SeasonsService } from './seasons.service';
import { SeasonsController } from './seasons.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
