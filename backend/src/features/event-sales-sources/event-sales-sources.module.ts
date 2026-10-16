import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { EventSalesSourceService } from './event-sales-source.service';

/** Module feuille : dépend de Prisma seulement (interface 1 du plan POS, section 5 bis). */
@Module({
  imports: [PrismaModule],
  providers: [EventSalesSourceService],
  exports: [EventSalesSourceService],
})
export class EventSalesSourcesModule {}
