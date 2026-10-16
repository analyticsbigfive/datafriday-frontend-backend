import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { GuestPinAccessModule } from '../../guest-pin-access/guest-pin-access.module';
import { PosModule } from '../pos.module';
import { PosConfigController } from './pos-config.controller';
import { PosEventsService } from './pos-events.service';
import { PosPdvReaderService } from './pos-pdv-reader.service';
import { PosSalesSummaryService } from './pos-sales-summary.service';
import { PosSettingsService } from './pos-settings.service';

/** Endpoints staff de l'outil POS. PosModule fournit PosSalesQueryService (Backend A). */
@Module({
  imports: [PrismaModule, GuestPinAccessModule, PosModule],
  controllers: [PosConfigController],
  providers: [PosEventsService, PosSettingsService, PosPdvReaderService, PosSalesSummaryService],
})
export class PosConfigModule {}
