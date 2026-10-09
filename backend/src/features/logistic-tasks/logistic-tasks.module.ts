import { Module } from '@nestjs/common';
import { LogisticTasksController } from './logistic-tasks.controller';
import { LogisticTasksService } from './logistic-tasks.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // LogisticsModule exporte StockMovementService (createMovement/confirmTransfer) : pickup()/
  // drop() délèguent au lieu de dupliquer le ledger StockMovement. NotificationsModule :
  // signal « nouvelle notification » relayé par le flux SSE global.
  imports: [PrismaModule, LogisticsModule, NotificationsModule],
  controllers: [LogisticTasksController],
  providers: [LogisticTasksService],
})
export class LogisticTasksModule {}
