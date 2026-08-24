import { Module } from '@nestjs/common';
import { LogisticTasksController } from './logistic-tasks.controller';
import { LogisticTasksService } from './logistic-tasks.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  // LogisticsModule exporte LogisticsService (createMovement/confirmTransfer) : pickup()/
  // drop() délèguent au lieu de dupliquer le ledger StockMovement.
  imports: [PrismaModule, LogisticsModule],
  controllers: [LogisticTasksController],
  providers: [LogisticTasksService],
})
export class LogisticTasksModule {}
