import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LogisticsController],
  providers: [LogisticsService],
  // Exporté pour SpacesModule (Live Inventory, LIVE_API_GUIDE.md §3) — aucun cycle, ni
  // LogisticsModule ni ses dépendances n'importent SpacesModule.
  exports: [LogisticsService],
})
export class LogisticsModule {}
